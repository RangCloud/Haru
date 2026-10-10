/**
 * 선택 창 (액션 시트)
 *
 * "일정 추가 / 지출 추가 / 수입 추가", "수정 / 삭제"처럼 여러 동작 중 하나를 고르는 창.
 *
 * 왜 시스템 알림창(Alert) 대신 만들었나:
 * Android의 알림창은 버튼을 3개까지만 보여 준다. 동작 3개 + 취소를 넣으면 네 번째인 '취소'가
 * 잘려 나가고, 바깥을 눌러도 닫히지 않아 "무엇이든 하나를 골라야만 창이 닫히는" 문제가 있었다.
 * 이 창은 두 플랫폼에서 똑같이 ① 맨 아래 '취소' ② 오른쪽 위 ✕ ③ 바깥 영역 누르기
 * ④ Android 뒤로 가기 버튼으로 닫을 수 있다.
 */

import { StyleSheet, TouchableOpacity, View } from "react-native";

import { Colors } from "@/constants/theme";
import { Text } from "@/src/components/AppText";
import { BottomSheet } from "@/src/components/BottomSheet";

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
  /** 제목 아래 보조 설명 (예: 일정 이름, 금액) */
  message?: string;
  actions: ActionItem[];
  colors: typeof Colors.light;
}

// 고른 동작이 또 다른 창(일정 추가 창 등)을 여는 경우가 많다.
// iOS는 창이 닫히는 애니메이션 도중에 새 창을 열면 새 창이 뜨지 않으므로, 닫힌 뒤에 실행한다.
const RUN_AFTER_CLOSE_MS = 320;

export function ActionSheet({ visible, onClose, title, message, actions, colors }: ActionSheetProps) {
  const run = (action: ActionItem) => {
    onClose();
    setTimeout(action.onPress, RUN_AFTER_CLOSE_MS);
  };

  return (
    <BottomSheet
      visible={visible}
      onClose={onClose}
      title={title}
      colors={colors}
      footer={
        <TouchableOpacity
          onPress={onClose}
          style={[styles.cancel, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}
          accessibilityRole="button"
        >
          <Text style={[styles.cancelText, { color: colors.text }]}>취소</Text>
        </TouchableOpacity>
      }
    >
      {message ? <Text style={[styles.message, { color: colors.subtext }]} numberOfLines={2}>{message}</Text> : null}
      <View style={[styles.group, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
        {actions.map((action, i) => (
          <TouchableOpacity
            key={action.label}
            onPress={() => run(action)}
            style={[styles.row, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.separator }]}
            accessibilityRole="button"
          >
            <Text style={[styles.rowText, { color: action.destructive ? colors.expense : colors.text }]}>{action.label}</Text>
          </TouchableOpacity>
        ))}
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  message: { fontSize: 13, lineHeight: 18, marginBottom: 4 },
  group: { borderRadius: 14, borderWidth: 1, overflow: "hidden" },
  // 손가락으로 누르기 쉬운 높이(48 이상)를 지킨다
  row: { minHeight: 52, justifyContent: "center", paddingHorizontal: 16 },
  rowText: { fontSize: 16, fontWeight: "500" },
  cancel: { borderRadius: 14, borderWidth: 1, minHeight: 52, alignItems: "center", justifyContent: "center" },
  cancelText: { fontSize: 16, fontWeight: "600" },
});
