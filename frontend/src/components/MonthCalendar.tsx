/**
 * 일정 탭 메인 달력
 *
 * - 날짜 숫자는 칸 왼쪽 위. 칸 테두리 없이 주마다 옅은 가로선만 둔다.
 * - 시간 있는 일정: 왼쪽 색 막대 + 제목.
 *   종일·여러 날 일정: 연한 색 띠. 여러 날 일정은 옆 칸과 띠를 이어 한 줄처럼 보이게 하고,
 *   제목은 첫날(또는 주가 바뀐 첫 칸)에만 쓴다.
 * - 칸을 넘는 제목은 한 줄에서 '…'로 자르고, 칸에 다 못 넣으면 '+N'.
 * - 선택한 날 = 칸 테두리 + 날짜 옆 작은 점, 오늘 = 굵은 인디고 숫자.
 *   (칸을 색으로 채우지 않아 일정 색·금액 색이 선택된 날에도 그대로 보인다)
 * - 수입·지출은 칸 아래 금액(−2.2만, +320만).
 * - 앞뒤 달 날짜는 흐리게 채우고, 누르면 그 날짜로 이동한다.
 *
 * 한 주씩 줄로 그린다 — 칸 너비를 '100/7 %' + 줄바꿈으로 두면 기기에 따라 날짜가 한 칸씩 밀렸다.
 * 스와이프는 PanResponder(React Native 기본 기능)로 구현해 새 라이브러리가 필요 없다.
 */

import { useRef } from "react";
import { PanResponder, StyleSheet, Text, TouchableOpacity, View } from "react-native";

import { Colors } from "@/constants/theme";
import { buildCalendarGrid, formatCompactWon, WEEKDAYS_KO } from "@/src/utils/date";

export interface CellEvent {
  id: number;
  title: string;
  color: string;
  kind: "timed" | "band";                       // band = 종일 또는 여러 날 일정
  span: "single" | "start" | "mid" | "end";     // 여러 날 일정에서 이 칸의 위치
}

export interface DayMark {
  events: CellEvent[];
  income: number;     // 그날 수입 합계 (원)
  expense: number;    // 그날 지출 합계 (원)
}

interface MonthCalendarProps {
  year: number;
  month: number;
  selectedDate: string;
  today: string;               // 화면이 관리하는 '오늘' — 자정이 지나면 부모가 갱신한다
  marks: Record<string, DayMark>;
  onSelectDate: (date: string) => void;   // 앞뒤 달 날짜를 누르면 그 날짜가 넘어온다
  onSwipeMonth: (delta: -1 | 1) => void;
  colors: typeof Colors.light;
}

const SWIPE_DISTANCE = 50;   // 이만큼 밀어야 달이 넘어간다
const MAX_ROWS = 3;          // 칸 안 일정 줄 수 (금액이 두 줄이면 한 줄 줄인다)

export function MonthCalendar({ year, month, selectedDate, today, marks, onSelectDate, onSwipeMonth, colors }: MonthCalendarProps) {
  const weeks = buildCalendarGrid(year, month);

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
          {week.map((cell, dow) => {
            const isSelected = cell.inMonth && cell.date === selectedDate;
            const isToday = cell.date === today;
            const mark = cell.inMonth ? marks[cell.date] : undefined;

            // 칸 높이 안에 들어가도록 줄 수 계산 — 금액 두 줄이면 일정 한 줄을 양보
            const moneyLines = (mark?.expense ? 1 : 0) + (mark?.income ? 1 : 0);
            const rows = moneyLines >= 2 ? MAX_ROWS - 1 : MAX_ROWS;
            const events = mark?.events ?? [];
            const shown = events.length <= rows ? events : events.slice(0, rows - 1);
            const hidden = events.length - shown.length;

            const numColor = isToday ? colors.tint : dow === 0 ? colors.expense : dow === 6 ? "#3B82F6" : colors.text;

            return (
              <TouchableOpacity
                key={cell.date}
                style={[styles.cell, isSelected && [styles.selectedCell, { borderColor: colors.tint }], !cell.inMonth && styles.outCell]}
                onPress={() => onSelectDate(cell.date)}
                activeOpacity={0.6}
                accessibilityLabel={`${cell.day}일${isToday ? ", 오늘" : ""}${events.length ? `, 일정 ${events.length}개` : ""}`}
                accessibilityState={{ selected: isSelected }}
              >
                <View style={styles.numRow}>
                  <Text style={[styles.num, { color: numColor }, isToday && styles.numBold]}>{cell.day}</Text>
                  {isSelected && <View style={[styles.selectedDot, { backgroundColor: colors.tint }]} />}
                </View>

                {shown.map((ev) => {
                  if (ev.kind === "timed") {
                    return (
                      <Text
                        key={ev.id}
                        style={[styles.timed, { borderLeftColor: ev.color, color: colors.text }]}
                        numberOfLines={1}
                        ellipsizeMode="tail"
                      >
                        {ev.title}
                      </Text>
                    );
                  }
                  // 여러 날 일정: 첫날이나 주의 첫 칸에서만 제목을 쓰고, 나머지 칸은 띠만 이어 그린다
                  const showTitle = ev.span === "single" || ev.span === "start" || dow === 0;
                  return (
                    <View
                      key={ev.id}
                      style={[
                        styles.band,
                        styles[`band_${ev.span}`],
                        { backgroundColor: `${ev.color}33` },
                      ]}
                    >
                      <Text style={[styles.bandText, { color: ev.color }]} numberOfLines={1} ellipsizeMode="tail">
                        {showTitle ? ev.title : " "}
                      </Text>
                    </View>
                  );
                })}
                {hidden > 0 && <Text style={[styles.more, { color: colors.subtext }]}>+{hidden}</Text>}

                {/* 수입·지출 금액 — 칸 맨 아래 오른쪽 */}
                {moneyLines > 0 && (
                  <View style={styles.money}>
                    {!!mark?.expense && (
                      <Text style={[styles.moneyText, { color: colors.expense }]} numberOfLines={1}>
                        −{formatCompactWon(mark.expense)}
                      </Text>
                    )}
                    {!!mark?.income && (
                      <Text style={[styles.moneyText, { color: colors.income }]} numberOfLines={1}>
                        +{formatCompactWon(mark.income)}
                      </Text>
                    )}
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
  calendar: { paddingHorizontal: 6, marginBottom: 4 },
  weekRow: { flexDirection: "row" },
  weekLine: { borderTopWidth: StyleSheet.hairlineWidth },
  weekdayText: { flex: 1, fontSize: 11, fontWeight: "600", paddingLeft: 6, marginBottom: 4 },
  // minWidth 0 + overflow hidden: 긴 제목이 칸을 밀어 넓히거나 옆 칸으로 넘어가지 않게 한다
  cell: {
    flex: 1, minWidth: 0, height: 92, overflow: "hidden",
    paddingTop: 4, paddingBottom: 3, paddingHorizontal: 2, gap: 2, borderRadius: 9,
  },
  // 선택한 날: 칸 테두리만 (테두리 두께만큼 안쪽 여백이 줄어 내용이 흔들리지 않도록 여백을 같이 줄인다)
  selectedCell: { borderWidth: 1.5, paddingTop: 2.5, paddingBottom: 1.5, paddingHorizontal: 0.5 },
  outCell: { opacity: 0.32 },
  numRow: { flexDirection: "row", alignItems: "center", gap: 3, paddingLeft: 4, height: 18 },
  num: { fontSize: 12.5, fontWeight: "600", fontVariant: ["tabular-nums"] },
  numBold: { fontWeight: "800" },
  selectedDot: { width: 5, height: 5, borderRadius: 2.5 },
  timed: { fontSize: 9.5, lineHeight: 13, paddingLeft: 4, borderLeftWidth: 2 },
  band: { height: 14, justifyContent: "center", paddingHorizontal: 4 },
  // 칸 좌우 여백(2)만큼 띠를 늘려 옆 칸의 띠와 맞닿게 한다
  band_single: { borderRadius: 4 },
  band_start: { borderTopLeftRadius: 4, borderBottomLeftRadius: 4, marginRight: -2 },
  band_mid: { marginHorizontal: -2 },
  band_end: { borderTopRightRadius: 4, borderBottomRightRadius: 4, marginLeft: -2 },
  bandText: { fontSize: 9.5, fontWeight: "700" },
  more: { fontSize: 9, fontWeight: "700", paddingLeft: 4 },
  money: { marginTop: "auto", alignItems: "flex-end", paddingRight: 3 },
  moneyText: { fontSize: 9, lineHeight: 11, fontWeight: "700", fontVariant: ["tabular-nums"] },
});
