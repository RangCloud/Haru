/**
 * 일정 탭 메인 달력
 *
 * 피드백 반영:
 *  3번  오늘 = 테두리 원만 (일정 색과 헷갈리지 않게). 선택한 날 = 채운 원.
 *  5번  달력을 좌우로 밀면 이전/다음 달로 이동.
 *  10번 날짜 아래 짧은 막대 — 지출 있으면 빨강, 수입 있으면 초록.
 *  16번 일정 점은 그 일정에 고른 색상 그대로 (같은 날 여러 색이면 최대 3개).
 *
 * 스와이프는 PanResponder(React Native 기본 기능)로 구현해 새 라이브러리가 필요 없다.
 * 가로로 충분히 움직였을 때만 스와이프로 가로채므로 날짜 탭은 그대로 동작한다.
 */

import { useRef } from "react";
import { PanResponder, StyleSheet, Text, TouchableOpacity, View } from "react-native";

import { Colors } from "@/constants/theme";
import { buildCalendarDays, toDateStr, todayString, WEEKDAYS_KO } from "@/src/utils/date";

export interface DayMark {
  scheduleColors: string[];   // 그날 일정들의 색 (중복 제거, 최대 3개로 잘라서 표시)
  income: boolean;
  expense: boolean;
}

interface MonthCalendarProps {
  year: number;
  month: number;
  selectedDate: string;
  marks: Record<string, DayMark>;
  onSelectDate: (date: string) => void;
  onSwipeMonth: (delta: -1 | 1) => void;
  colors: typeof Colors.light;
}

const SWIPE_DISTANCE = 50;   // 이만큼 밀어야 달이 넘어간다
const MAX_SCHEDULE_DOTS = 3;

export function MonthCalendar({ year, month, selectedDate, marks, onSelectDate, onSwipeMonth, colors }: MonthCalendarProps) {
  const today = todayString();
  const days = buildCalendarDays(year, month);

  // PanResponder는 한 번만 만들고, 최신 콜백은 ref로 읽는다 (재생성 시 제스처가 끊기는 것 방지)
  const swipeRef = useRef(onSwipeMonth);
  swipeRef.current = onSwipeMonth;
  const pan = useRef(
    PanResponder.create({
      // Capture: 날짜 버튼보다 먼저 판단 — 가로 이동이 세로보다 확실히 클 때만 스와이프로 가져온다
      onMoveShouldSetPanResponderCapture: (_, g) => Math.abs(g.dx) > 15 && Math.abs(g.dx) > Math.abs(g.dy) * 1.5,
      onPanResponderRelease: (_, g) => {
        if (g.dx <= -SWIPE_DISTANCE) swipeRef.current(1);       // 왼쪽으로 밀기 → 다음 달
        else if (g.dx >= SWIPE_DISTANCE) swipeRef.current(-1);  // 오른쪽으로 밀기 → 이전 달
      },
      onPanResponderTerminationRequest: () => true,
    }),
  ).current;

  return (
    <View style={styles.calendar} {...pan.panHandlers}>
      <View style={styles.weekdayRow}>
        {WEEKDAYS_KO.map((w, i) => (
          <Text key={w} style={[styles.weekdayText, { color: i === 0 ? colors.expense : i === 6 ? "#3B82F6" : colors.subtext }]}>
            {w}
          </Text>
        ))}
      </View>
      <View style={styles.grid}>
        {days.map((day, idx) => {
          if (day === null) return <View key={`e${idx}`} style={styles.cell} />;
          const date = toDateStr(year, month, day);
          const isSelected = date === selectedDate;
          const isToday = date === today;
          const mark = marks[date];
          const dow = idx % 7;
          const baseColor = dow === 0 ? colors.expense : dow === 6 ? "#3B82F6" : colors.text;

          return (
            <TouchableOpacity
              key={date}
              style={styles.cell}
              onPress={() => onSelectDate(date)}
              activeOpacity={0.6}
              accessibilityLabel={`${month}월 ${day}일${isToday ? ", 오늘" : ""}`}
              accessibilityState={{ selected: isSelected }}
            >
              <View style={[
                styles.dayCircle,
                isSelected && { backgroundColor: colors.tint },
                !isSelected && isToday && { borderWidth: 1.5, borderColor: colors.tint },
              ]}>
                <Text style={[
                  styles.dayText,
                  { color: isSelected ? "#fff" : isToday ? colors.tint : baseColor },
                  (isToday || isSelected) && styles.dayTextBold,
                ]}>
                  {day}
                </Text>
              </View>
              {/* 점은 원 바깥(아래)에 두어 선택 상태에서도 원래 색이 보이게 한다 */}
              <View style={styles.dots}>
                {mark?.scheduleColors.slice(0, MAX_SCHEDULE_DOTS).map((c) => (
                  <View key={c} style={[styles.dot, { backgroundColor: c }]} />
                ))}
                {/* 수입·지출은 짧은 막대 — 빨강·초록 일정 점과 모양으로도 구분되게 한다 */}
                {mark?.expense && <View style={[styles.moneyMark, { backgroundColor: colors.expense }]} />}
                {mark?.income && <View style={[styles.moneyMark, { backgroundColor: colors.income }]} />}
              </View>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  calendar: { paddingHorizontal: 12, marginBottom: 4 },
  weekdayRow: { flexDirection: "row", marginBottom: 4 },
  weekdayText: { width: `${100 / 7}%`, textAlign: "center", fontSize: 12, fontWeight: "600" },
  grid: { flexDirection: "row", flexWrap: "wrap" },
  cell: { width: `${100 / 7}%`, height: 50, alignItems: "center", paddingTop: 3 },
  dayCircle: { width: 32, height: 32, borderRadius: 16, alignItems: "center", justifyContent: "center" },
  dayText: { fontSize: 15 },
  dayTextBold: { fontWeight: "700" },
  dots: { flexDirection: "row", alignItems: "center", gap: 2, marginTop: 3, height: 5 },
  dot: { width: 5, height: 5, borderRadius: 2.5 },
  moneyMark: { width: 8, height: 3, borderRadius: 1.5 },
});
