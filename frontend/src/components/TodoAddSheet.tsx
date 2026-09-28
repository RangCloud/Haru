/**
 * 할 일·루틴 추가 시트 (피드백 2번·18번)
 *
 * - 할 일: 날짜를 골라 추가한다 (기본값은 호출한 화면이 넘겨준 날짜 — 홈은 오늘, 달력은 선택한 날).
 *   오늘이 아닌 날짜의 할 일은 일정 탭 달력에서 그 날짜를 누르면 보이고, 그날이 되면 홈에도 나타난다.
 * - 루틴: 반복할 요일을 골라 추가한다. 해당 요일마다 할 일 목록에 자동으로 나타난다.
 * - 루틴 요일 수정: editRoutine을 넘기면 요일만 바꾸는 편집 모드로 열린다.
 */

import { useEffect, useState } from "react";
import { StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";

import { Colors } from "@/constants/theme";
import { BottomSheet } from "@/src/components/BottomSheet";
import { DateField } from "@/src/components/DateTimeFields";
import { WEEKDAY_LABELS } from "@/src/db/routine";
import { useTodoStore } from "@/src/store/todoStore";
import { formatMonthDay, todayString } from "@/src/utils/date";

type Mode = "todo" | "routine";

interface TodoAddSheetProps {
  visible: boolean;
  onClose: () => void;
  initialDate?: string;
  initialMode?: Mode;
  /** 루틴 요일 수정 모드 */
  editRoutine?: { id: number; title: string; weekdays: string };
  colors: typeof Colors.light;
}

export function TodoAddSheet({ visible, onClose, initialDate, initialMode = "todo", editRoutine, colors }: TodoAddSheetProps) {
  const { add, addRoutine, updateRoutineDays } = useTodoStore();
  const [mode, setMode] = useState<Mode>(initialMode);
  const [title, setTitle] = useState("");
  const [date, setDate] = useState(initialDate ?? todayString());
  const [weekdays, setWeekdays] = useState("1111111");

  // 열 때마다 초기화 — 이전에 입력하다 닫은 내용이 남지 않게
  useEffect(() => {
    if (!visible) return;
    if (editRoutine) {
      setMode("routine");
      setTitle(editRoutine.title);
      setWeekdays(editRoutine.weekdays);
    } else {
      setMode(initialMode);
      setTitle("");
      setWeekdays("1111111");
    }
    setDate(initialDate ?? todayString());
  }, [visible, initialDate, initialMode, editRoutine]);

  const toggleDay = (i: number) =>
    setWeekdays((w) => w.split("").map((c, idx) => (idx === i ? (c === "1" ? "0" : "1") : c)).join(""));

  const canSubmit = editRoutine ? weekdays.includes("1") : title.trim().length > 0 && (mode === "todo" || weekdays.includes("1"));

  const submit = async () => {
    if (!canSubmit) return;
    if (editRoutine) await updateRoutineDays(editRoutine.id, weekdays);
    else if (mode === "todo") await add(title, date);
    else await addRoutine(title, weekdays);
    onClose();
  };

  const isEdit = !!editRoutine;

  return (
    <BottomSheet
      visible={visible}
      onClose={onClose}
      title={isEdit ? "루틴 요일 변경" : mode === "todo" ? "할 일 추가" : "루틴 추가"}
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
      {/* 할 일 / 루틴 전환 (편집 모드에서는 숨김) */}
      {!isEdit && (
        <View style={[styles.segment, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
          {(["todo", "routine"] as const).map((m) => (
            <TouchableOpacity
              key={m}
              style={[styles.segmentBtn, mode === m && { backgroundColor: colors.tint }]}
              onPress={() => setMode(m)}
            >
              <Text style={[styles.segmentText, { color: mode === m ? "#fff" : colors.subtext }]}>
                {m === "todo" ? "할 일" : "↻ 고정 루틴"}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      {isEdit ? (
        <Text style={[styles.editTitle, { color: colors.text }]}>{title}</Text>
      ) : (
        <>
          <Text style={[styles.label, { color: colors.subtext }]}>내용</Text>
          <TextInput
            style={[styles.input, { color: colors.text, borderColor: colors.separator, backgroundColor: colors.card }]}
            placeholder={mode === "todo" ? "예) 은행 들르기" : "예) 스트레칭 10분"}
            placeholderTextColor={colors.subtext}
            value={title}
            onChangeText={setTitle}
            autoFocus
            returnKeyType="done"
            onSubmitEditing={submit}
          />
        </>
      )}

      {mode === "todo" && !isEdit ? (
        <>
          <DateField label="날짜" value={date} onChange={setDate} colors={colors} />
          {date !== todayString() && (
            <Text style={[styles.hint, { color: colors.subtext }]}>
              {formatMonthDay(date)} 할 일은 일정 탭 달력에서 그 날짜를 누르면 볼 수 있어요.
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
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  segment: { flexDirection: "row", borderRadius: 12, borderWidth: 1, overflow: "hidden", marginBottom: 4 },
  segmentBtn: { flex: 1, paddingVertical: 10, alignItems: "center" },
  segmentText: { fontSize: 14, fontWeight: "600" },
  label: { fontSize: 12, fontWeight: "500", marginTop: 8 },
  input: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15 },
  editTitle: { fontSize: 16, fontWeight: "600", marginVertical: 4 },
  hint: { fontSize: 12, lineHeight: 17 },
  days: { flexDirection: "row", justifyContent: "space-between", gap: 6 },
  day: { flex: 1, aspectRatio: 1, maxWidth: 44, borderRadius: 22, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  dayText: { fontSize: 14, fontWeight: "600" },
  presets: { flexDirection: "row", gap: 16, marginTop: 2 },
  preset: { fontSize: 13, fontWeight: "600" },
  submit: { paddingVertical: 16, borderRadius: 14, alignItems: "center" },
  submitText: { color: "#fff", fontSize: 16, fontWeight: "600" },
});
