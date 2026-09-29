/**
 * 일정 탭 메인 달력
 *
 * - 오늘 = 테두리 원, 선택한 날 = 채운 원.
 * - 좌우로 밀면 이전/다음 달로 이동.
 * - 날짜 아래에 그날의 일정 제목을 일정 색상의 작은 띠로 보여준다 (최대 2개, 나머지는 +N).
 *   제목이 칸보다 길면 한 줄에서 '…'로 잘라 옆 날짜 칸을 침범하지 않게 한다.
 * - 칸 맨 아래 짧은 막대 — 지출 있으면 빨강, 수입 있으면 초록.
 *
 * 한 주씩 줄로 그린다. 칸 너비를 '100/7 %' + 줄바꿈으로 두면 기기에 따라
 * 7번째 칸이 다음 줄로 밀려 날짜와 요일이 어긋났다.
 * 스와이프는 PanResponder(React Native 기본 기능)로 구현해 새 라이브러리가 필요 없다.
 */

import { useRef } from "react";
import { PanResponder, StyleSheet, Text, TouchableOpacity, View } from "react-native";

import { Colors } from "@/constants/theme";
import { buildCalendarWeeks, toDateStr, WEEKDAYS_KO } from "@/src/utils/date";

export interface DayMark {
  schedules: { id: number; title: string; color: string }[];   // 그날에 걸친 일정 (시간순)
  income: boolean;
  expense: boolean;
}

interface MonthCalendarProps {
  year: number;
  month: number;
  selectedDate: string;
  today: string;               // 화면이 관리하는 '오늘' — 자정이 지나면 부모가 갱신한다
  marks: Record<string, DayMark>;
  onSelectDate: (date: string) => void;
  onSwipeMonth: (delta: -1 | 1) => void;
  colors: typeof Colors.light;
}

const SWIPE_DISTANCE = 50;      // 이만큼 밀어야 달이 넘어간다
const MAX_TITLES = 2;           // 칸 안에 보여줄 일정 제목 수 — 넘치면 '+N'

export function MonthCalendar({ year, month, selectedDate, today, marks, onSelectDate, onSwipeMonth, colors }: MonthCalendarProps) {
  const weeks = buildCalendarWeeks(year, month);

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
      <View style={styles.weekRow}>
        {WEEKDAYS_KO.map((w, i) => (
          <Text key={w} style={[styles.weekdayText, { color: i === 0 ? colors.expense : i === 6 ? "#3B82F6" : colors.subtext }]}>
            {w}
          </Text>
        ))}
      </View>
      {weeks.map((week, wi) => (
        <View key={wi} style={[styles.weekRow, styles.weekLine, { borderTopColor: colors.separator }]}>
          {week.map((day, dow) => {
            if (day === null) return <View key={`e${dow}`} style={styles.cell} />;
            const date = toDateStr(year, month, day);
            const isSelected = date === selectedDate;
            const isToday = date === today;
            const mark = marks[date];
            const shown = mark?.schedules.slice(0, MAX_TITLES) ?? [];
            const hidden = (mark?.schedules.length ?? 0) - shown.length;
            const baseColor = dow === 0 ? colors.expense : dow === 6 ? "#3B82F6" : colors.text;

            return (
              <TouchableOpacity
                key={date}
                style={[styles.cell, isSelected && { backgroundColor: colors.tintLight }]}
                onPress={() => onSelectDate(date)}
                activeOpacity={0.6}
                accessibilityLabel={`${month}월 ${day}일${isToday ? ", 오늘" : ""}${mark?.schedules.length ? `, 일정 ${mark.schedules.length}개` : ""}`}
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

                {/* 일정 제목 — 칸 너비를 넘으면 한 줄에서 '…'로 잘린다 */}
                {shown.map((s) => (
                  <View key={s.id} style={[styles.titleChip, { backgroundColor: `${s.color}2E` }]}>
                    <Text style={[styles.titleText, { color: s.color }]} numberOfLines={1} ellipsizeMode="tail">
                      {s.title}
                    </Text>
                  </View>
                ))}
                {hidden > 0 && <Text style={[styles.moreText, { color: colors.subtext }]}>+{hidden}</Text>}

                {/* 수입·지출은 칸 맨 아래 짧은 막대 */}
                {(mark?.expense || mark?.income) && (
                  <View style={styles.moneyRow}>
                    {mark.expense && <View style={[styles.moneyMark, { backgroundColor: colors.expense }]} />}
                    {mark.income && <View style={[styles.moneyMark, { backgroundColor: colors.income }]} />}
                  </View>
                )}
              </TouchableOpacity>
            );
          })}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  calendar: { paddingHorizontal: 8, marginBottom: 4 },
  weekRow: { flexDirection: "row" },
  // 주마다 옅은 가로선 — 칸이 커지면서 어느 날짜의 일정인지 구분이 쉬워진다
  weekLine: { borderTopWidth: StyleSheet.hairlineWidth },
  weekdayText: { flex: 1, textAlign: "center", fontSize: 12, fontWeight: "600", marginBottom: 4 },
  // minWidth 0: 긴 제목이 칸을 밀어 넓히지 않고 칸 너비 안에서 잘리게 한다
  cell: { flex: 1, minWidth: 0, height: 80, alignItems: "center", paddingTop: 3, paddingHorizontal: 1, gap: 2, borderRadius: 6 },
  dayCircle: { width: 26, height: 26, borderRadius: 13, alignItems: "center", justifyContent: "center" },
  dayText: { fontSize: 14 },
  dayTextBold: { fontWeight: "700" },
  titleChip: { alignSelf: "stretch", borderRadius: 3, paddingHorizontal: 2, paddingVertical: 1 },
  titleText: { fontSize: 9.5, fontWeight: "600" },
  moreText: { fontSize: 9, fontWeight: "600" },
  moneyRow: { position: "absolute", bottom: 3, flexDirection: "row", gap: 2 },
  moneyMark: { width: 8, height: 3, borderRadius: 1.5 },
});
