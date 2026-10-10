/**
 * 시·분 입력 칸 — 직접 입력 + 펼침 목록
 *
 * 예전에는 시(00~23)와 분을 가로로 길게 늘어선 칩에서 골랐는데, 원하는 숫자를 찾으려면
 * 좌우로 한참 밀어야 했다. 이제 두 가지 방법을 함께 준다.
 *  - 숫자를 바로 입력한다 (숫자 키패드). 분은 0~59 아무 값이나 넣을 수 있다.
 *  - 칸 오른쪽 ▾를 눌러 목록을 펼치고 고른다. 목록은 한 화면에 다 보이는 표라서 밀 필요가 없다.
 *    (시는 0~23 전부, 분은 5분 단위)
 *
 * 값은 숫자 또는 null(정하지 않음)로 주고받는다. "HH:MM" 문자열로 쓰는 화면을 위해
 * 아래에 TimeField(문자열용)를 함께 둔다.
 */

import { useEffect, useState } from "react";
import { StyleSheet, TouchableOpacity, View } from "react-native";

import { Colors } from "@/constants/theme";
import { Text, TextInput } from "@/src/components/AppText";

type ThemeColors = typeof Colors.light;

const HOUR_OPTIONS = Array.from({ length: 24 }, (_, h) => h);
const MINUTE_OPTIONS = Array.from({ length: 12 }, (_, i) => i * 5);
const COLUMNS = 6;   // 펼침 목록의 한 줄 칸 수 — 시는 4줄, 분은 2줄이 된다

const pad = (n: number) => String(n).padStart(2, "0");

interface HourMinuteInputProps {
  hour: number | null;
  minute: number | null;
  onChange: (hour: number | null, minute: number | null) => void;
  disabled?: boolean;
  /** 시를 정하기 전에는 분을 받지 않는 화면용 (운세의 태어난 시간) — 분 칸만 잠근다 */
  minuteDisabled?: boolean;
  colors: ThemeColors;
}

export function HourMinuteInput({ hour, minute, onChange, disabled = false, minuteDisabled = false, colors }: HourMinuteInputProps) {
  // 입력 중인 글자 — "1"만 친 상태처럼 아직 값이 확정되지 않은 순간을 담기 위해 따로 둔다
  const [hourText, setHourText] = useState(hour === null ? "" : String(hour));
  const [minuteText, setMinuteText] = useState(minute === null ? "" : pad(minute));
  const [open, setOpen] = useState<"hour" | "minute" | null>(null);

  // 바깥에서 값이 바뀌면(목록에서 고름, 지우기 등) 입력칸 글자도 맞춘다.
  // 입력 중인 글자와 같은 숫자면 건드리지 않는다 — "07"을 치는 도중 "7"로 바뀌어 커서가 튀는 것을 막는다.
  useEffect(() => {
    setHourText((prev) => (hour === null ? "" : Number(prev) === hour && prev !== "" ? prev : String(hour)));
  }, [hour]);
  useEffect(() => {
    setMinuteText((prev) => (minute === null ? "" : Number(prev) === minute && prev !== "" ? prev : pad(minute)));
  }, [minute]);

  const typeHour = (raw: string) => {
    const digits = raw.replace(/\D/g, "").slice(0, 2);
    if (digits === "") { setHourText(""); onChange(null, minute); return; }
    const n = Number(digits);
    if (n > 23) return;   // 24 이상은 받지 않는다 (입력칸에 들어가지 않음)
    setHourText(digits);
    onChange(n, minute);
  };

  const typeMinute = (raw: string) => {
    const digits = raw.replace(/\D/g, "").slice(0, 2);
    if (digits === "") { setMinuteText(""); onChange(hour, null); return; }
    const n = Number(digits);
    if (n > 59) return;
    setMinuteText(digits);
    onChange(hour, n);
  };

  const pick = (kind: "hour" | "minute", n: number) => {
    setOpen(null);
    if (kind === "hour") onChange(n, minute);
    else onChange(hour, n);
  };

  const box = (kind: "hour" | "minute", text: string, onType: (s: string) => void, unit: string, placeholder: string) => {
    const isOpen = open === kind;
    const locked = disabled || (kind === "minute" && minuteDisabled);
    return (
      <View style={[styles.box, { borderColor: isOpen ? colors.tint : colors.separator, backgroundColor: colors.background }, locked && !disabled && styles.disabled]}>
        <TextInput
          style={[styles.input, { color: colors.text }]}
          value={text}
          onChangeText={onType}
          onFocus={() => setOpen(null)}
          editable={!locked}
          keyboardType="number-pad"
          maxLength={2}
          placeholder={placeholder}
          placeholderTextColor={colors.subtext}
          selectTextOnFocus
          accessibilityLabel={`${unit} 입력`}
        />
        <Text style={[styles.unit, { color: colors.subtext }]}>{unit}</Text>
        <TouchableOpacity
          onPress={() => setOpen(isOpen ? null : kind)}
          disabled={locked}
          style={styles.caretBtn}
          hitSlop={{ top: 8, bottom: 8, left: 4, right: 8 }}
          accessibilityRole="button"
          accessibilityLabel={`${unit} 목록 ${isOpen ? "닫기" : "열기"}`}
        >
          <Text style={[styles.caret, { color: isOpen ? colors.tint : colors.subtext }]}>{isOpen ? "▲" : "▼"}</Text>
        </TouchableOpacity>
      </View>
    );
  };

  const options = open === "hour" ? HOUR_OPTIONS : open === "minute" ? MINUTE_OPTIONS : [];
  const selected = open === "hour" ? hour : minute;
  // 한 줄에 COLUMNS칸씩 — 줄바꿈(flexWrap)과 % 너비를 쓰지 않고 줄 단위로 나눠 그린다 (기기별 너비 반올림 문제 방지)
  const rows: number[][] = [];
  for (let i = 0; i < options.length; i += COLUMNS) rows.push(options.slice(i, i + COLUMNS));

  return (
    <View style={[styles.wrap, disabled && styles.disabled]}>
      <View style={styles.boxes}>
        {box("hour", hourText, typeHour, "시", "--")}
        {box("minute", minuteText, typeMinute, "분", "--")}
      </View>
      {open && (
        <View style={[styles.menu, { borderColor: colors.cardBorder, backgroundColor: colors.background }]}>
          {rows.map((row, ri) => (
            <View key={ri} style={styles.menuRow}>
              {row.map((n) => {
                const on = n === selected;
                return (
                  <TouchableOpacity
                    key={n}
                    onPress={() => pick(open, n)}
                    style={[styles.option, on && { backgroundColor: colors.tint }]}
                    accessibilityState={{ selected: on }}
                    accessibilityLabel={`${n}${open === "hour" ? "시" : "분"}`}
                  >
                    <Text style={[styles.optionText, { color: on ? "#fff" : colors.text }]}>{pad(n)}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          ))}
          {open === "minute" && (
            <Text style={[styles.menuHint, { color: colors.subtext }]}>목록에 없는 분(예: 07분)은 칸에 직접 입력하세요.</Text>
          )}
        </View>
      )}
    </View>
  );
}

// ── "HH:MM" 문자열용 ──────────────────────────────────────────

interface TimeFieldProps {
  label: string;
  /** "HH:MM" 또는 정하지 않았으면 "" */
  value: string;
  onChange: (time: string) => void;
  /** 값이 비어 있을 때 라벨 옆에 보여 줄 말 (예: 종일) */
  emptyText: string;
  /** 값을 지우는 버튼 글자 (예: 종일로) */
  clearLabel: string;
  disabled?: boolean;
  colors: ThemeColors;
}

/**
 * 일정의 시작·종료 시간처럼 "HH:MM" 한 값으로 다루는 시간 칸.
 * 시와 분은 항상 함께 있어야 하므로, 한쪽만 정하면 다른 쪽을 기본값으로 채운다
 * (시만 고르면 00분, 분만 고르면 09시 — 예전 칩 방식과 같은 규칙).
 */
export function TimeField({ label, value, onChange, emptyText, clearLabel, disabled = false, colors }: TimeFieldProps) {
  const [h, m] = value ? value.split(":").map(Number) : [null, null];

  const change = (hour: number | null, minute: number | null) => {
    if (hour === null && minute === null) { onChange(""); return; }
    // 입력칸을 비워도(지우는 중) 시간 전체가 사라지지 않게, 비운 쪽은 직전 값·기본값으로 유지한다
    const nextHour = hour ?? h ?? 9;
    const nextMinute = minute ?? (hour !== null && h === null ? 0 : m ?? 0);
    onChange(`${pad(nextHour)}:${pad(nextMinute)}`);
  };

  return (
    <View style={styles.field}>
      <View style={styles.fieldHead}>
        <Text style={[styles.fieldLabel, { color: colors.subtext }]}>
          {label}{value ? "" : ` · ${emptyText}`}
        </Text>
        {!!value && !disabled && (
          <TouchableOpacity onPress={() => onChange("")} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} accessibilityRole="button">
            <Text style={[styles.clear, { color: colors.tint }]}>{clearLabel}</Text>
          </TouchableOpacity>
        )}
      </View>
      <HourMinuteInput hour={h} minute={m} onChange={change} disabled={disabled} colors={colors} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 6 },
  disabled: { opacity: 0.4 },
  boxes: { flexDirection: "row", gap: 8 },
  box: { flex: 1, flexDirection: "row", alignItems: "center", borderWidth: 1, borderRadius: 10, paddingLeft: 12, minHeight: 46 },
  input: { flex: 1, fontSize: 16, fontWeight: "600", paddingVertical: 8, fontVariant: ["tabular-nums"] },
  unit: { fontSize: 13, marginRight: 2 },
  caretBtn: { paddingHorizontal: 10, alignSelf: "stretch", justifyContent: "center" },
  caret: { fontSize: 10 },
  menu: { borderWidth: 1, borderRadius: 10, padding: 6, gap: 2 },
  menuRow: { flexDirection: "row", gap: 2 },
  option: { flex: 1, minHeight: 38, borderRadius: 8, alignItems: "center", justifyContent: "center" },
  optionText: { fontSize: 14, fontWeight: "500", fontVariant: ["tabular-nums"] },
  menuHint: { fontSize: 11, paddingHorizontal: 4, paddingTop: 4 },
  field: { gap: 6 },
  fieldHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  fieldLabel: { fontSize: 12, fontWeight: "500" },
  clear: { fontSize: 12, fontWeight: "600" },
});
