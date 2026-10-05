/**
 * 뉴스 필터 시트 — 카테고리 설정
 *
 * 보고 싶은 카테고리만 켜고, 오른쪽 ≡ 손잡이를 잡고 위아래로 끌어 칩 순서를 정한다.
 * 놓는 순간 저장된다. 켜진 카테고리가 위, 꺼진 카테고리가 아래에 모인다. 최소 하나는 켜 두어야 한다.
 *
 * 끌어서 옮기기는 PanResponder(React Native 기본 기능)로 구현했다.
 * 줄 높이를 고정해 두었기 때문에 "손가락이 움직인 거리 ÷ 줄 높이"만으로
 * 몇 칸 옮겼는지 계산할 수 있어, 각 줄의 위치를 따로 측정할 필요가 없다.
 */

import { useRef, useState } from "react";
import { Animated, PanResponder, StyleSheet, TouchableOpacity, View } from "react-native";

import { Colors } from "@/constants/theme";
import { NEWS_CATEGORIES, type NewsCategory } from "@/src/api/news";
import { Text, useFontScale } from "@/src/components/AppText";
import { BottomSheet } from "@/src/components/BottomSheet";
import { useSettingsStore } from "@/src/store/settingsStore";

const LABEL = Object.fromEntries(NEWS_CATEGORIES.map((c) => [c.value, c.label])) as Record<NewsCategory, string>;

const BASE_ROW_HEIGHT = 50;

const clamp = (n: number, min: number, max: number) => Math.min(Math.max(n, min), max);

interface DragCallbacks {
  onStart: () => void;
  onMove: (dy: number) => void;
  onEnd: () => void;
}

/**
 * 켜진 카테고리 한 줄 — 손잡이에만 끌기 제스처를 건다 (줄 전체에 걸면 체크박스를 누르기 어렵다).
 * PanResponder는 한 번만 만들고 최신 콜백은 ref로 읽는다 — 끄는 도중 다시 만들어지면 제스처가 끊긴다.
 */
function DraggableRow({ label, rowHeight, canToggle, onToggle, drag, dragging, offset, colors }: {
  label: string;
  rowHeight: number;
  canToggle: boolean;
  onToggle: () => void;
  drag: DragCallbacks;
  dragging: boolean;               // 지금 이 줄을 끌고 있는지
  offset: number | Animated.Value; // 끄는 줄은 손가락을 따라가는 값, 나머지는 비켜 주는 거리
  colors: typeof Colors.light;
}) {
  const dragRef = useRef(drag);
  dragRef.current = drag;
  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onPanResponderGrant: () => dragRef.current.onStart(),
      onPanResponderMove: (_, g) => dragRef.current.onMove(g.dy),
      onPanResponderRelease: () => dragRef.current.onEnd(),
      // 다른 제스처에 빼앗겨도 끌던 줄이 공중에 남지 않도록 같은 방식으로 마무리한다
      onPanResponderTerminate: () => dragRef.current.onEnd(),
      onPanResponderTerminationRequest: () => false,
    }),
  ).current;

  return (
    <Animated.View
      style={[
        styles.row,
        { height: rowHeight, borderBottomColor: colors.separator, transform: [{ translateY: offset }] },
        dragging && [styles.dragging, { backgroundColor: colors.card, borderColor: colors.tint }],
      ]}
    >
      <TouchableOpacity
        style={styles.toggleArea}
        onPress={onToggle}
        disabled={!canToggle}
        accessibilityRole="checkbox"
        accessibilityState={{ checked: true }}
      >
        <View style={[styles.checkbox, { borderColor: colors.tint, backgroundColor: colors.tint }]}>
          <Text style={styles.check}>✓</Text>
        </View>
        <Text style={[styles.label, { color: colors.text }]} numberOfLines={1}>{label}</Text>
      </TouchableOpacity>
      <View {...pan.panHandlers} style={styles.grip} accessibilityLabel={`${label} 순서 바꾸기, 잡고 위아래로 끌기`}>
        {[0, 1, 2].map((i) => (
          <View key={i} style={[styles.gripLine, { backgroundColor: dragging ? colors.tint : colors.subtext }]} />
        ))}
      </View>
    </Animated.View>
  );
}

export function NewsCategorySheet({ visible, onClose, colors }: {
  visible: boolean;
  onClose: () => void;
  colors: typeof Colors.light;
}) {
  const { newsCategories: enabled, setNewsCategories } = useSettingsStore();
  const disabled = NEWS_CATEGORIES.map((c) => c.value).filter((v) => !enabled.includes(v));

  // 글자가 커지면 줄도 같이 높여 글자가 잘리지 않게 한다
  const rowHeight = Math.round(BASE_ROW_HEIGHT * useFontScale());

  // 끄는 중인 줄: from = 원래 자리, to = 지금 놓으면 들어갈 자리
  const [drag, setDrag] = useState<{ from: number; to: number } | null>(null);
  const dragY = useRef(new Animated.Value(0)).current;
  // 콜백은 PanResponder 안에서 늦게 불리므로 최신 값을 ref로도 들고 있는다
  const dragRef = useRef(drag);
  dragRef.current = drag;

  const toggle = (cat: NewsCategory) => {
    if (enabled.includes(cat)) {
      if (enabled.length > 1) setNewsCategories(enabled.filter((c) => c !== cat));
    } else {
      setNewsCategories([...enabled, cat]);   // 새로 켠 카테고리는 맨 뒤에 붙인다
    }
  };

  const callbacksFor = (index: number): DragCallbacks => ({
    onStart: () => {
      dragY.setValue(0);
      dragRef.current = { from: index, to: index };
      setDrag(dragRef.current);
    },
    onMove: (dy) => {
      // 켜진 목록의 맨 위·맨 아래를 넘어가지 않게 막는다
      const limited = clamp(dy, -index * rowHeight, (enabled.length - 1 - index) * rowHeight);
      dragY.setValue(limited);
      const to = index + Math.round(limited / rowHeight);
      if (dragRef.current && dragRef.current.to !== to) {
        dragRef.current = { from: index, to };
        setDrag(dragRef.current);
      }
    },
    onEnd: () => {
      const cur = dragRef.current;
      dragRef.current = null;
      setDrag(null);
      dragY.setValue(0);
      if (!cur || cur.from === cur.to) return;
      const next = [...enabled];
      const [moved] = next.splice(cur.from, 1);
      next.splice(cur.to, 0, moved);
      setNewsCategories(next);
    },
  });

  /** 끄는 줄이 지나간 자리의 줄들은 한 칸씩 비켜 준다 */
  const shiftFor = (index: number): number => {
    if (!drag) return 0;
    if (drag.from < drag.to && index > drag.from && index <= drag.to) return -rowHeight;
    if (drag.to < drag.from && index >= drag.to && index < drag.from) return rowHeight;
    return 0;
  };

  return (
    // 끄는 동안에는 시트 스크롤을 잠가 목록이 손가락을 따라 같이 움직이지 않게 한다
    <BottomSheet visible={visible} onClose={onClose} title="뉴스 필터" colors={colors} scrollEnabled={!drag}>
      <Text style={[styles.hint, { color: colors.subtext }]}>보고 싶은 카테고리만 켜고, ≡ 를 잡고 끌어서 순서를 바꿀 수 있어요.</Text>
      <View>
        {enabled.map((c, i) => (
          <DraggableRow
            key={c}
            label={LABEL[c]}
            rowHeight={rowHeight}
            canToggle={enabled.length > 1 && !drag}
            onToggle={() => toggle(c)}
            drag={callbacksFor(i)}
            dragging={drag?.from === i}
            offset={drag?.from === i ? dragY : shiftFor(i)}
            colors={colors}
          />
        ))}
        {disabled.map((c) => (
          <View key={c} style={[styles.row, { height: rowHeight, borderBottomColor: colors.separator }]}>
            <TouchableOpacity
              style={styles.toggleArea}
              onPress={() => toggle(c)}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: false }}
            >
              <View style={[styles.checkbox, { borderColor: colors.separator }]} />
              <Text style={[styles.label, { color: colors.subtext }]} numberOfLines={1}>{LABEL[c]}</Text>
            </TouchableOpacity>
          </View>
        ))}
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  hint: { fontSize: 12, lineHeight: 17, marginBottom: 4 },
  row: { flexDirection: "row", alignItems: "center", borderBottomWidth: StyleSheet.hairlineWidth },
  // 끄는 줄은 다른 줄 위에 떠 보이게 한다 (zIndex는 iOS, elevation은 Android에서 겹침 순서를 정한다)
  dragging: {
    zIndex: 1, elevation: 6, borderWidth: 1.5, borderBottomWidth: 1.5, borderRadius: 12, paddingHorizontal: 8, marginHorizontal: -8,
    shadowColor: "#000", shadowOpacity: 0.18, shadowRadius: 10, shadowOffset: { width: 0, height: 6 },
  },
  toggleArea: { flex: 1, flexDirection: "row", alignItems: "center", gap: 12, alignSelf: "stretch" },
  checkbox: { width: 22, height: 22, borderRadius: 6, borderWidth: 1.5, alignItems: "center", justifyContent: "center" },
  check: { color: "#fff", fontSize: 13, fontWeight: "700" },
  label: { flexShrink: 1, fontSize: 15, fontWeight: "500" },
  // 손잡이는 손가락으로 잡기 쉽게 넉넉한 크기로 둔다
  grip: { width: 44, alignSelf: "stretch", alignItems: "center", justifyContent: "center", gap: 4 },
  gripLine: { width: 18, height: 2, borderRadius: 1 },
});
