/**
 * 가계부 "한 달" 기간 계산 — 한 달 시작일(월급날 등) 기준
 *
 * 기본은 1일 시작이라 "10월" = 10월 1일 ~ 10월 31일이다.
 * 시작일을 10일로 정하면 "10월" = 10월 10일 ~ 11월 9일이 된다.
 * 기간의 이름은 **시작하는 달**을 따른다 (시안에서 정한 규칙).
 *
 * 그 달에 없는 날을 시작일로 정한 경우(예: 31일, 2월 30일)는 그 달의 마지막 날부터 시작한다.
 * 그래서 시작일 31일과 '말일'(MONTH_START_LAST)은 항상 같은 결과가 나온다.
 *
 * DB·화면에 의존하지 않는 순수 함수만 둔다 — 날짜만 넣으면 결과를 검증할 수 있게.
 */

import { parseDate, shiftMonth, toDateStr } from "@/src/utils/date";

/** '말일'을 뜻하는 시작일 값 — 1~31과 겹치지 않게 0으로 둔다 */
export const MONTH_START_LAST = 0;

/** 저장된 값이 올바른 시작일인지 (0=말일, 1~31) */
export function isMonthStartDay(v: number): boolean {
  return Number.isInteger(v) && v >= 0 && v <= 31;
}

const daysInMonth = (year: number, month: number) => new Date(year, month, 0).getDate();

/** 그 달에서 기간이 실제로 시작하는 날 — 없는 날이면 그 달 말일로 당긴다 */
function startDayIn(year: number, month: number, startDay: number): number {
  const want = startDay === MONTH_START_LAST ? 31 : startDay;
  return Math.min(want, daysInMonth(year, month));
}

export interface DateRange {
  start: string;  // YYYY-MM-DD (포함)
  end: string;    // YYYY-MM-DD (포함)
}

/**
 * (year, month)라는 이름의 한 달 기간.
 * 끝나는 날 = 다음 달 기간이 시작하는 날의 하루 전.
 * 예) 시작일 10 → 2026년 10월 = 10/10 ~ 11/9, 시작일 31 → 2026년 10월 = 10/31 ~ 11/29
 */
export function monthPeriod(year: number, month: number, startDay: number): DateRange {
  const next = shiftMonth(year, month, 1);
  const startDate = new Date(year, month - 1, startDayIn(year, month, startDay));
  // Date가 0일·음수일을 앞 달로 넘겨 주므로 '다음 기간 시작일 - 1'을 그대로 넣어도 된다
  const endDate = new Date(next.year, next.month - 1, startDayIn(next.year, next.month, startDay) - 1);
  return {
    start: toDateStr(startDate.getFullYear(), startDate.getMonth() + 1, startDate.getDate()),
    end: toDateStr(endDate.getFullYear(), endDate.getMonth() + 1, endDate.getDate()),
  };
}

/**
 * 날짜가 속한 기간의 이름(연·월).
 * 그 달의 시작일보다 앞선 날은 지난달 기간에 속한다.
 * 예) 시작일 25 → 10월 15일은 '9월'(9/25 ~ 10/24) 기간
 */
export function periodOfDate(date: string, startDay: number): { year: number; month: number } {
  const d = parseDate(date);
  const year = d.getFullYear();
  const month = d.getMonth() + 1;
  if (d.getDate() >= startDayIn(year, month, startDay)) return { year, month };
  return shiftMonth(year, month, -1);
}

/** 시작일 표시 — 0 → '말일', 10 → '10일' */
export function formatStartDay(startDay: number): string {
  return startDay === MONTH_START_LAST ? "말일" : `${startDay}일`;
}

/** '2026-10-10' ~ '2026-11-09' → '10월 10일 ~ 11월 9일' (연도가 다르면 끝에 연도를 붙인다) */
export function formatRange(range: DateRange): string {
  const s = parseDate(range.start);
  const e = parseDate(range.end);
  const md = (d: Date) => `${d.getMonth() + 1}월 ${d.getDate()}일`;
  const endText = s.getFullYear() === e.getFullYear() ? md(e) : `${e.getFullYear()}년 ${md(e)}`;
  return `${md(s)} ~ ${endText}`;
}

/** 기간의 날 수 (양 끝 포함) — 서머타임이 있는 지역에서도 어긋나지 않게 반올림 */
export function rangeDays(range: DateRange): number {
  const ms = parseDate(range.end).getTime() - parseDate(range.start).getTime();
  return Math.round(ms / (24 * 60 * 60 * 1000)) + 1;
}

/** 기간에 걸친 달 목록 (달력을 달마다 나눠 그릴 때 쓴다) */
export function monthsInRange(range: DateRange): { year: number; month: number }[] {
  const s = parseDate(range.start);
  const e = parseDate(range.end);
  const list: { year: number; month: number }[] = [];
  let cur = { year: s.getFullYear(), month: s.getMonth() + 1 };
  const last = e.getFullYear() * 12 + e.getMonth();
  while (cur.year * 12 + cur.month - 1 <= last) {
    list.push(cur);
    cur = shiftMonth(cur.year, cur.month, 1);
  }
  return list;
}
