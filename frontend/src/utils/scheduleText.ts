/**
 * 일정 날짜 판정·표시 문구 (홈·일정 탭·DB 조회 공용)
 *
 * DB나 화면에 의존하지 않는 순수 함수만 둔다 — 그래서 앱 밖(Node)에서도 바로 검증할 수 있다.
 *
 * 같은 기간 일정이라도 어느 날짜에서 보느냐에 따라 보여줄 시각이 다르다.
 *   9/28 14:00 ~ 9/30 11:00 여행
 *   - 9/28(시작일): '14:00~'      — 시작 시각
 *   - 9/29(중간):   '종일'
 *   - 9/30(마지막): '~11:00'      — 끝나는 시각
 */

import type { ScheduleItem } from "@/src/db/schedule";
import { formatShort } from "@/src/utils/date";

type Timed = Pick<ScheduleItem, "date" | "end_date" | "time" | "end_time">;

// ── 날짜 판정 ─────────────────────────────────────────────────

/** 일정의 마지막 날 — 하루짜리면 시작일과 같다 */
export function lastDayOf(s: Pick<ScheduleItem, "date" | "end_date">): string {
  return s.end_date || s.date;
}

/** 해당 날짜에 걸쳐 있는 일정인지 (기간 일정은 기간 안의 모든 날에 true) */
export function occursOn(s: Pick<ScheduleItem, "date" | "end_date">, date: string): boolean {
  return s.date <= date && date <= lastDayOf(s);
}

/**
 * 같은 날의 일정 정렬 — 종일 일정을 먼저, 그다음 시작 시각 순.
 * 기간 일정의 둘째 날부터는 시작 시각이 의미가 없으므로 종일처럼 취급한다.
 */
export function sortForDate<T extends Pick<ScheduleItem, "id" | "date" | "time">>(items: T[], date: string): T[] {
  const key = (s: T) => (s.date === date && s.time ? s.time : "");
  return [...items].sort((a, b) => key(a).localeCompare(key(b)) || a.id - b.id);
}

// ── 표시 문구 ─────────────────────────────────────────────────

/** 오른쪽 시간 칸 문구 */
export function timeLabelOn(s: Timed, date: string): string {
  const multiDay = lastDayOf(s) !== s.date;
  if (!multiDay) {
    if (!s.time) return "종일";
    return s.end_time ? `${s.time}~${s.end_time}` : s.time;
  }
  if (date === s.date && s.time) return `${s.time}~`;
  if (date === lastDayOf(s) && s.end_time) return `~${s.end_time}`;
  return "종일";
}

/** 기간 일정이면 '9/28~9/30', 하루짜리면 '' */
export function periodLabel(s: Timed): string {
  return lastDayOf(s) !== s.date ? `${formatShort(s.date)}~${formatShort(lastDayOf(s))}` : "";
}
