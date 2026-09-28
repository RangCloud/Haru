/**
 * 날짜 이동 시트 (수정 1번)
 *
 * 달력 상단 '2026년 9월'을 누르면 열린다. 연도(‹ 2026 ›) → 월(1~12) → 일 순서로 고르면
 * 달력이 그 날짜로 바로 이동한다. 먼 달로 갈 때 화살표를 여러 번 누르지 않아도 된다.
 */

import { useEffect, useState } from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";

import { Colors } from "@/constants/theme";
import { BottomSheet } from "@/src/components/BottomSheet";
import { CalendarGrid } from "@/src/components/DateTimeFields";
import { parseDate } from "@/src/utils/date";

interface DateJumpSheetProps {
  visible: boolean;
  onClose: () => void;
  selectedDate: string;              // 지금 달력에서 선택된 날짜 (열 때 이 연월에서 시작)
  onJump: (date: string) => void;
  colors: typeof Colors.light;
}

const MONTHS = Array.from({ length: 12 }, (_, i) => i + 1);

export function DateJumpSheet({ visible, onClose, selectedDate, onJump, colors }: DateJumpSheetProps) {
  const [year, setYear] = useState(0);
  const [month, setMonth] = useState(1);

  // 열 때마다 현재 선택된 날짜의 연월에서 시작
  useEffect(() => {
    if (!visible) return;
    const d = parseDate(selectedDate);
    setYear(d.getFullYear());
    setMonth(d.getMonth() + 1);
  }, [visible, selectedDate]);

  const jump = (date: string) => { onJump(date); onClose(); };

  return (
    <BottomSheet visible={visible} onClose={onClose} title="날짜 이동" colors={colors}>
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
            const on = m === month;
            return (
              <TouchableOpacity
                key={m}
                onPress={() => setMonth(m)}
                style={[styles.monthChip, { borderColor: on ? colors.tint : colors.separator, backgroundColor: on ? colors.tint : colors.card }]}
                accessibilityState={{ selected: on }}
              >
                <Text style={[styles.monthText, { color: on ? "#fff" : colors.text }]}>{m}월</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      ))}

      {/* 일 — 고른 연월의 달력에서 날짜를 누르면 바로 이동 */}
      <Text style={[styles.label, { color: colors.subtext }]}>{year}년 {month}월 — 날짜를 누르면 이동합니다</Text>
      {year > 0 && (
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
