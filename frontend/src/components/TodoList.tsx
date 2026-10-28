/**
 * 할 일 + 루틴 목록 (홈·일정 탭 공용)
 *
 * 순서: ★ 중요 → 루틴 → 일반 할 일.
 * 피드백 13번: 중요한 항목은 목록 맨 위로 올린다.
 * 중요 표시는 체크박스 자체의 색으로 한다(시안 A) — 예전의 작은 별 배지는 11pt라 잘 안 보이고 완료 뒤에도 남았다.
 *   안 한 일: 진한 호박 테두리 + 연한 호박 바탕 → 테두리 색뿐 아니라 '바탕이 채워진 칸'이라는 면으로도 구분
 *   완료한 일: 밝은 호박 채움 + 진한 체크 → 인디고 채움 + 흰 체크인 일반 완료와 밝기·체크 색이 반대라 흑백에서도 구분
 *   (색 값과 대비 근거는 constants/theme.ts의 important* 토큰 주석)
 * 피드백 18번: 루틴은 제목 아래에 반복 요일(예: 월·수·금)을 작게 표시한다.
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
      {rows.map((row) => {
        const done = row.item.done;
        const onToggle = () =>
          row.kind === "todo" ? toggle(row.item.id, !done) : toggleRoutine(row.item.id, date, !done);
        return (
          <TouchableOpacity
            key={row.key}
            style={styles.item}
            onPress={onToggle}
            onLongPress={() => openMenu(row)}
            activeOpacity={0.7}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: done }}
            accessibilityLabel={`${row.important ? "중요, " : ""}${row.item.title}`}
          >
            <View style={[styles.checkbox, checkboxColors(row.important, done, colors)]}>
              {done && (
                <Text style={[styles.checkmark, { color: row.important ? colors.importantCheck : "#fff" }]}>✓</Text>
              )}
            </View>
            <View style={styles.textCol}>
              <Text
                style={[styles.title, { color: done ? colors.subtext : colors.text }, done && styles.titleDone]}
                numberOfLines={1}
              >
                {row.item.title}
              </Text>
              {row.kind === "routine" && (
                <Text style={[styles.routineCaption, { color: colors.subtext }]}>
                  ↻ {describeWeekdays(row.item.weekdays)}
                </Text>
              )}
            </View>
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
 */
function checkboxColors(important: boolean, done: boolean, colors: typeof Colors.light) {
  if (important) {
    return done
      ? { borderWidth: 2, borderColor: colors.importantFill, backgroundColor: colors.importantFill }
      : { borderWidth: 2, borderColor: colors.important, backgroundColor: colors.importantSoft };
  }
  return done
    ? { borderColor: colors.tint, backgroundColor: colors.tint }
    : { borderColor: colors.separator };
}

const styles = StyleSheet.create({
  list: { gap: 12 },
  item: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 2 },
  checkbox: { width: 22, height: 22, borderRadius: 6, borderWidth: 1.5, alignItems: "center", justifyContent: "center" },
  checkmark: { fontSize: 13, fontWeight: "700" },
  textCol: { flex: 1, gap: 1 },
  title: { fontSize: 14 },
  titleDone: { textDecorationLine: "line-through" },
  routineCaption: { fontSize: 11 },
});
