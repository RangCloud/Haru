/**
 * 날짜·시간 선택 부품
 *
 * - CalendarGrid: 모든 작은 달력이 공유하는 날짜 격자. 한 주씩 줄로 그려서
 *   기기별 소수점 반올림 때문에 날짜가 한 칸씩 밀리는 문제를 막는다 (수정 2번).
 * - DateField: 탭하면 아래로 작은 달력이 펼쳐진다 (거래·할 일의 단일 날짜).
 * - ScheduleWhenField: 일정의 시작일·종료일·시작 시간·종료 시간을 한 패널에서 고른다 (수정 6번).
 *   달력에서 첫 탭 = 시작일, 두 번째 탭 = 종료일. 바로 아래에서 시간을 고른다.
 *
 * 시트 안에서 또 다른 모달을 띄우면 iOS에서 모달이 겹쳐 닫히는 문제가 있어,
 * 팝업 대신 "필드 아래로 펼치기" 방식을 쓴다. 새 라이브러리 없이 구현했다.
 */

import { useState } from "react";
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";

import { Colors } from "@/constants/theme";
import {
  buildCalendarWeeks,
  formatFullDate,
  formatMonthDay,
  parseDate,
  shiftMonth,
  toDateStr,
  todayString,
  WEEKDAYS_KO,
} from "@/src/utils/date";

type ThemeColors = typeof Colors.light;

// ── 공용 날짜 격자 ─────────────────────────────────────────────

export interface DayState {
  selected?: boolean;     // 채운 원 (선택한 날, 기간의 시작·끝)
  inRange?: boolean;      // 기간 사이의 날 — 연한 배경 띠
  disabled?: boolean;
}

interface CalendarGridProps {
  year: number;
  month: number;
  getState: (date: string) => DayState;
  onSelect: (date: string) => void;
  colors: ThemeColors;
}

export function CalendarGrid({ year, month, getState, onSelect, colors }: CalendarGridProps) {
  const today = todayString();
  return (
    <View>
      <View style={grid.row}>
        {WEEKDAYS_KO.map((w, i) => (
          <Text key={w} style={[grid.weekday, { color: i === 0 ? colors.expense : i === 6 ? "#3B82F6" : colors.subtext }]}>{w}</Text>
        ))}
      </View>
      {buildCalendarWeeks(year, month).map((week, wi) => (
        <View key={wi} style={grid.row}>
          {week.map((day, di) => {
            if (day === null) return <View key={`e${di}`} style={grid.cell} />;
            const date = toDateStr(year, month, day);
            const st = getState(date);
            const isToday = date === today;
            return (
              <TouchableOpacity
                key={date}
                style={[grid.cell, st.inRange && { backgroundColor: colors.tintLight }]}
                onPress={() => onSelect(date)}
                disabled={st.disabled}
                accessibilityLabel={formatFullDate(date)}
                accessibilityState={{ selected: !!st.selected, disabled: !!st.disabled }}
              >
                <View style={[
                  grid.circle,
                  st.selected && { backgroundColor: colors.tint },
                  !st.selected && isToday && { borderWidth: 1.5, borderColor: colors.tint },
                ]}>
                  <Text style={[
                    grid.dayText,
                    { color: st.selected ? "#fff" : st.disabled ? colors.separator : isToday ? colors.tint : colors.text },
                    (st.selected || isToday) && grid.bold,
                  ]}>
                    {day}
                  </Text>
                </View>
              </TouchableOpacity>
            );
          })}
        </View>
      ))}
    </View>
  );
}

/** 월 이동 헤더 (‹ 2026년 9월 ›) */
function MonthNav({ year, month, onMove, colors }: { year: number; month: number; onMove: (d: -1 | 1) => void; colors: ThemeColors }) {
  return (
    <View style={box.header}>
      <TouchableOpacity onPress={() => onMove(-1)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} accessibilityLabel="이전 달">
        <Text style={[box.arrow, { color: colors.tint }]}>‹</Text>
      </TouchableOpacity>
      <Text style={[box.title, { color: colors.text }]}>{year}년 {month}월</Text>
      <TouchableOpacity onPress={() => onMove(1)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} accessibilityLabel="다음 달">
        <Text style={[box.arrow, { color: colors.tint }]}>›</Text>
      </TouchableOpacity>
    </View>
  );
}

function useMonthState(initial: string) {
  const base = parseDate(initial || todayString());
  const [ym, setYm] = useState({ year: base.getFullYear(), month: base.getMonth() + 1 });
  const move = (delta: -1 | 1) => setYm((p) => shiftMonth(p.year, p.month, delta));
  return { ...ym, move };
}

// ── 단일 날짜 필드 ─────────────────────────────────────────────

interface DateFieldProps {
  label: string;
  value: string;
  onChange: (date: string) => void;
  colors: ThemeColors;
}

export function DateField({ label, value, onChange, colors }: DateFieldProps) {
  const [open, setOpen] = useState(false);
  return (
    <View style={field.wrap}>
      <Text style={[field.label, { color: colors.subtext }]}>{label}</Text>
      <FieldBox text={formatFullDate(value)} open={open} onPress={() => setOpen((o) => !o)} colors={colors} />
      {open && (
        <SingleCalendar value={value} colors={colors} onSelect={(d) => { onChange(d); setOpen(false); }} />
      )}
    </View>
  );
}

function SingleCalendar({ value, onSelect, colors }: { value: string; onSelect: (d: string) => void; colors: ThemeColors }) {
  const m = useMonthState(value);
  return (
    <View style={[box.panel, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
      <MonthNav year={m.year} month={m.month} onMove={m.move} colors={colors} />
      <CalendarGrid year={m.year} month={m.month} colors={colors} onSelect={onSelect} getState={(d) => ({ selected: d === value })} />
    </View>
  );
}

function FieldBox({ text, placeholder, open, onPress, colors }: {
  text: string; placeholder?: boolean; open: boolean; onPress: () => void; colors: ThemeColors;
}) {
  return (
    <TouchableOpacity
      style={[field.box, { borderColor: open ? colors.tint : colors.separator, backgroundColor: colors.card }]}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <Text style={[field.value, { color: placeholder ? colors.subtext : colors.text }]}>{text}</Text>
      <Text style={[field.chevron, { color: colors.subtext }]}>{open ? "▲" : "▼"}</Text>
    </TouchableOpacity>
  );
}

// ── 일정 날짜·시간 통합 필드 (수정 6번) ─────────────────────────

export interface ScheduleWhen {
  date: string;      // 시작일
  endDate: string;   // 종료일 — 하루 일정이면 ''
  time: string;      // 시작 시간 — 종일이면 ''
  endTime: string;   // 종료 시간 — 정하지 않으면 ''
}

const HOURS = Array.from({ length: 24 }, (_, h) => String(h).padStart(2, "0"));
const MINUTES = Array.from({ length: 12 }, (_, i) => String(i * 5).padStart(2, "0"));

/** 접힌 상태에서 보여줄 요약 — '9월 28일 (월) 14:00 ~ 15:30', '9월 29일 (화) 14:00 ~ 10월 2일 (금) 11:00' */
function summarize(w: ScheduleWhen): string {
  const start = `${formatMonthDay(w.date)}${w.time ? ` ${w.time}` : ""}`;
  if (w.endDate) return `${start} ~ ${formatMonthDay(w.endDate)}${w.endTime ? ` ${w.endTime}` : ""}`;
  if (w.time) return `${start}${w.endTime ? ` ~ ${w.endTime}` : ""}`;
  return `${start} · 종일`;
}

export function ScheduleWhenField({ value, onChange, colors, initiallyOpen = false }: {
  value: ScheduleWhen;
  onChange: (w: ScheduleWhen) => void;
  colors: ThemeColors;
  initiallyOpen?: boolean;
}) {
  const [open, setOpen] = useState(initiallyOpen);
  // 다음 탭이 종료일을 정하는지 — 시작일을 막 고른 직후에만 true
  const [pickingEnd, setPickingEnd] = useState(false);
  const [activeTime, setActiveTime] = useState<"start" | "end">("start");
  const m = useMonthState(value.date);

  const selectDay = (d: string) => {
    if (!pickingEnd || d < value.date) {
      // 첫 탭(또는 시작일보다 앞 날짜) → 시작일을 새로 정하고 종료일은 비운다
      onChange({ ...value, date: d, endDate: "" });
      setPickingEnd(true);
    } else {
      // 두 번째 탭 → 종료일. 시작일을 다시 누르면 하루 일정
      onChange({ ...value, endDate: d === value.date ? "" : d });
      setPickingEnd(false);
    }
  };

  const lastDay = value.endDate || value.date;
  const dayState = (d: string): DayState => ({
    selected: d === value.date || d === value.endDate,
    inRange: !!value.endDate && d > value.date && d < value.endDate,
  });

  // 시간 선택 — 시를 먼저 누르면 분은 00, 종료 시간은 시작 시간이 있어야 고를 수 있다
  const current = activeTime === "start" ? value.time : value.endTime;
  const [h, mm] = current ? current.split(":") : ["", ""];
  const setTime = (t: string) =>
    onChange(activeTime === "start" ? { ...value, time: t, endTime: t ? value.endTime : "" } : { ...value, endTime: t });

  const chip = (label: string, selected: boolean, onPress: () => void) => (
    <TouchableOpacity
      key={label}
      onPress={onPress}
      style={[field.chip, { borderColor: selected ? colors.tint : colors.separator, backgroundColor: selected ? colors.tint : colors.card }]}
    >
      <Text style={[field.chipText, { color: selected ? "#fff" : colors.text }]}>{label}</Text>
    </TouchableOpacity>
  );

  const timeBox = (which: "start" | "end", label: string, v: string, placeholder: string, disabled = false) => {
    const active = activeTime === which;
    return (
      <TouchableOpacity
        style={[field.timeBox, { borderColor: active ? colors.tint : colors.separator, backgroundColor: colors.background, opacity: disabled ? 0.4 : 1 }]}
        onPress={() => setActiveTime(which)}
        disabled={disabled}
        accessibilityState={{ selected: active, disabled }}
      >
        <Text style={[field.timeLabel, { color: colors.subtext }]}>{label}</Text>
        <Text style={[field.timeValue, { color: v ? colors.text : colors.subtext }]}>{v || placeholder}</Text>
      </TouchableOpacity>
    );
  };

  return (
    <View style={field.wrap}>
      <Text style={[field.label, { color: colors.subtext }]}>날짜·시간</Text>
      <FieldBox text={summarize(value)} open={open} onPress={() => setOpen((o) => !o)} colors={colors} />
      {open && (
        <View style={[box.panel, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
          <MonthNav year={m.year} month={m.month} onMove={m.move} colors={colors} />
          <CalendarGrid year={m.year} month={m.month} colors={colors} onSelect={selectDay} getState={dayState} />
          <Text style={[field.help, { color: colors.subtext }]}>
            {pickingEnd
              ? "여러 날 일정이면 종료일을 누르세요. 하루 일정이면 그대로 두면 됩니다."
              : value.endDate
                ? `${formatMonthDay(value.date)} ~ ${formatMonthDay(lastDay)} · 다시 누르면 시작일부터 새로 고릅니다.`
                : "날짜를 누르면 시작일, 한 번 더 누르면 종료일이 됩니다."}
          </Text>

          <View style={[field.divider, { backgroundColor: colors.separator }]} />

          {/* 시작·종료 시간을 나란히 두고, 누른 쪽을 아래 칩으로 고른다 */}
          <View style={field.timeRow}>
            {timeBox("start", value.endDate ? "시작 시간 (첫날)" : "시작 시간", value.time, "종일")}
            {timeBox("end", value.endDate ? "종료 시간 (마지막 날)" : "종료 시간", value.endTime, "선택 안 함", !value.time)}
          </View>
          <Text style={[field.pickerLabel, { color: colors.subtext }]}>시</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={field.chips}>
            {HOURS.map((hh) => chip(hh, hh === h, () => setTime(`${hh}:${mm || "00"}`)))}
          </ScrollView>
          <Text style={[field.pickerLabel, { color: colors.subtext }]}>분</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={field.chips}>
            {MINUTES.map((m2) => chip(m2, m2 === mm, () => setTime(`${h || "09"}:${m2}`)))}
          </ScrollView>
          <View style={field.panelFooter}>
            <TouchableOpacity onPress={() => setTime("")} disabled={!current}>
              <Text style={[field.clearText, { color: current ? colors.subtext : colors.separator }]}>
                {activeTime === "start" ? "종일로 설정" : "종료 시간 지우기"}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setOpen(false)} style={[field.doneBtn, { backgroundColor: colors.tintLight }]}>
              <Text style={[field.doneText, { color: colors.tint }]}>완료</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
    </View>
  );
}

// ── 스타일 ───────────────────────────────────────────────────

const grid = StyleSheet.create({
  row: { flexDirection: "row" },
  weekday: { flex: 1, textAlign: "center", fontSize: 11, fontWeight: "600", marginBottom: 4 },
  cell: { flex: 1, height: 38, alignItems: "center", justifyContent: "center" },
  circle: { width: 32, height: 32, borderRadius: 16, alignItems: "center", justifyContent: "center" },
  dayText: { fontSize: 14 },
  bold: { fontWeight: "700" },
});

const box = StyleSheet.create({
  panel: { borderWidth: 1, borderRadius: 12, padding: 10, marginTop: 6, gap: 6 },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 8, marginBottom: 2 },
  arrow: { fontSize: 24, fontWeight: "300", paddingHorizontal: 6 },
  title: { fontSize: 15, fontWeight: "700" },
});

const field = StyleSheet.create({
  wrap: { gap: 4 },
  label: { fontSize: 12, fontWeight: "500", marginTop: 8 },
  box: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    borderWidth: 1, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, gap: 8,
  },
  value: { flex: 1, fontSize: 15 },
  chevron: { fontSize: 10 },
  help: { fontSize: 11, lineHeight: 16, paddingHorizontal: 4 },
  divider: { height: StyleSheet.hairlineWidth, marginVertical: 4 },
  timeRow: { flexDirection: "row", gap: 8 },
  timeBox: { flex: 1, borderWidth: 1.5, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, gap: 2 },
  timeLabel: { fontSize: 11 },
  timeValue: { fontSize: 17, fontWeight: "700", fontVariant: ["tabular-nums"] },
  pickerLabel: { fontSize: 11, fontWeight: "600" },
  chips: { gap: 6 },
  chip: { borderWidth: 1, borderRadius: 16, paddingHorizontal: 12, paddingVertical: 7 },
  chipText: { fontSize: 13, fontVariant: ["tabular-nums"] },
  panelFooter: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 4 },
  clearText: { fontSize: 13 },
  doneBtn: { borderRadius: 14, paddingHorizontal: 16, paddingVertical: 7 },
  doneText: { fontSize: 13, fontWeight: "700" },
});
