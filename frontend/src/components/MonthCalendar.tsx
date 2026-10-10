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
 * - 공휴일은 날짜를 빨간색으로, 옆에 공휴일 이름을 작게 쓴다 (예: 3 개천절).
 * - 앞뒤 달 날짜는 흐리게 채우고, 누르면 그 날짜로 이동한다.
 * - 글자 크기 설정은 CELL_MAX_SCALE까지만 따른다. 칸이 좁아 그 이상 키우면 일정 제목이 거의 안 보인다.
 *   커진 만큼 칸 높이도 같이 늘려 줄 수(일정 3줄)는 그대로 유지한다.
 *
 * 날짜 칸은 TouchableOpacity가 아니라 Pressable로 만든다.
 * Android에서 날짜를 누르면 누른 칸만 남고 나머지 칸의 내용이 전부 사라졌다가, 다른 탭에 다녀오면
 * 다시 나타나는 문제가 있었다. TouchableOpacity는 칸마다 투명도 애니메이션을 따로 들고 있는데,
 * 달력은 날짜를 누를 때마다 35~42칸이 한꺼번에 다시 그려지면서 누르지 않은 칸의 투명도가
 * 되돌아오지 않는 것으로 보인다(누른 칸만 애니메이션이 1로 끝나 보였다).
 * Pressable은 애니메이션 없이 눌린 동안만 스타일을 바꾸므로 이 문제가 생기지 않는다.
 * 같은 이유로 선택 테두리도 "있다/없다"로 바꾸지 않고, 항상 같은 두께로 두고 색만 투명 ↔ 인디고로 바꾼다
 * (테두리가 생기고 없어질 때 칸의 그리기 방식이 바뀌는 것을 피한다).
 *
 * 한 주씩 줄로 그린다 — 칸 너비를 '100/7 %' + 줄바꿈으로 두면 기기에 따라 날짜가 한 칸씩 밀렸다.
 * 좌우 스와이프와 미끄러지는 전환은 공용 훅(useSlideSwipe)이 맡는다 — 뉴스 탭과 같은 동작이다.
 * 달력은 세로로 스크롤되는 화면 안에 있어서, 가로 움직임이 보이는 즉시 제스처를 잡고
 * 그동안 바깥 스크롤을 잠그도록 부모에게 알린다(onSwipeActiveChange).
 */

import { Animated, Pressable, StyleSheet, View } from "react-native";

import { Colors } from "@/constants/theme";
import { Text, useFontScale } from "@/src/components/AppText";
import { useSlideSwipe } from "@/src/hooks/useSlideSwipe";
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
  holidays: Record<string, string>;        // { '2026-10-03': '개천절' } — 비어 있으면 공휴일 표시 없음
  onSelectDate: (date: string) => void;   // 앞뒤 달 날짜를 누르면 그 날짜가 넘어온다
  onSwipeMonth: (delta: -1 | 1) => void;
  /** 가로 스와이프를 잡은 동안 true — 부모가 바깥 ScrollView를 잠그는 데 쓴다 */
  onSwipeActiveChange?: (active: boolean) => void;
  colors: typeof Colors.light;
}

const CELL_MAX_SCALE = 1.15;   // 달력 칸 안 글자가 커질 수 있는 최대 배율
const MAX_ROWS = 3;          // 칸 안 일정 줄 수 (금액이 두 줄이면 한 줄 줄인다)

export function MonthCalendar({ year, month, selectedDate, today, marks, holidays, onSelectDate, onSwipeMonth, onSwipeActiveChange, colors }: MonthCalendarProps) {
  const weeks = buildCalendarGrid(year, month);
  // 글자가 커지면 칸·날짜 줄·띠 높이도 같은 비율로 늘린다 (글자만 키우면 아래 줄이 잘린다)
  const scale = useFontScale(CELL_MAX_SCALE);

  // 좌우로 밀면 달력이 손가락을 따라 움직이고, 넘어가면 새 달이 반대쪽에서 미끄러져 들어온다 (피드백 5번).
  // 상단의 ‹ › 버튼이나 날짜 이동으로 달이 바뀔 때도 같은 전환이 나온다.
  const { panHandlers, slideStyle } = useSlideSwipe({
    pageIndex: year * 12 + month,
    onSwipe: onSwipeMonth,
    onActiveChange: onSwipeActiveChange,
  });

  return (
    // 손가락은 움직이지 않는 바깥 틀이 받고, 주(週) 줄들만 안쪽에서 미끄러진다. 요일 줄은 제자리에 둔다.
    <View style={styles.calendar} {...panHandlers}>
      <View style={styles.weekRow}>
        {WEEKDAYS_KO.map((w, i) => (
          <Text maxScale={CELL_MAX_SCALE} key={w} style={[styles.weekdayText, { color: i === 0 ? colors.expense : i === 6 ? "#3B82F6" : colors.subtext }]}>
            {w}
          </Text>
        ))}
      </View>

      <Animated.View style={slideStyle}>
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

            const holiday = cell.inMonth ? holidays[cell.date] : undefined;
            // 오늘 표시가 가장 우선, 그다음 공휴일·일요일은 빨강, 토요일은 파랑
            const numColor = isToday ? colors.tint : holiday || dow === 0 ? colors.expense : dow === 6 ? "#3B82F6" : colors.text;

            return (
              <Pressable
                key={cell.date}
                style={({ pressed }) => [
                  styles.cell,
                  { height: 92 * scale, borderColor: isSelected ? colors.tint : "transparent" },
                  !cell.inMonth && styles.outCell,
                  // 눌린 동안만 살짝 흐리게 — 앞뒤 달 칸은 이미 흐리므로 조금 더 흐리게 한다
                  pressed && (cell.inMonth ? styles.pressedCell : styles.pressedOutCell),
                ]}
                onPress={() => onSelectDate(cell.date)}
                accessibilityLabel={`${cell.day}일${holiday ? `, ${holiday}` : ""}${isToday ? ", 오늘" : ""}${events.length ? `, 일정 ${events.length}개` : ""}`}
                accessibilityState={{ selected: isSelected }}
              >
                <View style={[styles.numRow, { height: 18 * scale }]}>
                  <Text maxScale={CELL_MAX_SCALE} style={[styles.num, { color: numColor }, isToday && styles.numBold]}>{cell.day}</Text>
                  {isSelected && <View style={[styles.selectedDot, { backgroundColor: colors.tint }]} />}
                  {holiday && (
                    <Text maxScale={CELL_MAX_SCALE} style={[styles.holidayName, { color: colors.expense }]} numberOfLines={1} ellipsizeMode="tail">
                      {holiday}
                    </Text>
                  )}
                </View>

                {shown.map((ev) => {
                  if (ev.kind === "timed") {
                    return (
                      <Text
                        maxScale={CELL_MAX_SCALE}
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
                        { backgroundColor: `${ev.color}33`, height: 14 * scale },
                      ]}
                    >
                      <Text maxScale={CELL_MAX_SCALE} style={[styles.bandText, { color: ev.color }]} numberOfLines={1} ellipsizeMode="tail">
                        {showTitle ? ev.title : " "}
                      </Text>
                    </View>
                  );
                })}
                {hidden > 0 && <Text maxScale={CELL_MAX_SCALE} style={[styles.more, { color: colors.subtext }]}>+{hidden}</Text>}

                {/* 수입·지출 금액 — 칸 맨 아래 오른쪽 */}
                {moneyLines > 0 && (
                  <View style={styles.money}>
                    {!!mark?.expense && (
                      <Text maxScale={CELL_MAX_SCALE} style={[styles.moneyText, { color: colors.expense }]} numberOfLines={1}>
                        −{formatCompactWon(mark.expense)}
                      </Text>
                    )}
                    {!!mark?.income && (
                      <Text maxScale={CELL_MAX_SCALE} style={[styles.moneyText, { color: colors.income }]} numberOfLines={1}>
                        +{formatCompactWon(mark.income)}
                      </Text>
                    )}
                  </View>
                )}
              </Pressable>
            );
          })}
        </View>
      ))}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  // overflow hidden: 미끄러져 나가는 달이 화면 옆 여백 밖으로 비치지 않게 한다
  calendar: { paddingHorizontal: 6, marginBottom: 4, overflow: "hidden" },
  weekRow: { flexDirection: "row" },
  weekLine: { borderTopWidth: StyleSheet.hairlineWidth },
  weekdayText: { flex: 1, fontSize: 11, fontWeight: "600", paddingLeft: 6, marginBottom: 4 },
  // minWidth 0 + overflow hidden: 긴 제목이 칸을 밀어 넓히거나 옆 칸으로 넘어가지 않게 한다
  cell: {
    flex: 1, minWidth: 0, height: 92, overflow: "hidden",
    // 테두리(1.5)는 모든 칸에 항상 있고 색만 바뀐다 — 안쪽 여백은 테두리 두께를 뺀 값이다
    borderWidth: 1.5, paddingTop: 2.5, paddingBottom: 1.5, paddingHorizontal: 0.5, gap: 2, borderRadius: 9,
  },
  outCell: { opacity: 0.32 },
  pressedCell: { opacity: 0.6 },
  pressedOutCell: { opacity: 0.2 },
  numRow: { flexDirection: "row", alignItems: "center", gap: 3, paddingLeft: 4, paddingRight: 2, height: 18 },
  // 공휴일 이름은 남는 폭 안에서만 — 길면 '…'
  holidayName: { flexShrink: 1, fontSize: 8.5, fontWeight: "600" },
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
