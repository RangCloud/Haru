/**
 * 할 일 + 루틴 목록 (홈·일정 탭 공용)
 *
 * 피드백 13번: 중요한 항목은 목록 맨 위로 올리고, 체크박스 왼쪽 위에 작은 별을 붙인다.
 * 별은 SF Symbols(iOS)의 둥근 star.fill을 써서 "부드러운 별" 모양이 되게 했다.
 * 피드백 18번: 루틴은 제목 아래에 반복 요일(예: 월·수·금)을 작게 표시한다.
 *
 * 조작: 탭 = 완료 체크, 길게 누르기 = 중요 표시·요일 변경·삭제 메뉴.
 */

import { Alert, StyleSheet, Text, TouchableOpacity, View } from "react-native";

import { IconSymbol } from "@/components/ui/icon-symbol";
import { Colors } from "@/constants/theme";
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
  onEditRoutine: (r: RoutineForDate) => void;
}

export function TodoList({ todos, routines, date, colors, onEditRoutine }: TodoListProps) {
  const { toggle, setImportant, remove, toggleRoutine, setRoutineImportant, removeRoutine } = useTodoStore();

  // 중요 항목을 먼저, 같은 중요도 안에서는 루틴 → 일반 할 일 순 (DB 정렬 순서 유지)
  const rows: Row[] = [
    ...routines.map((r): Row => ({ kind: "routine", key: `r${r.id}`, important: r.important, item: r })),
    ...todos.map((t): Row => ({ kind: "todo", key: `t${t.id}`, important: t.important, item: t })),
  ].sort((a, b) => Number(b.important) - Number(a.important));

  const openMenu = (row: Row) => {
    const { item } = row;
    const importantLabel = row.important ? "중요 표시 해제" : "★ 중요 표시";
    if (row.kind === "todo") {
      Alert.alert(item.title, undefined, [
        { text: importantLabel, onPress: () => setImportant(item.id, !row.important) },
        {
          text: "삭제", style: "destructive",
          onPress: () => remove(item.id),
        },
        { text: "취소", style: "cancel" },
      ]);
    } else {
      const routine = row.item;
      Alert.alert(routine.title, `고정 루틴 · ${describeWeekdays(routine.weekdays)}`, [
        { text: importantLabel, onPress: () => setRoutineImportant(routine.id, !row.important) },
        { text: "요일 변경", onPress: () => onEditRoutine(routine) },
        {
          text: "루틴 삭제", style: "destructive",
          onPress: () =>
            Alert.alert("루틴 삭제", `"${routine.title}" 루틴을 삭제할까요?\n지난 체크 기록도 함께 지워집니다.`, [
              { text: "취소", style: "cancel" },
              { text: "삭제", style: "destructive", onPress: () => removeRoutine(routine.id) },
            ]),
        },
        { text: "취소", style: "cancel" },
      ]);
    }
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
