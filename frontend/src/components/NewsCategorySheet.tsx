/**
 * 뉴스 카테고리 설정 시트 (수정 3번)
 *
 * 보고 싶은 카테고리만 켜고, ↑↓로 칩 순서를 정한다. 바꾸는 즉시 저장된다.
 * 켜진 카테고리가 위, 꺼진 카테고리가 아래에 모인다. 최소 하나는 켜 두어야 한다.
 */

import { StyleSheet, Text, TouchableOpacity, View } from "react-native";

import { Colors } from "@/constants/theme";
import { NEWS_CATEGORIES, type NewsCategory } from "@/src/api/news";
import { BottomSheet } from "@/src/components/BottomSheet";
import { useSettingsStore } from "@/src/store/settingsStore";

const LABEL = Object.fromEntries(NEWS_CATEGORIES.map((c) => [c.value, c.label])) as Record<NewsCategory, string>;

export function NewsCategorySheet({ visible, onClose, colors }: {
  visible: boolean;
  onClose: () => void;
  colors: typeof Colors.light;
}) {
  const { newsCategories: enabled, setNewsCategories } = useSettingsStore();
  const disabled = NEWS_CATEGORIES.map((c) => c.value).filter((v) => !enabled.includes(v));

  const toggle = (cat: NewsCategory) => {
    if (enabled.includes(cat)) {
      if (enabled.length > 1) setNewsCategories(enabled.filter((c) => c !== cat));
    } else {
      setNewsCategories([...enabled, cat]);   // 새로 켠 카테고리는 맨 뒤에 붙인다
    }
  };

  const move = (index: number, delta: -1 | 1) => {
    const target = index + delta;
    if (target < 0 || target >= enabled.length) return;
    const next = [...enabled];
    [next[index], next[target]] = [next[target], next[index]];
    setNewsCategories(next);
  };

  const row = (cat: NewsCategory, on: boolean, index?: number) => (
    <View key={cat} style={[styles.row, { borderBottomColor: colors.separator }]}>
      <TouchableOpacity
        style={styles.toggleArea}
        onPress={() => toggle(cat)}
        disabled={on && enabled.length === 1}
        accessibilityRole="checkbox"
        accessibilityState={{ checked: on }}
      >
        <View style={[styles.checkbox, { borderColor: on ? colors.tint : colors.separator }, on && { backgroundColor: colors.tint }]}>
          {on && <Text style={styles.check}>✓</Text>}
        </View>
        <Text style={[styles.label, { color: on ? colors.text : colors.subtext }]}>{LABEL[cat]}</Text>
      </TouchableOpacity>
      {on && index !== undefined && (
        <View style={styles.arrows}>
          <TouchableOpacity onPress={() => move(index, -1)} disabled={index === 0} style={styles.arrowBtn} accessibilityLabel={`${LABEL[cat]} 위로`}>
            <Text style={[styles.arrow, { color: index === 0 ? colors.separator : colors.tint }]}>↑</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => move(index, 1)} disabled={index === enabled.length - 1} style={styles.arrowBtn} accessibilityLabel={`${LABEL[cat]} 아래로`}>
            <Text style={[styles.arrow, { color: index === enabled.length - 1 ? colors.separator : colors.tint }]}>↓</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );

  return (
    <BottomSheet visible={visible} onClose={onClose} title="뉴스 카테고리" colors={colors}>
      <Text style={[styles.hint, { color: colors.subtext }]}>보고 싶은 카테고리만 켜고, ↑↓로 순서를 바꿀 수 있어요.</Text>
      <View>
        {enabled.map((c, i) => row(c, true, i))}
        {disabled.map((c) => row(c, false))}
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  hint: { fontSize: 12, lineHeight: 17, marginBottom: 4 },
  row: { flexDirection: "row", alignItems: "center", borderBottomWidth: StyleSheet.hairlineWidth, paddingVertical: 4 },
  toggleArea: { flex: 1, flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 10 },
  checkbox: { width: 22, height: 22, borderRadius: 6, borderWidth: 1.5, alignItems: "center", justifyContent: "center" },
  check: { color: "#fff", fontSize: 13, fontWeight: "700" },
  label: { fontSize: 15, fontWeight: "500" },
  arrows: { flexDirection: "row", gap: 4 },
  arrowBtn: { paddingHorizontal: 10, paddingVertical: 6 },
  arrow: { fontSize: 18, fontWeight: "700" },
});
