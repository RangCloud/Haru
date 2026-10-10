/**
 * 확인 창 — 화면 가운데에 뜨는 작은 창
 *
 * "로그아웃할까요?"처럼 한 가지 동작을 진행할지 묻는 창.
 * 모양은 폰의 시스템 확인 창(가운데 작은 창, 아래에 취소·확인 두 버튼)을 그대로 따른다.
 *
 * 시스템 확인 창(Alert)을 그대로 쓰지 않는 이유:
 * iPhone의 시스템 창은 바깥을 눌러 닫는 기능이 아예 없다. 이 창은 두 플랫폼에서 똑같이
 * ① 취소 버튼 ② 바깥 영역 누르기 ③ Android 뒤로 가기 버튼으로 닫을 수 있다.
 *
 * 여러 동작 중 하나를 고르는 창은 ActionSheet(아래에서 올라오는 창)를 쓴다.
 */

import { Modal, Pressable, StyleSheet, TouchableOpacity, View } from "react-native";

import { Colors } from "@/constants/theme";
import { Text } from "@/src/components/AppText";

interface ConfirmDialogProps {
  visible: boolean;
  onClose: () => void;
  title: string;
  message?: string;
  /** 진행 버튼 글자 (예: 로그아웃, 삭제) */
  confirmLabel: string;
  onConfirm: () => void;
  /** 삭제·로그아웃처럼 되돌릴 수 없는 동작 — 진행 버튼을 빨간 글씨로 표시한다 */
  destructive?: boolean;
  colors: typeof Colors.light;
}

// 진행 동작이 화면 이동이나 다른 창 열기로 이어질 수 있다.
// iOS는 창이 닫히는 도중에 다음 동작을 시작하면 화면 전환이 꼬일 수 있어, 닫힌 뒤에 실행한다.
const RUN_AFTER_CLOSE_MS = 250;

export function ConfirmDialog({ visible, onClose, title, message, confirmLabel, onConfirm, destructive = false, colors }: ConfirmDialogProps) {
  const confirm = () => {
    onClose();
    setTimeout(onConfirm, RUN_AFTER_CLOSE_MS);
  };

  return (
    // fade: 시스템 확인 창처럼 제자리에서 나타났다 사라진다 (아래에서 올라오지 않는다)
    <Modal visible={visible} animationType="fade" transparent onRequestClose={onClose} statusBarTranslucent>
      <View style={styles.overlay}>
        {/* 바깥 영역 — 누르면 닫힌다. 창 뒤에 깔아 두어 창 안쪽을 누를 때는 반응하지 않는다 */}
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="닫기" />
        <View style={[styles.dialog, { backgroundColor: colors.card }]} accessibilityRole="alert">
          <View style={styles.body}>
            <Text style={[styles.title, { color: colors.text }]}>{title}</Text>
            {message ? <Text style={[styles.message, { color: colors.subtext }]}>{message}</Text> : null}
          </View>
          <View style={[styles.buttons, { borderTopColor: colors.separator }]}>
            <TouchableOpacity onPress={onClose} style={styles.button} accessibilityRole="button">
              <Text style={[styles.buttonText, { color: colors.tint }]}>취소</Text>
            </TouchableOpacity>
            <View style={[styles.buttonDivider, { backgroundColor: colors.separator }]} />
            <TouchableOpacity onPress={confirm} style={styles.button} accessibilityRole="button">
              <Text style={[styles.buttonText, styles.confirmText, { color: destructive ? colors.expense : colors.tint }]}>
                {confirmLabel}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "#00000066", paddingHorizontal: 40 },
  // 폭을 제한해 큰 화면에서도 시스템 확인 창처럼 작게 보이게 한다
  dialog: { width: "100%", maxWidth: 320, borderRadius: 16, overflow: "hidden" },
  body: { paddingHorizontal: 20, paddingTop: 22, paddingBottom: 18, gap: 8 },
  title: { fontSize: 17, fontWeight: "700", textAlign: "center" },
  message: { fontSize: 13, lineHeight: 19, textAlign: "center" },
  buttons: { flexDirection: "row", borderTopWidth: StyleSheet.hairlineWidth },
  // 누르기 쉬운 높이(48 이상)를 지킨다
  button: { flex: 1, minHeight: 50, alignItems: "center", justifyContent: "center" },
  buttonDivider: { width: StyleSheet.hairlineWidth },
  buttonText: { fontSize: 16 },
  confirmText: { fontWeight: "700" },
});
