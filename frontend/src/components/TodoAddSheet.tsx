/**
 * 할 일·루틴 추가·수정 시트
 *
 * 한 창에서 모두 정한다.
 * - 내용
 * - 종류: 할 일(날짜 지정) / 고정 루틴(반복 요일)
 * - ★ 중요 표시 — 켜면 목록 맨 위에 별과 함께 표시
 *
 * editTarget을 넘기면 수정 모드로 열린다. 이때 종류는 바꿀 수 없다
 * (할 일 ↔ 루틴은 저장 구조가 달라서, 바꾸려면 지우고 새로 추가한다).
 * 오늘이 아닌 날짜의 할 일은 그날이 되면 홈에 나타난다.
 */

import { useEffect, useState } from "react";
import { StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";

import { IconSymbol } from "@/components/ui/icon-symbol";
import { Colors } from "@/constants/theme";
import { BottomSheet } from "@/src/components/BottomSheet";
import { DateField } from "@/src/components/DateTimeFields";
import { WEEKDAY_LABELS, type RoutineForDate } from "@/src/db/routine";
import { type TodoItem } from "@/src/db/todo";
import { useTodoStore } from "@/src/store/todoStore";
import { formatMonthDay, todayString } from "@/src/utils/date";

type Mode = "todo" | "routine";

export type TodoEditTarget =
  | { kind: "todo"; item: TodoItem }
  | { kind: "routine"; item: RoutineForDate };

interface TodoAddSheetProps {
  visible: boolean;
  onClose: () => void;
  editTarget?: TodoEditTarget;
  colors: typeof Colors.light;
}

const STAR_COLOR = "#F5B400";

export function TodoAddSheet({ visible, onClose, editTarget, colors }: TodoAddSheetProps) {
  const { add, addRoutine, updateTodo, updateRoutineFields } = useTodoStore();
  const [mode, setMode] = useState<Mode>("todo");
  const [title, setTitle] = useState("");
  const [date, setDate] = useState(todayString());
  const [weekdays, setWeekdays] = useState("1111111");
  const [important, setImportant] = useState(false);

  // 열 때마다 초기화 — 수정이면 기존 값으로, 추가면 빈 값으로
  useEffect(() => {
    if (!visible) return;
    if (editTarget?.kind === "todo") {
      setMode("todo");
      setTitle(editTarget.item.title);
      setDate(editTarget.item.date);
      setImportant(editTarget.item.important);
    } else if (editTarget?.kind === "routine") {
      setMode("routine");
      setTitle(editTarget.item.title);
      setWeekdays(editTarget.item.weekdays);
      setImportant(editTarget.item.important);
    } else {
      setMode("todo");
      setTitle("");
      setDate(todayString());
      setWeekdays("1111111");
      setImportant(false);
    }
  }, [visible, editTarget]);

  const isEdit = !!editTarget;
  const toggleDay = (i: number) =>
    setWeekdays((w) => w.split("").map((c, idx) => (idx === i ? (c === "1" ? "0" : "1") : c)).join(""));

  const canSubmit = title.trim().length > 0 && (mode === "todo" || weekdays.includes("1"));

  const submit = async () => {
    if (!canSubmit) return;
    if (editTarget?.kind === "todo") await updateTodo(editTarget.item.id, { title, date, important });
    else if (editTarget?.kind === "routine") await updateRoutineFields(editTarget.item.id, { title, weekdays, important });
    else if (mode === "todo") await add(title, date, important);
    else await addRoutine(title, weekdays, important);
    onClose();
  };

  const sheetTitle = isEdit
    ? mode === "todo" ? "할 일 수정" : "루틴 수정"
    : "할 일 추가";

  return (
    <BottomSheet
      visible={visible}
      onClose={onClose}
      title={sheetTitle}
      colors={colors}
      footer={
        <TouchableOpacity
          style={[styles.submit, { backgroundColor: canSubmit ? colors.tint : colors.separator }]}
          onPress={submit}
          disabled={!canSubmit}
        >
          <Text style={styles.submitText}>{isEdit ? "저장하기" : "추가하기"}</Text>
        </TouchableOpacity>
      }
    >
      {/* 종류 — 추가할 때만 고를 수 있다 */}
      {!isEdit && (
        <View style={[styles.segment, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
          {(["todo", "routine"] as const).map((m) => (
            <TouchableOpacity
              key={m}
              style={[styles.segmentBtn, mode === m && { backgroundColor: colors.tint }]}
              onPress={() => setMode(m)}
              accessibilityState={{ selected: mode === m }}
            >
              <Text style={[styles.segmentText, { color: mode === m ? "#fff" : colors.subtext }]}>
                {m === "todo" ? "할 일" : "↻ 고정 루틴"}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      <Text style={[styles.label, { color: colors.subtext }]}>내용</Text>
      <TextInput
        style={[styles.input, { color: colors.text, borderColor: colors.separator, backgroundColor: colors.card }]}
        placeholder={mode === "todo" ? "예) 은행 들르기" : "예) 스트레칭 10분"}
        placeholderTextColor={colors.subtext}
        value={title}
        onChangeText={setTitle}
        autoFocus={!isEdit}
        returnKeyType="done"
      />

      {mode === "todo" ? (
        <>
          <DateField label="날짜" value={date} onChange={setDate} colors={colors} />
          {date !== todayString() && (
            <Text style={[styles.hint, { color: colors.subtext }]}>
              {formatMonthDay(date)} — 그날이 되면 홈의 오늘 할 일에 나타나요.
            </Text>
          )}
        </>
      ) : (
        <>
          <Text style={[styles.label, { color: colors.subtext }]}>반복 요일</Text>
          <View style={styles.days}>
            {WEEKDAY_LABELS.map((w, i) => {
              const on = weekdays[i] === "1";
              return (
                <TouchableOpacity
                  key={w}
                  onPress={() => toggleDay(i)}
                  style={[styles.day, { borderColor: on ? colors.tint : colors.separator, backgroundColor: on ? colors.tint : colors.card }]}
                  accessibilityLabel={`${w}요일 ${on ? "선택됨" : "선택 안 됨"}`}
                >
                  <Text style={[styles.dayText, { color: on ? "#fff" : i === 0 ? colors.expense : colors.text }]}>{w}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
          <View style={styles.presets}>
            {[["매일", "1111111"], ["평일", "0111110"], ["주말", "1000001"]].map(([label, value]) => (
              <TouchableOpacity key={label} onPress={() => setWeekdays(value)}>
                <Text style={[styles.preset, { color: weekdays === value ? colors.tint : colors.subtext }]}>{label}</Text>
              </TouchableOpacity>
            ))}
          </View>
          {!weekdays.includes("1") && (
            <Text style={[styles.hint, { color: colors.expense }]}>요일을 하나 이상 골라 주세요.</Text>
          )}
        </>
      )}

      {/* 중요 표시 */}
      <TouchableOpacity
        style={[styles.importantRow, { borderColor: important ? STAR_COLOR : colors.separator, backgroundColor: colors.card }]}
        onPress={() => setImportant((v) => !v)}
        accessibilityRole="switch"
        accessibilityState={{ checked: important }}
      >
        <IconSymbol name="star.fill" size={18} color={important ? STAR_COLOR : colors.separator} />
        <View style={styles.importantText}>
          <Text style={[styles.importantTitle, { color: colors.text }]}>중요 표시</Text>
          <Text style={[styles.importantSub, { color: colors.subtext }]}>목록 맨 위에 별과 함께 보여줘요</Text>
        </View>
        <View style={[styles.toggle, { backgroundColor: important ? colors.tint : colors.separator }]}>
          <View style={[styles.knob, important && styles.knobOn]} />
        </View>
      </TouchableOpacity>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  segment: { flexDirection: "row", borderRadius: 12, borderWidth: 1, overflow: "hidden", marginBottom: 4 },
  segmentBtn: { flex: 1, paddingVertical: 10, alignItems: "center" },
  segmentText: { fontSize: 14, fontWeight: "600" },
  label: { fontSize: 12, fontWeight: "500", marginTop: 8 },
  input: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15 },
  hint: { fontSize: 12, lineHeight: 17 },
  days: { flexDirection: "row", justifyContent: "space-between", gap: 6 },
  day: { flex: 1, aspectRatio: 1, maxWidth: 44, borderRadius: 22, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  dayText: { fontSize: 14, fontWeight: "600" },
  presets: { flexDirection: "row", gap: 16, marginTop: 2 },
  preset: { fontSize: 13, fontWeight: "600" },
  importantRow: { flexDirection: "row", alignItems: "center", gap: 12, borderWidth: 1, borderRadius: 12, padding: 12, marginTop: 10 },
  importantText: { flex: 1, gap: 1 },
  importantTitle: { fontSize: 14, fontWeight: "600" },
  importantSub: { fontSize: 11 },
  toggle: { width: 44, height: 26, borderRadius: 13, padding: 3, justifyContent: "center" },
  knob: { width: 20, height: 20, borderRadius: 10, backgroundColor: "#fff" },
  knobOn: { alignSelf: "flex-end" },
  submit: { paddingVertical: 16, borderRadius: 14, alignItems: "center" },
  submitText: { color: "#fff", fontSize: 16, fontWeight: "600" },
});
