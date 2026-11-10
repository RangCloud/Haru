/**
 * 할 일 + 루틴 목록 (홈 화면)
 *
 * 순서: ★ 중요 → 루틴 → 일반 할 일.
 * 피드백 13번: 중요한 항목은 목록 맨 위로 올린다.
 *
 * 2026-11 리디자인(시안 1): 한 줄 = 체크박스 · 제목 · 오른쪽 꼬리표, 줄 사이는 얇은 구분선.
 *   중요한 일: 파란 테두리(2) 체크박스 + 오른쪽 '중요' 글자 — 색만으로 구분하지 않도록 글자 꼬리표를 함께 둔다.
 *   루틴: 오른쪽에 반복 요일(매일·평일·월·목 등)을 적는다(예전에는 제목 아래 작은 줄이었다).
 *   완료: 파랑 채움 + 체크, 제목은 가운데 줄 + 흐린 글씨.
 *
 * 조작: 탭 = 완료 체크, 길게 누르기 = 수정·중요 표시·삭제 메뉴.
 */

import { useState } from "react";
import { StyleSheet, TouchableOpacity, View } from "react-native";

import { Colors } from "@/constants/theme";
import { ActionSheet } from "@/src/components/ActionSheet";
import { Text } from "@/src/components/AppText";
import { ConfirmDialog } from "@/src/components/ConfirmDialog";
import { type TodoEditTarget } from "@/src/components/TodoAddSheet";
import { describeWeekdays, type RoutineForDate } from "@/src/db/routine";
import { type TodoItem } from "@/src/db/todo";
import { useTodoStore } from "@/src/store/todoStore";

type Row =
  | { kind: "todo"; key: string; important: boolean; item: TodoItem }
  | { kind: "routine"; key: string; important: boolean; item: RoutineForDate };

interface TodoListProps {
  todos: TodoItem[];
  routines: RoutineForDate[];
  date: string;                       // 루틴 체크를 기록할 날짜
  colors: typeof Colors.light;
  onEdit: (target: TodoEditTarget) => void;   // 수정 창 열기 (할 일·루틴 공통)
}

export function TodoList({ todos, routines, date, colors, onEdit }: TodoListProps) {
  const { toggle, setImportant, remove, toggleRoutine, setRoutineImportant, removeRoutine } = useTodoStore();

  // 표시 순서 (수정 7번): ★ 중요(할 일·루틴 모두) → 루틴 → 일반 할 일.
  // 정렬 안정성에 기대지 않도록 순위와 원래 순서를 명시적으로 비교한다.
  const rank = (r: Row) => (r.important ? 0 : r.kind === "routine" ? 1 : 2);
  const rows: Row[] = [
    ...routines.map((r): Row => ({ kind: "routine", key: `r${r.id}`, important: r.important, item: r })),
    ...todos.map((t): Row => ({ kind: "todo", key: `t${t.id}`, important: t.important, item: t })),
  ]
    .map((row, index) => ({ row, index }))
    .sort((a, b) => rank(a.row) - rank(b.row) || a.index - b.index)
    .map(({ row }) => row);

  // 길게 눌렀을 때 뜨는 창에 넣을 동작들 — 시스템 알림창 대신 선택 창을 써서 Android에서도 취소할 수 있다
  const [menuRow, setMenuRow] = useState<Row | null>(null);
  const openMenu = (row: Row) => setMenuRow(row);
  // 루틴 삭제 확인 창에 띄울 루틴 — iPhone에서도 바깥을 눌러 닫을 수 있는 확인 창(ConfirmDialog)을 쓴다
  const [routineToDelete, setRoutineToDelete] = useState<RoutineForDate | null>(null);

  const menuActions = (row: Row) => {
    const importantLabel = row.important ? "중요 표시 해제" : "★ 중요 표시";
    if (row.kind === "todo") {
      const todo = row.item;
      return [
        { label: "수정", onPress: () => onEdit({ kind: "todo", item: todo }) },
        { label: importantLabel, onPress: () => setImportant(todo.id, !row.important) },
        { label: "삭제", onPress: () => remove(todo.id), destructive: true },
      ];
    }
    const routine = row.item;
    return [
      { label: "수정", onPress: () => onEdit({ kind: "routine", item: routine }) },
      { label: importantLabel, onPress: () => setRoutineImportant(routine.id, !row.important) },
      {
        label: "루틴 삭제", destructive: true,
        // 지난 체크 기록까지 지워지므로 한 번 더 확인한다 (아래의 확인 창)
        onPress: () => setRoutineToDelete(routine),
      },
    ];
  };

  return (
    <View style={styles.list}>
      {rows.map((row, index) => {
        const done = row.item.done;
        // 오른쪽 꼬리표 — 루틴이면 반복 요일(매일·평일·월·목 …)
        const tag = row.kind === "routine" ? describeWeekdays(row.item.weekdays) : null;
        const onToggle = () =>
          row.kind === "todo" ? toggle(row.item.id, !done) : toggleRoutine(row.item.id, date, !done);
        return (
          <TouchableOpacity
            key={row.key}
            // 첫 줄 위에는 선을 긋지 않는다 — 카드 테두리와 겹치지 않게
            style={[styles.item, index > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.separator }]}
            onPress={onToggle}
            onLongPress={() => openMenu(row)}
            activeOpacity={0.7}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: done }}
            accessibilityLabel={`${row.important ? "중요, " : ""}${row.item.title}${tag ? `, ${tag}` : ""}`}
          >
            <View style={[styles.checkbox, checkboxColors(row.important, done, colors)]}>
              {done && (
                <Text style={[styles.checkmark, { color: row.important ? colors.importantCheck : colors.onTint }]}>✓</Text>
              )}
            </View>
            <Text
              style={[styles.title, { color: done ? colors.subtext : colors.text }, done && styles.titleDone]}
              numberOfLines={1}
            >
              {row.item.title}
            </Text>
            {row.important && <Text style={[styles.tag, styles.tagImportant, { color: colors.tint }]}>중요</Text>}
            {tag && <Text style={[styles.tag, { color: colors.subtext }]}>{tag}</Text>}
          </TouchableOpacity>
        );
      })}
      <ActionSheet
        visible={menuRow !== null}
        onClose={() => setMenuRow(null)}
        title={menuRow?.item.title ?? ""}
        message={menuRow?.kind === "routine" ? `고정 루틴 · ${describeWeekdays(menuRow.item.weekdays)}` : undefined}
        actions={menuRow ? menuActions(menuRow) : []}
        colors={colors}
      />
      <ConfirmDialog
        visible={routineToDelete !== null}
        onClose={() => setRoutineToDelete(null)}
        title="루틴 삭제"
        message={routineToDelete ? `"${routineToDelete.title}" 루틴을 삭제할까요?\n지난 체크 기록도 함께 지워집니다.` : undefined}
        confirmLabel="삭제"
        onConfirm={() => { if (routineToDelete) removeRoutine(routineToDelete.id); }}
        destructive
        colors={colors}
      />
    </View>
  );
}

/**
 * 체크박스 테두리·바탕 — 중요 여부 × 완료 여부 네 가지 상태.
 * 중요한 칸은 테두리를 2로 조금 굵게 해서 색을 못 봐도 두께 차이가 남게 한다(크기는 22 그대로라 줄이 밀리지 않음).
 * 체크 표시 색은 완료 채움 위 글자색(onTint·importantCheck) — 다크 모드에서는 밝은 파랑 위라 어두운 체크가 된다.
 */
function checkboxColors(important: boolean, done: boolean, colors: typeof Colors.light) {
  if (important) {
    return done
      ? { borderWidth: 2, borderColor: colors.importantFill, backgroundColor: colors.importantFill }
      : { borderWidth: 2, borderColor: colors.important, backgroundColor: colors.importantSoft };
  }
  // 안 한 일 테두리는 보조 글자색 — 예전 separator 색은 흰 바탕에서 1.2:1이라 칸이 잘 안 보였다(UI 요소 3:1 기준)
  return done
    ? { borderColor: colors.tint, backgroundColor: colors.tint }
    : { borderColor: colors.subtext };
}

const styles = StyleSheet.create({
  list: {},
  // 줄 높이 48 이상 — 터치 영역(iOS 44pt / Android 48dp) 확보
  item: { flexDirection: "row", alignItems: "center", gap: 12, minHeight: 48, paddingVertical: 12 },
  checkbox: { width: 22, height: 22, borderRadius: 6, borderWidth: 1.5, alignItems: "center", justifyContent: "center" },
  checkmark: { fontSize: 13, fontWeight: "700" },
  title: { flex: 1, fontSize: 15 },
  titleDone: { textDecorationLine: "line-through" },
  tag: { fontSize: 12 },
  tagImportant: { fontWeight: "700" },
});
