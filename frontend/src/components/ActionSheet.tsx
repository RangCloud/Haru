/**
 * 선택 창 — 화면 가운데에 뜨는 작은 창
 *
 * "일정 추가 / 지출 추가 / 수입 추가", "수정 / 삭제"처럼 여러 동작 중 하나를 고르는 창.
 * 모양은 예전에 쓰던 시스템 알림창(가운데 작은 창에 버튼이 세로로 쌓인 모양)을 그대로 따른다.
 *
 * 시스템 알림창(Alert)을 그대로 쓰지 않는 이유:
 * - Android의 알림창은 버튼을 3개까지만 보여 준다. 동작 3개 + 취소를 넣으면 네 번째인 '취소'가
 *   잘려 나가 "무엇이든 하나를 골라야만 창이 닫히는" 문제가 있었다.
 * - iPhone의 알림창은 바깥을 눌러 닫는 기능이 아예 없다.
 * 이 창은 두 플랫폼에서 똑같이 ① 맨 아래 '취소' ② 바깥 영역 누르기 ③ Android 뒤로 가기 버튼으로 닫을 수 있다.
 *
 * "로그아웃할까요?"처럼 한 가지를 진행할지 묻는 확인 창은 ConfirmDialog(버튼 두 개가 나란한 창)를 쓴다.
 */

import { Modal, Pressable, StyleSheet, TouchableOpacity, View } from "react-native";

import { Colors } from "@/constants/theme";
import { Text } from "@/src/components/AppText";

export interface ActionItem {
  label: string;
  onPress: () => void;
  /** 삭제처럼 되돌릴 수 없는 동작 — 빨간 글씨로 구분한다 */
  destructive?: boolean;
}

interface ActionSheetProps {
  visible: boolean;
  onClose: () => void;
  title: string;
  /** 제목 아래 보조 설명 (예: 날짜, 일정 이름, 금액) */
  message?: string;
  actions: ActionItem[];
  colors: typeof Colors.light;
}

// 고른 동작이 또 다른 창(일정 추가 창 등)을 여는 경우가 많다.
// iOS는 창이 닫히는 도중에 새 창을 열면 새 창이 뜨지 않으므로, 닫힌 뒤에 실행한다.
const RUN_AFTER_CLOSE_MS = 250;

export function ActionSheet({ visible, onClose, title, message, actions, colors }: ActionSheetProps) {
  const run = (action: ActionItem) => {
    onClose();
    setTimeout(action.onPress, RUN_AFTER_CLOSE_MS);
  };

  return (
    // fade: 시스템 알림창처럼 제자리에서 나타났다 사라진다 (아래에서 올라오지 않는다)
    <Modal visible={visible} animationType="fade" transparent onRequestClose={onClose} statusBarTranslucent>
      <View style={styles.overlay}>
        {/* 바깥 영역 — 누르면 닫힌다. 창 뒤에 깔아 두어 창 안쪽을 누를 때는 반응하지 않는다 */}
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="닫기" />
        <View style={[styles.dialog, { backgroundColor: colors.card }]}>
          <View style={styles.body}>
            <Text style={[styles.title, { color: colors.text }]}>{title}</Text>
            {message ? <Text style={[styles.message, { color: colors.subtext }]}>{message}</Text> : null}
          </View>
          {/* 동작 버튼은 세로로 쌓고, 취소는 항상 맨 아래에 둔다 */}
          {actions.map((action) => (
            <TouchableOpacity
              key={action.label}
              onPress={() => run(action)}
              style={[styles.button, { borderTopColor: colors.separator }]}
              accessibilityRole="button"
            >
              <Text style={[styles.buttonText, { color: action.destructive ? colors.expense : colors.tint }]}>{action.label}</Text>
            </TouchableOpacity>
          ))}
          <TouchableOpacity onPress={onClose} style={[styles.button, { borderTopColor: colors.separator }]} accessibilityRole="button">
            <Text style={[styles.buttonText, styles.cancelText, { color: colors.tint }]}>취소</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "#00000066", paddingHorizontal: 40 },
  // 폭을 제한해 큰 화면에서도 시스템 알림창처럼 작게 보이게 한다
  dialog: { width: "100%", maxWidth: 320, borderRadius: 16, overflow: "hidden" },
  body: { paddingHorizontal: 20, paddingTop: 22, paddingBottom: 18, gap: 6 },
  title: { fontSize: 17, fontWeight: "700", textAlign: "center" },
  message: { fontSize: 13, lineHeight: 19, textAlign: "center" },
  // 누르기 쉬운 높이(48 이상)를 지킨다
  button: { minHeight: 50, alignItems: "center", justifyContent: "center", borderTopWidth: StyleSheet.hairlineWidth, paddingHorizontal: 16 },
  buttonText: { fontSize: 16 },
  cancelText: { fontWeight: "700" },
});
