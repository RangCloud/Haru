/**
 * 날짜별 지출 달력 (가계부 탭)
 *
 * 한 달을 작은 달력으로 그리고, 그날 지출이 많을수록 칸을 진한 빨강으로 칠한다.
 * 금액을 읽지 않아도 "언제 많이 썼는지"가 색으로 먼저 보이게 하려는 것이다.
 *
 * - 색 진하기는 그 달에서 가장 많이 쓴 날을 기준으로 한 상대값이다 (달마다 기준이 달라진다).
 * - 날짜를 누르면 그날이 선택되고, 같은 날짜를 다시 누르면 선택이 풀린다.
 *   선택 상태는 부모(가계부 탭)가 들고 있으면서 아래 내역 목록을 그날로 좁히는 데 쓴다.
 * - 선택은 색이 아니라 테두리로 표시한다 — 칸 색(지출 정도)과 겹쳐도 구분되게 하기 위함.
 *
 * 날짜 칸은 Pressable로 만들고 테두리는 항상 같은 두께로 둔다 — Android에서 날짜를 누르면
 * 다른 칸이 사라지던 문제를 피하기 위함이다 (자세한 이유는 MonthCalendar 주석 참고).
 *
 * 한 주씩 줄로 그린다 (칸 너비를 %로 주고 줄바꿈에 맡기면 날짜가 밀리는 문제는 MonthCalendar 주석 참고).
 */

import { useMemo } from "react";
import { Pressable, StyleSheet, View } from "react-native";

import { Colors } from "@/constants/theme";
import { Text, useFontScale } from "@/src/components/AppText";
import { buildCalendarWeeks, toDateStr, WEEKDAYS_KO } from "@/src/utils/date";

interface SpendingHeatCalendarProps {
  year: number;
  month: number;
  /** 날짜(YYYY-MM-DD)별 지출 합계 (원). 지출이 없는 날은 키가 없어도 된다 */
  expenseByDate: Record<string, number>;
  selectedDate: string | null;
  today: string;
  onSelectDate: (date: string | null) => void;
  colors: typeof Colors.light;
}

// 칸이 작아 글자를 많이 키우면 숫자가 잘린다 — 달력 칸과 같은 한도를 쓴다
const CELL_MAX_SCALE = 1.15;
// 가장 적게 쓴 날도 "지출이 있었다"는 것은 보이도록 최소 진하기를 둔다
const MIN_ALPHA = 0.12;
const MAX_ALPHA = 0.7;

/** 0~1 불투명도를 #RRGGBB 뒤에 붙일 두 자리 16진수로 바꾼다 */
function alphaHex(alpha: number): string {
  return Math.round(alpha * 255).toString(16).padStart(2, "0");
}

export function SpendingHeatCalendar({ year, month, expenseByDate, selectedDate, today, onSelectDate, colors }: SpendingHeatCalendarProps) {
  const weeks = useMemo(() => buildCalendarWeeks(year, month), [year, month]);
  const max = useMemo(() => Math.max(0, ...Object.values(expenseByDate)), [expenseByDate]);
  const scale = useFontScale(CELL_MAX_SCALE);

  return (
    <View>
      <View style={styles.row}>
        {WEEKDAYS_KO.map((w) => (
          <Text key={w} maxScale={CELL_MAX_SCALE} style={[styles.weekday, { color: colors.subtext }]}>{w}</Text>
        ))}
      </View>

      {weeks.map((week, wi) => (
        <View key={wi} style={styles.row}>
          {week.map((day, di) => {
            // 1일 앞·말일 뒤의 빈칸 — 자리를 차지해야 요일이 어긋나지 않는다
            if (day === null) return <View key={`empty-${di}`} style={styles.cellSlot} />;

            const date = toDateStr(year, month, day);
            const amount = expenseByDate[date] ?? 0;
            const isSelected = date === selectedDate;
            const isToday = date === today;
            const isFuture = date > today;
            // 지출이 있으면 그 달 최댓값 대비 비율만큼 진하게, 없으면 바탕색 그대로
            const background = amount > 0 && max > 0
              ? `${colors.expense}${alphaHex(MIN_ALPHA + (amount / max) * (MAX_ALPHA - MIN_ALPHA))}`
              : colors.background;

            return (
              <View key={date} style={styles.cellSlot}>
                <Pressable
                  onPress={() => onSelectDate(isSelected ? null : date)}
                  style={({ pressed }) => [
                    styles.cell,
                    { height: 30 * scale, backgroundColor: background, borderColor: isSelected ? colors.tint : "transparent" },
                    pressed && styles.pressed,
                  ]}
                  // 칸이 작으므로 눌리는 영역을 위아래로 조금 넓힌다 (옆 칸과는 겹치지 않게 세로만)
                  hitSlop={{ top: 4, bottom: 4 }}
                  accessibilityRole="button"
                  accessibilityState={{ selected: isSelected }}
                  accessibilityLabel={`${month}월 ${day}일${isToday ? ", 오늘" : ""}, ${amount > 0 ? `지출 ${amount.toLocaleString("ko-KR")}원` : "지출 없음"}`}
                >
                  <Text
                    maxScale={CELL_MAX_SCALE}
                    style={[
                      styles.dayText,
                      { color: isFuture ? colors.subtext : colors.text },
                      isFuture && styles.future,
                      isToday && styles.todayText,
                    ]}
                  >
                    {day}
                  </Text>
                </Pressable>
              </View>
            );
          })}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row" },
  weekday: { flex: 1, textAlign: "center", fontSize: 11, fontWeight: "600", paddingBottom: 4 },
  // 칸 사이 간격은 바깥 틀의 안쪽 여백으로 만든다 (gap을 쓰면 7칸 너비 계산이 기기마다 달라질 수 있다)
  cellSlot: { flex: 1, padding: 1.5 },
  cell: { borderRadius: 7, borderWidth: 2, alignItems: "center", justifyContent: "center" },
  pressed: { opacity: 0.6 },
  dayText: { fontSize: 11.5, fontVariant: ["tabular-nums"] },
  future: { opacity: 0.55 },
  todayText: { fontWeight: "800" },
});
