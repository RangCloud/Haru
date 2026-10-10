/**
 * 할 일 + 루틴 목록 (홈·일정 탭 공용)
 *
 * 순서: ★ 중요 → 루틴 → 일반 할 일.
 * 피드백 13번: 중요한 항목은 목록 맨 위로 올리고, 체크박스 왼쪽 위에 작은 별을 붙인다.
 * 별은 SF Symbols(iOS)의 둥근 star.fill을 써서 "부드러운 별" 모양이 되게 했다.
 * 피드백 18번: 루틴은 제목 아래에 반복 요일(예: 월·수·금)을 작게 표시한다.
 *
 * 조작: 탭 = 완료 체크, 길게 누르기 = 수정·중요 표시·삭제 메뉴.
 */

import { useState } from "react";
import { StyleSheet, TouchableOpacity, View } from "react-native";

import { IconSymbol } from "@/components/ui/icon-symbol";
import { Colors } from "@/constants/theme";
import { ActionSheet } from "@/src/components/ActionSheet";
import { Text } from "@/src/components/AppText";
import { type TodoEditTarget } from "@/src/components/TodoAddSheet";
import { describeWeekdays, type RoutineForDate } from "@/src/db/routine";
import { type TodoItem } from "@/src/db/todo";
import { useTodoStore } from "@/src/store/todoStore";

const STAR_COLOR = "#F5B400";

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
  // 루틴 삭제 확인 창에 띄울 루틴 — iPhone에서도 바깥을 눌러 닫을 수 있도록 시스템 알림창 대신 선택 창을 쓴다
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
            <View>
              <View style={[
                styles.checkbox,
                { borderColor: done ? colors.tint : colors.separator },
                done && { backgroundColor: colors.tint },
              ]}>
                {done && <Text style={styles.checkmark}>✓</Text>}
              </View>
              {row.important && (
                // 체크박스 왼쪽 위 모서리에 살짝 걸치게 — 배경색 원으로 테두리를 만들어 체크박스와 분리
                <View style={[styles.starBadge, { backgroundColor: colors.card }]}>
                  <IconSymbol name="star.fill" size={11} color={STAR_COLOR} />
                </View>
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
      <ActionSheet
        visible={routineToDelete !== null}
        onClose={() => setRoutineToDelete(null)}
        title="루틴 삭제"
        message={routineToDelete ? `"${routineToDelete.title}" 루틴을 삭제할까요? 지난 체크 기록도 함께 지워집니다.` : undefined}
        actions={routineToDelete ? [{ label: "삭제", onPress: () => removeRoutine(routineToDelete.id), destructive: true }] : []}
        colors={colors}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  list: { gap: 12 },
  item: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 2 },
  checkbox: { width: 22, height: 22, borderRadius: 6, borderWidth: 1.5, alignItems: "center", justifyContent: "center" },
  checkmark: { fontSize: 13, color: "#fff", fontWeight: "700" },
  starBadge: {
    position: "absolute", top: -7, left: -7,
    width: 15, height: 15, borderRadius: 8,
    alignItems: "center", justifyContent: "center",
  },
  textCol: { flex: 1, gap: 1 },
  title: { fontSize: 14 },
  titleDone: { textDecorationLine: "line-through" },
  routineCaption: { fontSize: 11 },
});
