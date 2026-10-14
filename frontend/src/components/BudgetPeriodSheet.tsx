/**
 * 가계부 기간 선택 시트 — 홈 가계부 카드 제목·가계부 탭 상단 '2026년 10월 ▾'를 누르면 열린다.
 *
 * 두 가지 방식으로 기간을 고른다 (위쪽 '월 단위 / 기간 직접 선택'으로 전환).
 *
 * 1) 월 단위 (기본)
 *    - 연도 ‹ › + 월 4×3 칩. 월을 누르면 바로 그 기간으로 바뀌고 창이 닫힌다.
 *    - '한 달 시작일'(1~31일, 말일): 정하면 그날부터 다음 달 전날까지가 한 달이 된다.
 *      예) 10일 → 10월 = 10월 10일 ~ 11월 9일. 설정에 저장되어 홈·가계부 탭·소비 분석이 함께 따른다.
 *      기본값 1일이면 지금까지와 똑같이 1일~말일이다.
 *
 * 2) 기간 직접 선택
 *    - 달력에서 시작일 → 종료일 순서로 누른다. 다른 달로 넘어가 종료일을 골라도 된다.
 *    - 이번 주·지난 7일·지난 30일·올해는 버튼 한 번으로 채운다.
 *    - 저장하지 않는 일회성 보기다 (앱을 다시 켜면 이번 달로 돌아간다).
 *
 * 기간 계산 규칙은 src/utils/budgetPeriod.ts 한 곳에만 둔다.
 * 홈과 가계부 탭이 같은 동작을 해야 하므로, 두 화면이 각각 콜백을 넘기지 않고 이 시트가 store를 직접 쓴다.
 */

import { useEffect, useState } from "react";
import { Pressable, StyleSheet, TouchableOpacity, View } from "react-native";

import { Colors } from "@/constants/theme";
import { Text } from "@/src/components/AppText";
import { BottomSheet } from "@/src/components/BottomSheet";
import { CalendarGrid } from "@/src/components/DateTimeFields";
import { useBudgetStore } from "@/src/store/budgetStore";
import { useSettingsStore } from "@/src/store/settingsStore";
import {
  formatRange, formatStartDay, MONTH_START_LAST, monthPeriod, periodOfDate, rangeDays,
} from "@/src/utils/budgetPeriod";
import { formatMonthDay, parseDate, shiftMonth, toDateStr, todayString } from "@/src/utils/date";

interface BudgetPeriodSheetProps {
  visible: boolean;
  onClose: () => void;
  colors: typeof Colors.light;
}

type Tab = "month" | "range";

const MONTHS = Array.from({ length: 12 }, (_, i) => i + 1);
// 시작일 칸 — 1~31일 다음에 '말일'을 두 칸 너비로 붙인다 (31일과 결과는 같지만 "항상 마지막 날"을 바로 찾게)
const START_DAYS = Array.from({ length: 31 }, (_, i) => i + 1);
const HIT = { top: 12, bottom: 12, left: 12, right: 12 };

const fmt = (d: Date) => toDateStr(d.getFullYear(), d.getMonth() + 1, d.getDate());

/** 빠른 선택 버튼 — 모두 오늘을 기준으로 계산한다 */
function quickRanges(today: string): { label: string; start: string; end: string }[] {
  const t = parseDate(today);
  const ago = (n: number) => fmt(new Date(t.getFullYear(), t.getMonth(), t.getDate() - n));
  return [
    // 주는 달력·소비 분석과 같이 일요일에 시작한다
    { label: "이번 주", start: ago(t.getDay()), end: ago(t.getDay() - 6) },
    { label: "지난 7일", start: ago(6), end: today },
    { label: "지난 30일", start: ago(29), end: today },
    { label: "올해", start: toDateStr(t.getFullYear(), 1, 1), end: today },
  ];
}

export function BudgetPeriodSheet({ visible, onClose, colors }: BudgetPeriodSheetProps) {
  const { homeYear, homeMonth, homeRange, homeCustom, loadHomeMonth, loadHomeRange } = useBudgetStore();
  const { monthStartDay, setMonthStartDay } = useSettingsStore();
  const today = todayString();
  const current = periodOfDate(today, monthStartDay);

  const [tab, setTab] = useState<Tab>("month");
  const [year, setYear] = useState(homeYear);
  const [startDayOpen, setStartDayOpen] = useState(false);
  // 기간 직접 선택 — 아직 확정 전의 시작·종료일과, 달력에 보이는 달
  const [draftStart, setDraftStart] = useState<string | null>(null);
  const [draftEnd, setDraftEnd] = useState<string | null>(null);
  const [calYear, setCalYear] = useState(homeYear);
  const [calMonth, setCalMonth] = useState(homeMonth);

  // 열 때마다 지금 보고 있는 기간에서 시작한다 — 직접 고른 기간을 보고 있었으면 그 탭으로 연다
  useEffect(() => {
    if (!visible) return;
    setTab(homeCustom ? "range" : "month");
    setYear(homeYear);
    setStartDayOpen(false);
    setDraftStart(homeCustom ? homeRange.start : null);
    setDraftEnd(homeCustom ? homeRange.end : null);
    const s = parseDate(homeCustom ? homeRange.start : today);
    setCalYear(s.getFullYear());
    setCalMonth(s.getMonth() + 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  // ── 월 단위 ──

  const pickMonth = (m: number) => {
    loadHomeMonth(year, m);
    onClose();
  };

  const pickStartDay = async (day: number) => {
    setStartDayOpen(false);
    // 새 시작일을 먼저 저장해야 아래 loadHomeMonth가 새 기준으로 기간을 계산한다
    await setMonthStartDay(day);
    if (homeCustom) return;   // 직접 고른 기간을 보는 중이면 그 기간은 그대로 둔다
    // '이번 달'을 보고 있었다면 새 기준의 이번 달로 옮긴다 — 시작일 25일이면 10월 15일은 '9월' 기간이므로.
    // 다른 달을 보고 있었다면 같은 이름의 달을 새 기준으로 다시 계산한다.
    const wasCurrent = homeYear === current.year && homeMonth === current.month;
    const next = wasCurrent ? periodOfDate(today, day) : { year: homeYear, month: homeMonth };
    loadHomeMonth(next.year, next.month);
  };

  // 미리보기 — 지금 보고 있는 달(직접 고른 기간이면 이번 달)이 새 기준에서 어떤 날짜가 되는지
  const previewName = homeCustom ? current : { year: homeYear, month: homeMonth };
  const preview = monthPeriod(previewName.year, previewName.month, monthStartDay);

  // ── 기간 직접 선택 ──

  // 시작일이 없거나 이미 두 날을 골랐으면 새로 시작, 시작일보다 앞을 누르면 시작일을 옮긴다
  const pressDay = (date: string) => {
    if (!draftStart || draftEnd) { setDraftStart(date); setDraftEnd(null); return; }
    if (date < draftStart) { setDraftStart(date); return; }
    setDraftEnd(date);
  };

  const pickQuick = (start: string, end: string) => {
    setDraftStart(start);
    setDraftEnd(end);
    const s = parseDate(start);
    setCalYear(s.getFullYear());
    setCalMonth(s.getMonth() + 1);
  };

  const moveCal = (delta: number) => {
    const n = shiftMonth(calYear, calMonth, delta);
    setCalYear(n.year);
    setCalMonth(n.month);
  };

  // 종료일을 안 골랐으면 하루짜리 기간으로 본다
  const draftRange = draftStart ? { start: draftStart, end: draftEnd ?? draftStart } : null;

  const applyRange = () => {
    if (!draftRange) return;
    loadHomeRange(draftRange);
    onClose();
  };

  const footer = tab === "range" ? (
    <TouchableOpacity
      onPress={applyRange}
      disabled={!draftRange}
      style={[styles.applyBtn, { backgroundColor: colors.tint, opacity: draftRange ? 1 : 0.4 }]}
      accessibilityRole="button"
      accessibilityState={{ disabled: !draftRange }}
    >
      <Text style={styles.applyText}>이 기간 보기</Text>
    </TouchableOpacity>
  ) : undefined;

  return (
    <BottomSheet visible={visible} onClose={onClose} title="기간 선택" colors={colors} footer={footer}>
      {/* 월 단위 / 기간 직접 선택 */}
      <View style={[styles.segment, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
        {([["month", "월 단위"], ["range", "기간 직접 선택"]] as const).map(([value, label]) => {
          const on = tab === value;
          return (
            <TouchableOpacity
              key={value}
              onPress={() => setTab(value)}
              style={[styles.segmentBtn, on && { backgroundColor: colors.tint }]}
              accessibilityRole="tab"
              accessibilityState={{ selected: on }}
            >
              <Text style={[styles.segmentText, { color: on ? "#fff" : colors.subtext }]}>{label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {tab === "month" ? (
        <>
          {/* 연도 */}
          <View style={styles.yearRow}>
            <TouchableOpacity onPress={() => setYear((y) => y - 1)} hitSlop={HIT} accessibilityRole="button" accessibilityLabel="이전 연도">
              <Text style={[styles.arrow, { color: colors.tint }]}>‹</Text>
            </TouchableOpacity>
            <Text style={[styles.year, { color: colors.text }]}>{year}년</Text>
            <TouchableOpacity onPress={() => setYear((y) => y + 1)} hitSlop={HIT} accessibilityRole="button" accessibilityLabel="다음 연도">
              <Text style={[styles.arrow, { color: colors.tint }]}>›</Text>
            </TouchableOpacity>
          </View>

          {/* 월 — 4칸씩 3줄. 보고 있는 달은 채우고, 이번 달(오늘이 든 기간)은 테두리로 알린다 */}
          {[0, 1, 2].map((row) => (
            <View key={row} style={styles.monthRow}>
              {MONTHS.slice(row * 4, row * 4 + 4).map((m) => {
                const on = !homeCustom && year === homeYear && m === homeMonth;
                const isCurrent = !on && year === current.year && m === current.month;
                return (
                  <TouchableOpacity
                    key={m}
                    onPress={() => pickMonth(m)}
                    style={[styles.monthChip, {
                      borderColor: on || isCurrent ? colors.tint : colors.separator,
                      backgroundColor: on ? colors.tint : colors.card,
                    }]}
                    accessibilityRole="button"
                    accessibilityState={{ selected: on }}
                    accessibilityLabel={`${year}년 ${m}월${isCurrent ? ", 이번 달" : ""}`}
                  >
                    <Text style={[styles.monthText, { color: on ? "#fff" : isCurrent ? colors.tint : colors.text }]}>{m}월</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          ))}

          {/* 한 달 시작일 — 누르면 아래에 날짜 고르기가 펼쳐진다 */}
          <TouchableOpacity
            onPress={() => setStartDayOpen((v) => !v)}
            style={[styles.startRow, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}
            accessibilityRole="button"
            accessibilityState={{ expanded: startDayOpen }}
            accessibilityLabel={`한 달 시작일, 지금 ${formatStartDay(monthStartDay)}, 눌러서 바꾸기`}
          >
            <View style={styles.startTextBox}>
              <Text style={[styles.startTitle, { color: colors.text }]}>한 달 시작일</Text>
              <Text style={[styles.startDesc, { color: colors.subtext }]}>
                원하는 날을 정하면 그날부터 다음달 전날까지가 한 달이 돼요.
              </Text>
            </View>
            <View style={[styles.dropdown, { backgroundColor: colors.background, borderColor: startDayOpen ? colors.tint : colors.cardBorder }]}>
              <Text style={[styles.dropdownText, { color: colors.text }]}>{formatStartDay(monthStartDay)}</Text>
              <Text style={[styles.dropdownCaret, { color: startDayOpen ? colors.tint : colors.subtext }]}>{startDayOpen ? "▲" : "▼"}</Text>
            </View>
          </TouchableOpacity>

          {startDayOpen && (
            <View style={[styles.dayGrid, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
              {/* 7칸씩 한 줄로 그린다 — % 너비 + 줄바꿈은 기기에 따라 칸이 밀린다 (date.ts buildCalendarWeeks 주석 참고) */}
              {[0, 1, 2, 3, 4].map((row) => (
                <View key={row} style={styles.dayRow}>
                  {START_DAYS.slice(row * 7, row * 7 + 7).map((d) => (
                    <StartDayCell key={d} label={String(d)} on={d === monthStartDay} onPress={() => pickStartDay(d)} colors={colors} a11y={`${d}일`} />
                  ))}
                  {row === 4 && (
                    <StartDayCell label="말일" wide on={monthStartDay === MONTH_START_LAST} onPress={() => pickStartDay(MONTH_START_LAST)} colors={colors} a11y="말일" />
                  )}
                  {/* 마지막 줄 남는 자리 — 칸 너비가 다른 줄과 같게 빈칸으로 채운다 (29~31일 + 말일 두 칸 = 5칸, 2칸 남음) */}
                  {row === 4 && [0, 1].map((i) => <View key={`e${i}`} style={styles.daySlot} />)}
                </View>
              ))}
            </View>
          )}

          <View style={[styles.preview, { backgroundColor: colors.tintLight }]}>
            <Text style={[styles.previewText, { color: colors.text }]}>
              {previewName.month}월 = <Text style={[styles.previewBold, { color: colors.text }]}>{formatRange(preview)}</Text>
            </Text>
            {monthStartDay !== 1 && (
              <Text style={[styles.previewSub, { color: colors.subtext }]}>홈·가계부 탭·소비 분석이 모두 이 기준을 따라요.</Text>
            )}
          </View>
          <Text style={[styles.hint, { color: colors.subtext }]}>월을 누르면 바로 그 기간으로 바뀌어요.</Text>
        </>
      ) : (
        <>
          {/* 빠른 선택 */}
          <View style={styles.quickRow}>
            {quickRanges(today).map((q) => {
              const on = draftStart === q.start && draftEnd === q.end;
              return (
                <TouchableOpacity
                  key={q.label}
                  onPress={() => pickQuick(q.start, q.end)}
                  style={[styles.quickChip, { backgroundColor: on ? colors.tintLight : colors.card, borderColor: on ? colors.tint : colors.cardBorder }]}
                  accessibilityRole="button"
                  accessibilityState={{ selected: on }}
                >
                  <Text style={[styles.quickText, { color: on ? colors.tint : colors.subtext }, on && styles.bold]}>{q.label}</Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* 달력 — 시작·종료일은 동그라미, 사이 날짜는 연한 색으로 이어진다 */}
          <View style={[styles.calBox, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
            <View style={styles.calHead}>
              <TouchableOpacity onPress={() => moveCal(-1)} hitSlop={HIT} accessibilityRole="button" accessibilityLabel="이전 달">
                <Text style={[styles.arrow, { color: colors.tint }]}>‹</Text>
              </TouchableOpacity>
              <Text style={[styles.calTitle, { color: colors.text }]}>{calYear}년 {calMonth}월</Text>
              <TouchableOpacity onPress={() => moveCal(1)} hitSlop={HIT} accessibilityRole="button" accessibilityLabel="다음 달">
                <Text style={[styles.arrow, { color: colors.tint }]}>›</Text>
              </TouchableOpacity>
            </View>
            <CalendarGrid
              year={calYear}
              month={calMonth}
              colors={colors}
              onSelect={pressDay}
              getState={(d) => ({
                selected: d === draftStart || d === draftEnd,
                inRange: !!draftStart && !!draftEnd && d > draftStart && d < draftEnd,
              })}
            />
          </View>

          <View style={[styles.preview, { backgroundColor: colors.tintLight }]}>
            <Text style={[styles.previewText, { color: colors.text }]}>
              {draftRange ? (
                <>
                  {formatMonthDay(draftRange.start)} ~ {formatMonthDay(draftRange.end)} ·{" "}
                  <Text style={[styles.previewBold, { color: colors.text }]}>{rangeDays(draftRange)}일</Text>
                </>
              ) : "시작일을 골라 주세요"}
            </Text>
          </View>
          <Text style={[styles.hint, { color: colors.subtext }]}>
            시작일을 누르고 종료일을 누르세요. 다른 달로 넘어가 종료일을 골라도 돼요.
          </Text>
        </>
      )}
    </BottomSheet>
  );
}

/** 시작일 칸 하나 — 고른 날은 채운 색 + 굵은 글자로 (색만으로 구분하지 않게) */
function StartDayCell({ label, on, wide, onPress, colors, a11y }: {
  label: string; on: boolean; wide?: boolean; onPress: () => void; colors: typeof Colors.light; a11y: string;
}) {
  return (
    <View style={[styles.daySlot, wide && styles.daySlotWide]}>
      <Pressable
        onPress={onPress}
        style={({ pressed }) => [styles.dayCell, on && { backgroundColor: colors.tint }, pressed && styles.pressed]}
        accessibilityRole="button"
        accessibilityState={{ selected: on }}
        accessibilityLabel={`한 달 시작일 ${a11y}`}
      >
        <Text style={[styles.dayText, { color: on ? "#fff" : wide ? colors.subtext : colors.text }, on && styles.bold]}>{label}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  segment: { flexDirection: "row", borderRadius: 12, borderWidth: 1, overflow: "hidden" },
  segmentBtn: { flex: 1, alignItems: "center", paddingVertical: 10 },
  segmentText: { fontSize: 14, fontWeight: "600" },
  yearRow: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 28 },
  arrow: { fontSize: 30, fontWeight: "300", paddingHorizontal: 8 },
  year: { fontSize: 20, fontWeight: "700", minWidth: 90, textAlign: "center", fontVariant: ["tabular-nums"] },
  monthRow: { flexDirection: "row", gap: 8 },
  monthChip: { flex: 1, borderWidth: 1, borderRadius: 10, paddingVertical: 10, alignItems: "center" },
  monthText: { fontSize: 14, fontWeight: "600" },
  startRow: { flexDirection: "row", alignItems: "center", gap: 10, borderWidth: 1, borderRadius: 12, padding: 12, marginTop: 4 },
  startTextBox: { flex: 1, gap: 2 },
  startTitle: { fontSize: 14, fontWeight: "600" },
  startDesc: { fontSize: 12, lineHeight: 17 },
  dropdown: { flexDirection: "row", alignItems: "center", gap: 8, borderWidth: 1, borderRadius: 10, paddingVertical: 8, paddingLeft: 12, paddingRight: 10 },
  dropdownText: { fontSize: 15, fontWeight: "700", fontVariant: ["tabular-nums"] },
  dropdownCaret: { fontSize: 10 },
  dayGrid: { borderWidth: 1, borderRadius: 12, padding: 6 },
  dayRow: { flexDirection: "row" },
  daySlot: { flex: 1, padding: 1 },
  daySlotWide: { flex: 2 },
  // 칸이 7개라 가로는 좁지만 세로를 40으로 두어 누르기 쉽게 한다
  dayCell: { height: 40, borderRadius: 8, alignItems: "center", justifyContent: "center" },
  dayText: { fontSize: 14, fontVariant: ["tabular-nums"] },
  pressed: { opacity: 0.6 },
  bold: { fontWeight: "700" },
  preview: { borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, gap: 2 },
  previewText: { fontSize: 13, lineHeight: 19 },
  previewBold: { fontWeight: "700" },
  previewSub: { fontSize: 12 },
  hint: { fontSize: 12 },
  quickRow: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  quickChip: { borderWidth: 1, borderRadius: 16, paddingHorizontal: 12, paddingVertical: 8 },
  quickText: { fontSize: 13 },
  calBox: { borderWidth: 1, borderRadius: 12, padding: 10 },
  calHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 4 },
  calTitle: { fontSize: 15, fontWeight: "700" },
  applyBtn: { borderRadius: 14, paddingVertical: 14, alignItems: "center" },
  applyText: { color: "#fff", fontSize: 16, fontWeight: "600" },
});
