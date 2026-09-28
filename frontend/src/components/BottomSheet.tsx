/**
 * 공용 바텀 시트
 *
 * 왜 따로 만들었나 (피드백 1번 — 상단 상태바와 UI 겹침):
 * 기존 입력 시트는 키보드가 올라오면 KeyboardAvoidingView가 시트를 통째로 밀어 올려
 * 시트 윗부분이 시계·배터리 표시줄 위까지 올라갔다.
 * 여기서는 "시트 최대 높이 = 화면 높이 − 상단 안전 영역 − 키보드 높이"로 제한하고,
 * 넘치는 내용은 시트 안에서 스크롤되게 해서 어떤 기기에서도 상태바를 침범하지 않는다.
 *
 * 배경 탭 닫기: 배경을 별도 Pressable로 깔고 시트를 그 위에 둔다.
 * (시트를 Pressable로 감싸 stopPropagation 하던 방식은 안쪽 ScrollView 스크롤을 방해했다)
 */

import { useEffect, useState, type ReactNode } from "react";
import {
  Keyboard,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Colors } from "@/constants/theme";

interface BottomSheetProps {
  visible: boolean;
  onClose: () => void;
  title: string;
  colors: typeof Colors.light;
  children: ReactNode;
  /** 스크롤 영역 아래에 항상 보이는 영역 (예: 저장 버튼) */
  footer?: ReactNode;
}

/** iOS 키보드 높이 — Android는 시스템이 창 크기를 줄여 주므로 0으로 둔다 */
function useKeyboardHeight(): number {
  const [height, setHeight] = useState(0);
  useEffect(() => {
    if (Platform.OS !== "ios") return;
    const show = Keyboard.addListener("keyboardWillShow", (e) => setHeight(e.endCoordinates.height));
    const hide = Keyboard.addListener("keyboardWillHide", () => setHeight(0));
    return () => { show.remove(); hide.remove(); };
  }, []);
  return height;
}

export function BottomSheet({ visible, onClose, title, colors, children, footer }: BottomSheetProps) {
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();
  const keyboard = useKeyboardHeight();

  // 상태바 아래로 최소 12pt 여유를 두고, 키보드가 차지한 만큼 더 줄인다
  const maxHeight = windowHeight - insets.top - 12 - keyboard;
  // 키보드가 없을 때만 홈 인디케이터(하단 안전 영역)만큼 여백을 둔다
  const bottomPad = keyboard > 0 ? 12 : Math.max(insets.bottom, 12) + 8;

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.overlay}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="닫기" />
        <View
          style={[
            styles.sheet,
            { backgroundColor: colors.background, maxHeight, marginBottom: keyboard, paddingBottom: bottomPad },
          ]}
        >
          <View style={[styles.handle, { backgroundColor: colors.separator }]} />
          <View style={styles.header}>
            <Text style={[styles.title, { color: colors.text }]}>{title}</Text>
            <TouchableOpacity onPress={onClose} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
              <Text style={[styles.close, { color: colors.subtext }]}>✕</Text>
            </TouchableOpacity>
          </View>
          <ScrollView
            style={styles.scroll}
            contentContainerStyle={styles.scrollContent}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {children}
          </ScrollView>
          {footer ? <View style={styles.footer}>{footer}</View> : null}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: "flex-end", backgroundColor: "#00000060" },
  sheet: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 24,
    paddingTop: 10,
  },
  handle: { width: 36, height: 4, borderRadius: 2, alignSelf: "center", marginBottom: 10 },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 8 },
  title: { fontSize: 18, fontWeight: "700" },
  close: { fontSize: 18, padding: 4 },
  // flexShrink: 내용이 길면 스크롤 영역이 줄어들고, 짧으면 내용 높이만큼만 차지한다
  scroll: { flexShrink: 1 },
  scrollContent: { gap: 8, paddingBottom: 4 },
  footer: { paddingTop: 12 },
});
