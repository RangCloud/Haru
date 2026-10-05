/**
 * 날짜 이동 시트 (수정 1번)
 *
 * - mode="day"(기본): 일정 탭 상단 '2026년 9월'을 누르면 열린다.
 *   연도(‹ 2026 ›) → 월(1~12) → 일 순서로 고르면 달력이 그 날짜로 바로 이동한다.
 * - mode="month": 홈 가계부 카드의 '9월 가계부 ▾'를 누르면 열린다. 연도와 월만 고르고,
 *   월을 누르는 즉시 그 달로 바뀐다 (가계부는 달 단위라 일 선택이 필요 없다).
 */

import { useEffect, useState } from "react";
import { StyleSheet, TouchableOpacity, View } from "react-native";

import { Colors } from "@/constants/theme";
import { Text } from "@/src/components/AppText";
import { BottomSheet } from "@/src/components/BottomSheet";
import { CalendarGrid } from "@/src/components/DateTimeFields";
import { parseDate } from "@/src/utils/date";

interface DateJumpSheetProps {
  visible: boolean;
  onClose: () => void;
  selectedDate: string;              // 지금 선택된 날짜 (열 때 이 연월에서 시작, month 모드는 그 달 1일)
  mode?: "day" | "month";
  onJump?: (date: string) => void;                     // day 모드: 날짜를 고르면
  onPickMonth?: (year: number, month: number) => void; // month 모드: 월을 고르면
  colors: typeof Colors.light;
}

const MONTHS = Array.from({ length: 12 }, (_, i) => i + 1);

export function DateJumpSheet({ visible, onClose, selectedDate, mode = "day", onJump, onPickMonth, colors }: DateJumpSheetProps) {
  const [year, setYear] = useState(0);
  const [month, setMonth] = useState(1);

  // 열 때마다 현재 선택된 날짜의 연월에서 시작
  useEffect(() => {
    if (!visible) return;
    const d = parseDate(selectedDate);
    setYear(d.getFullYear());
    setMonth(d.getMonth() + 1);
  }, [visible, selectedDate]);

  const jump = (date: string) => { onJump?.(date); onClose(); };
  const isMonthMode = mode === "month";

  // 월 칩 누르기: day 모드는 아래 달력만 바꾸고, month 모드는 바로 확정하고 닫는다
  const pressMonth = (m: number) => {
    if (isMonthMode) { onPickMonth?.(year, m); onClose(); }
    else setMonth(m);
  };

  // month 모드에서는 '지금 보고 있는 달'을 채워서 표시하고, 이번 달은 테두리로 알려준다
  const selected = parseDate(selectedDate);
  const now = new Date();

  return (
    <BottomSheet visible={visible} onClose={onClose} title={isMonthMode ? "월 선택" : "날짜 이동"} colors={colors}>
      {/* 연도 */}
      <View style={styles.yearRow}>
        <TouchableOpacity onPress={() => setYear((y) => y - 1)} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }} accessibilityLabel="이전 연도">
          <Text style={[styles.arrow, { color: colors.tint }]}>‹</Text>
        </TouchableOpacity>
        <Text style={[styles.year, { color: colors.text }]}>{year}년</Text>
        <TouchableOpacity onPress={() => setYear((y) => y + 1)} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }} accessibilityLabel="다음 연도">
          <Text style={[styles.arrow, { color: colors.tint }]}>›</Text>
        </TouchableOpacity>
      </View>

      {/* 월 — 4칸씩 3줄 */}
      {[0, 1, 2].map((row) => (
        <View key={row} style={styles.monthRow}>
          {MONTHS.slice(row * 4, row * 4 + 4).map((m) => {
            const on = isMonthMode
              ? year === selected.getFullYear() && m === selected.getMonth() + 1
              : m === month;
            const isCurrent = isMonthMode && !on && year === now.getFullYear() && m === now.getMonth() + 1;
            return (
              <TouchableOpacity
                key={m}
                onPress={() => pressMonth(m)}
                style={[styles.monthChip, {
                  borderColor: on || isCurrent ? colors.tint : colors.separator,
                  backgroundColor: on ? colors.tint : colors.card,
                }]}
                accessibilityState={{ selected: on }}
                accessibilityLabel={`${year}년 ${m}월${isCurrent ? ", 이번 달" : ""}`}
              >
                <Text style={[styles.monthText, { color: on ? "#fff" : isCurrent ? colors.tint : colors.text }]}>{m}월</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      ))}

      {isMonthMode && (
        <Text style={[styles.label, { color: colors.subtext }]}>월을 누르면 그 달의 수입·지출 합계를 보여줍니다.</Text>
      )}

      {/* 일 — 고른 연월의 달력에서 날짜를 누르면 바로 이동 (day 모드만) */}
      {!isMonthMode && (
        <Text style={[styles.label, { color: colors.subtext }]}>{year}년 {month}월 — 날짜를 누르면 이동합니다</Text>
      )}
      {!isMonthMode && year > 0 && (
        <View style={[styles.gridBox, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
          <CalendarGrid
            year={year}
            month={month}
            colors={colors}
            onSelect={jump}
            getState={(d) => ({ selected: d === selectedDate })}
          />
        </View>
      )}
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  yearRow: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 28, marginBottom: 4 },
  arrow: { fontSize: 30, fontWeight: "300", paddingHorizontal: 8 },
  year: { fontSize: 20, fontWeight: "700", minWidth: 90, textAlign: "center", fontVariant: ["tabular-nums"] },
  monthRow: { flexDirection: "row", gap: 8 },
  monthChip: { flex: 1, borderWidth: 1, borderRadius: 10, paddingVertical: 10, alignItems: "center" },
  monthText: { fontSize: 14, fontWeight: "600" },
  label: { fontSize: 12, fontWeight: "500", marginTop: 8 },
  gridBox: { borderWidth: 1, borderRadius: 12, padding: 10 },
});
