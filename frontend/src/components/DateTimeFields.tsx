/**
 * 날짜·시간 선택 필드 (피드백 8번·12번)
 *
 * - DateField: 탭하면 바로 아래에 작은 달력이 펼쳐지고, 날짜를 누르면 선택된다.
 *   기존의 'YYYY-MM-DD' 숫자 타이핑을 대체해 잘못된 날짜 입력 자체를 없앤다.
 * - TimeField: 탭하면 시(0~23)·분(5분 단위) 칩이 펼쳐진다.
 *
 * 시트 안에서 또 다른 모달을 띄우면 iOS에서 모달이 겹쳐 닫히는 문제가 있어,
 * 팝업 대신 "필드 아래로 펼치기" 방식을 쓴다. 새 라이브러리 없이 구현했다.
 */

import { useState } from "react";
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";

import { Colors } from "@/constants/theme";
import {
  buildCalendarDays,
  formatFullDate,
  parseDate,
  shiftMonth,
  toDateStr,
  todayString,
  WEEKDAYS_KO,
} from "@/src/utils/date";

type ThemeColors = typeof Colors.light;

// ── 작은 달력 ─────────────────────────────────────────────────

interface MiniCalendarProps {
  value: string;              // 선택된 날짜
  minDate?: string;           // 이 날짜보다 이전은 선택 불가 (종료일 선택 시 시작일)
  onSelect: (date: string) => void;
  colors: ThemeColors;
}

export function MiniCalendar({ value, minDate, onSelect, colors }: MiniCalendarProps) {
  const base = parseDate(value || todayString());
  const [ym, setYm] = useState({ year: base.getFullYear(), month: base.getMonth() + 1 });
  const today = todayString();
  const days = buildCalendarDays(ym.year, ym.month);

  const move = (delta: number) => setYm((p) => shiftMonth(p.year, p.month, delta));

  return (
    <View style={[mini.box, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
      <View style={mini.header}>
        <TouchableOpacity onPress={() => move(-1)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} accessibilityLabel="이전 달">
          <Text style={[mini.arrow, { color: colors.tint }]}>‹</Text>
        </TouchableOpacity>
        <Text style={[mini.title, { color: colors.text }]}>{ym.year}년 {ym.month}월</Text>
        <TouchableOpacity onPress={() => move(1)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} accessibilityLabel="다음 달">
          <Text style={[mini.arrow, { color: colors.tint }]}>›</Text>
        </TouchableOpacity>
      </View>
      <View style={mini.row}>
        {WEEKDAYS_KO.map((w, i) => (
          <Text key={w} style={[mini.weekday, { color: i === 0 ? colors.expense : i === 6 ? "#3B82F6" : colors.subtext }]}>{w}</Text>
        ))}
      </View>
      <View style={mini.grid}>
        {days.map((day, idx) => {
          if (day === null) return <View key={`e${idx}`} style={mini.cell} />;
          const date = toDateStr(ym.year, ym.month, day);
          const selected = date === value;
          const disabled = !!minDate && date < minDate;
          const isToday = date === today;
          return (
            <TouchableOpacity
              key={date}
              style={mini.cell}
              onPress={() => onSelect(date)}
              disabled={disabled}
              accessibilityLabel={formatFullDate(date)}
            >
              <View style={[
                mini.dayCircle,
                selected && { backgroundColor: colors.tint },
                !selected && isToday && { borderWidth: 1.5, borderColor: colors.tint },
              ]}>
                <Text style={[
                  mini.dayText,
                  { color: selected ? "#fff" : disabled ? colors.separator : colors.text },
                  isToday && !selected && { color: colors.tint, fontWeight: "700" },
                ]}>
                  {day}
                </Text>
              </View>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

// ── 날짜 필드 ─────────────────────────────────────────────────

interface DateFieldProps {
  label: string;
  value: string;                   // '' 이면 placeholder 표시 (선택 안 함)
  placeholder?: string;
  minDate?: string;
  onChange: (date: string) => void;
  onClear?: () => void;            // 있으면 '지우기' 버튼 표시 (종료일처럼 선택 사항일 때)
  colors: ThemeColors;
}

export function DateField({ label, value, placeholder = "날짜 선택", minDate, onChange, onClear, colors }: DateFieldProps) {
  const [open, setOpen] = useState(false);
  return (
    <View style={field.wrap}>
      <Text style={[field.label, { color: colors.subtext }]}>{label}</Text>
      <View style={field.row}>
        <TouchableOpacity
          style={[field.box, { borderColor: open ? colors.tint : colors.separator, backgroundColor: colors.card }]}
          onPress={() => setOpen((o) => !o)}
          activeOpacity={0.7}
        >
          <Text style={[field.value, { color: value ? colors.text : colors.subtext }]}>
            {value ? formatFullDate(value) : placeholder}
          </Text>
          <Text style={[field.chevron, { color: colors.subtext }]}>{open ? "▲" : "▼"}</Text>
        </TouchableOpacity>
        {onClear && value ? (
          <TouchableOpacity onPress={() => { onClear(); setOpen(false); }} style={field.clear}>
            <Text style={[field.clearText, { color: colors.subtext }]}>지우기</Text>
          </TouchableOpacity>
        ) : null}
      </View>
      {open && (
        <MiniCalendar
          value={value || minDate || todayString()}
          minDate={minDate}
          colors={colors}
          onSelect={(d) => { onChange(d); setOpen(false); }}
        />
      )}
    </View>
  );
}

// ── 시간 필드 ─────────────────────────────────────────────────

const HOURS = Array.from({ length: 24 }, (_, h) => String(h).padStart(2, "0"));
const MINUTES = Array.from({ length: 12 }, (_, i) => String(i * 5).padStart(2, "0"));

interface TimeFieldProps {
  label: string;
  value: string;            // 'HH:MM' 또는 ''
  placeholder: string;      // 비었을 때 문구 (예: '종일')
  onChange: (time: string) => void;
  colors: ThemeColors;
}

export function TimeField({ label, value, placeholder, onChange, colors }: TimeFieldProps) {
  const [open, setOpen] = useState(false);
  const [h, m] = value ? value.split(":") : ["", ""];

  // 시를 먼저 고르면 분은 00으로 시작 — 한 번만 탭해도 유효한 시간이 되게 한다
  const pickHour = (hh: string) => onChange(`${hh}:${m || "00"}`);
  const pickMinute = (mm: string) => onChange(`${h || "09"}:${mm}`);

  const chip = (label: string, selected: boolean, onPress: () => void) => (
    <TouchableOpacity
      key={label}
      onPress={onPress}
      style={[field.chip, { borderColor: selected ? colors.tint : colors.separator, backgroundColor: selected ? colors.tint : colors.card }]}
    >
      <Text style={[field.chipText, { color: selected ? "#fff" : colors.text }]}>{label}</Text>
    </TouchableOpacity>
  );

  return (
    <View style={field.wrap}>
      <Text style={[field.label, { color: colors.subtext }]}>{label}</Text>
      <View style={field.row}>
        <TouchableOpacity
          style={[field.box, { borderColor: open ? colors.tint : colors.separator, backgroundColor: colors.card }]}
          onPress={() => setOpen((o) => !o)}
          activeOpacity={0.7}
        >
          <Text style={[field.value, { color: value ? colors.text : colors.subtext }]}>{value || placeholder}</Text>
          <Text style={[field.chevron, { color: colors.subtext }]}>{open ? "▲" : "▼"}</Text>
        </TouchableOpacity>
        {value ? (
          <TouchableOpacity onPress={() => { onChange(""); setOpen(false); }} style={field.clear}>
            <Text style={[field.clearText, { color: colors.subtext }]}>지우기</Text>
          </TouchableOpacity>
        ) : null}
      </View>
      {open && (
        <View style={[field.picker, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
          <Text style={[field.pickerLabel, { color: colors.subtext }]}>시</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={field.chips}>
            {HOURS.map((hh) => chip(hh, hh === h, () => pickHour(hh)))}
          </ScrollView>
          <Text style={[field.pickerLabel, { color: colors.subtext }]}>분</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={field.chips}>
            {MINUTES.map((mm) => chip(mm, mm === m, () => pickMinute(mm)))}
          </ScrollView>
        </View>
      )}
    </View>
  );
}

// ── 스타일 ───────────────────────────────────────────────────

const mini = StyleSheet.create({
  box: { borderWidth: 1, borderRadius: 12, padding: 10, marginTop: 6 },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 8, marginBottom: 6 },
  arrow: { fontSize: 24, fontWeight: "300", paddingHorizontal: 6 },
  title: { fontSize: 15, fontWeight: "700" },
  row: { flexDirection: "row" },
  weekday: { width: `${100 / 7}%`, textAlign: "center", fontSize: 11, fontWeight: "600", marginBottom: 4 },
  grid: { flexDirection: "row", flexWrap: "wrap" },
  cell: { width: `${100 / 7}%`, height: 38, alignItems: "center", justifyContent: "center" },
  dayCircle: { width: 32, height: 32, borderRadius: 16, alignItems: "center", justifyContent: "center" },
  dayText: { fontSize: 14 },
});

const field = StyleSheet.create({
  wrap: { gap: 4 },
  label: { fontSize: 12, fontWeight: "500", marginTop: 8 },
  row: { flexDirection: "row", alignItems: "center", gap: 8 },
  box: {
    flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    borderWidth: 1, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12,
  },
  value: { fontSize: 15 },
  chevron: { fontSize: 10 },
  clear: { paddingHorizontal: 6, paddingVertical: 8 },
  clearText: { fontSize: 13 },
  picker: { borderWidth: 1, borderRadius: 12, padding: 10, marginTop: 6, gap: 6 },
  pickerLabel: { fontSize: 11, fontWeight: "600" },
  chips: { gap: 6 },
  chip: { borderWidth: 1, borderRadius: 16, paddingHorizontal: 12, paddingVertical: 7 },
  chipText: { fontSize: 13, fontVariant: ["tabular-nums"] },
});
