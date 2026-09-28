/**
 * 날짜 문자열(YYYY-MM-DD) 도우미
 *
 * 앱은 날짜를 모두 로컬 기준 'YYYY-MM-DD' 문자열로 다룬다.
 * new Date('2026-09-28')처럼 문자열을 바로 파싱하면 UTC 자정으로 해석되어
 * 시간대에 따라 하루가 밀릴 수 있으므로, 항상 (년, 월, 일) 숫자로 Date를 만든다.
 */

export const WEEKDAYS_KO = ["일", "월", "화", "수", "목", "금", "토"] as const;

export function toDateStr(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function todayString(): string {
  const d = new Date();
  return toDateStr(d.getFullYear(), d.getMonth() + 1, d.getDate());
}

export function parseDate(s: string): Date {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
}

/** '2026-09-28' → '9월 28일 (일)' */
export function formatMonthDay(s: string): string {
  const d = parseDate(s);
  return `${d.getMonth() + 1}월 ${d.getDate()}일 (${WEEKDAYS_KO[d.getDay()]})`;
}

/** '2026-09-28' → '2026년 9월 28일 (일)' */
export function formatFullDate(s: string): string {
  return `${parseDate(s).getFullYear()}년 ${formatMonthDay(s)}`;
}

/** '2026-09-28' → '9/28' */
export function formatShort(s: string): string {
  const d = parseDate(s);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

/** 달력 칸 배열 — 1일 앞의 빈칸은 null, 마지막 주도 7칸을 채운다 */
export function buildCalendarDays(year: number, month: number): (number | null)[] {
  const firstDay = new Date(year, month - 1, 1).getDay();
  const daysInMonth = new Date(year, month, 0).getDate();
  const cells: (number | null)[] = [];
  for (let i = 0; i < firstDay; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

/** (year, month)에서 delta개월 이동한 연월 */
export function shiftMonth(year: number, month: number, delta: number): { year: number; month: number } {
  const idx = year * 12 + (month - 1) + delta;
  return { year: Math.floor(idx / 12), month: (idx % 12) + 1 };
}
