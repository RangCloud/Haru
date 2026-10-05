/**
 * 소비 분석 — 기기 안에서만 계산한다
 *
 * 가계부 내역을 서버나 AI로 보내지 않고(CLAUDE.md §4 로컬 우선), 정해진 규칙으로
 * 기간 합계·카테고리 비율·안내 문장을 만든다.
 * DB·화면에 의존하지 않는 순수 함수만 두어, 날짜와 내역만 넣으면 결과를 검증할 수 있다.
 *
 * 흐름:
 *   1) getPeriod()  — 기준 날짜가 속한 주/달/년의 범위와, 비교할 직전 기간의 범위를 구한다
 *   2) 화면이 그 범위의 거래를 DB에서 읽는다 (이번 기간 + 직전 기간)
 *   3) buildInsight() — 합계·카테고리·문장을 계산한다
 */

import { parseDate, toDateStr } from "@/src/utils/date";

export type PeriodUnit = "week" | "month" | "year";

/** 분석에 필요한 거래 정보만 — db의 Transaction을 그대로 넘길 수 있다 */
export interface InsightTransaction {
  type: "income" | "expense";
  amount: number;
  category: string;
  date: string;   // YYYY-MM-DD
}

export interface Period {
  unit: PeriodUnit;
  start: string;        // 기간 첫날
  end: string;          // 기간 마지막 날
  label: string;        // '2026년 9월', '9월 27일 ~ 10월 3일', '2026년'
  /** 아직 끝나지 않은 기간인지 (오늘이 기간 안에 있음) */
  inProgress: boolean;
  /** 지금까지 지난 날 수 — 끝난 기간이면 전체 날 수 */
  elapsedDays: number;
  /** 비교 대상인 직전 기간. 진행 중이면 같은 날 수만큼만 잘라 공정하게 비교한다 */
  prevStart: string;
  prevEnd: string;
  prevLabel: string;    // '8월', '전주', '2025년' — 진행 중이면 뒤에 ' 같은 기간'이 붙는다
}

export interface CategoryShare {
  category: string;
  amount: number;
  ratio: number;        // 0~1, 전체 지출에서 차지하는 비율
}

export interface Insight {
  expense: number;
  income: number;
  prevExpense: number;
  /** 직전 기간 대비 지출 증감 (원). 양수면 더 씀 */
  diff: number;
  /** 증감률 (%, 반올림). 직전 기간 지출이 0이면 계산할 수 없어 null */
  diffPercent: number | null;
  categories: CategoryShare[];   // 금액 큰 순
  messages: string[];            // 안내 문장 — 조건에 맞는 것만 들어간다
}

const DAY_MS = 24 * 60 * 60 * 1000;

const fmt = (d: Date) => toDateStr(d.getFullYear(), d.getMonth() + 1, d.getDate());
const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
/** 두 날짜 사이의 날 수 (양 끝 포함). 서머타임이 있는 지역에서도 어긋나지 않게 반올림한다 */
const daysBetween = (a: Date, b: Date) => Math.round((b.getTime() - a.getTime()) / DAY_MS) + 1;
const won = (n: number) => `${Math.round(n).toLocaleString("ko-KR")}원`;
const monthDay = (d: Date) => `${d.getMonth() + 1}월 ${d.getDate()}일`;

/** 한글 조사 '이/가' — 앞 글자에 받침이 있으면 '이' (예: 쇼핑이, 식비가) */
function subject(word: string): string {
  const code = word.charCodeAt(word.length - 1);
  const isHangul = code >= 0xac00 && code <= 0xd7a3;
  const hasBatchim = isHangul && (code - 0xac00) % 28 !== 0;
  return `${word}${hasBatchim ? "이" : "가"}`;
}

/**
 * 기준 날짜가 속한 기간과 직전 기간을 구한다.
 * 주는 달력과 같이 일요일에 시작한다.
 */
export function getPeriod(unit: PeriodUnit, anchor: string, today: string): Period {
  const a = parseDate(anchor);
  let start: Date;
  let end: Date;
  let prevStart: Date;
  let prevFullEnd: Date;
  let label: string;
  let prevLabel: string;

  if (unit === "week") {
    start = addDays(a, -a.getDay());
    end = addDays(start, 6);
    prevStart = addDays(start, -7);
    prevFullEnd = addDays(start, -1);
    label = `${monthDay(start)} ~ ${monthDay(end)}`;
    prevLabel = "전주";
  } else if (unit === "month") {
    start = new Date(a.getFullYear(), a.getMonth(), 1);
    end = new Date(a.getFullYear(), a.getMonth() + 1, 0);       // 다음 달 0일 = 이번 달 말일
    prevStart = new Date(a.getFullYear(), a.getMonth() - 1, 1);
    prevFullEnd = new Date(a.getFullYear(), a.getMonth(), 0);
    label = `${start.getFullYear()}년 ${start.getMonth() + 1}월`;
    prevLabel = `${prevStart.getMonth() + 1}월`;
  } else {
    start = new Date(a.getFullYear(), 0, 1);
    end = new Date(a.getFullYear(), 11, 31);
    prevStart = new Date(a.getFullYear() - 1, 0, 1);
    prevFullEnd = new Date(a.getFullYear() - 1, 11, 31);
    label = `${start.getFullYear()}년`;
    prevLabel = `${prevStart.getFullYear()}년`;
  }

  const t = parseDate(today);
  const inProgress = t >= start && t <= end;
  const elapsedDays = inProgress ? daysBetween(start, t) : daysBetween(start, end);

  // 진행 중인 기간을 '끝난 직전 기간 전체'와 비교하면 항상 덜 쓴 것처럼 보인다.
  // 그래서 직전 기간도 같은 날 수만큼만 잘라 비교한다 (예: 10월 1~5일 ↔ 9월 1~5일).
  let prevEnd = prevFullEnd;
  if (inProgress) {
    const cut = addDays(prevStart, elapsedDays - 1);
    if (cut < prevFullEnd) prevEnd = cut;
    prevLabel += " 같은 기간";
  }

  return {
    unit, label, inProgress, elapsedDays, prevLabel,
    start: fmt(start), end: fmt(end), prevStart: fmt(prevStart), prevEnd: fmt(prevEnd),
  };
}

/** 기준 날짜를 한 기간 앞(-1)·뒤(+1)로 옮긴다 — 화면의 이전/다음 이동에 쓴다 */
export function shiftAnchor(unit: PeriodUnit, anchor: string, delta: -1 | 1): string {
  const a = parseDate(anchor);
  if (unit === "week") return fmt(addDays(a, 7 * delta));
  // 달·년은 1일 기준으로 옮긴다 — 31일에서 한 달 뒤로 가면 다음다음 달로 넘어가는 문제를 피한다
  if (unit === "month") return fmt(new Date(a.getFullYear(), a.getMonth() + delta, 1));
  return fmt(new Date(a.getFullYear() + delta, a.getMonth(), 1));
}

/** 지출만 카테고리별로 더한다 */
function sumByCategory(list: InsightTransaction[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const t of list) {
    if (t.type !== "expense") continue;
    map.set(t.category, (map.get(t.category) ?? 0) + t.amount);
  }
  return map;
}

/** 가장 큰 값을 가진 항목. 비어 있으면 null */
function maxEntry(map: Map<string, number>): [string, number] | null {
  let best: [string, number] | null = null;
  for (const e of map) if (!best || e[1] > best[1]) best = e;
  return best;
}

// 카테고리 증감을 문장으로 알릴 최소 금액 — 몇 천 원 차이까지 알리면 오히려 소음이 된다
const MIN_CATEGORY_CHANGE = 10_000;

/**
 * 이번 기간(current)과 직전 기간(previous) 거래로 분석 결과를 만든다.
 * 두 목록은 period의 범위에 맞춰 이미 걸러져 있어야 한다.
 */
export function buildInsight(period: Period, current: InsightTransaction[], previous: InsightTransaction[]): Insight {
  const curCats = sumByCategory(current);
  const prevCats = sumByCategory(previous);
  const expense = [...curCats.values()].reduce((s, v) => s + v, 0);
  const prevExpense = [...prevCats.values()].reduce((s, v) => s + v, 0);
  const income = current.filter((t) => t.type === "income").reduce((s, t) => s + t.amount, 0);

  const categories: CategoryShare[] = [...curCats.entries()]
    .sort((x, y) => y[1] - x[1])
    .map(([category, amount]) => ({ category, amount, ratio: expense > 0 ? amount / expense : 0 }));

  const diff = expense - prevExpense;
  const diffPercent = prevExpense > 0 ? Math.round((Math.abs(diff) / prevExpense) * 100) : null;

  const messages: string[] = [];
  if (expense > 0) {
    // 1) 가장 큰 카테고리
    const top = categories[0];
    messages.push(`${subject(top.category)} 가장 큰 지출이에요. 전체의 ${Math.round(top.ratio * 100)}%예요.`);

    // 2) 직전 기간보다 가장 많이 늘어난 카테고리 — 없으면 가장 많이 줄어든 카테고리
    //    (직전 기간 내역이 아예 없으면 전부 '늘었다'가 되므로 비교하지 않는다)
    if (prevExpense > 0) {
      const changes = new Map<string, number>();
      for (const name of new Set([...curCats.keys(), ...prevCats.keys()])) {
        changes.set(name, (curCats.get(name) ?? 0) - (prevCats.get(name) ?? 0));
      }
      const up = maxEntry(changes);
      const down = maxEntry(new Map([...changes].map(([k, v]) => [k, -v])));
      if (up && up[1] >= MIN_CATEGORY_CHANGE) {
        messages.push(`${up[0]} 지출이 ${period.prevLabel}보다 ${won(up[1])} 늘었어요.`);
      } else if (down && down[1] >= MIN_CATEGORY_CHANGE) {
        messages.push(`${down[0]} 지출이 ${period.prevLabel}보다 ${won(down[1])} 줄었어요.`);
      }
    }

    // 3) 평균과 가장 많이 쓴 날(년 단위는 달)
    if (period.unit === "year") {
      const byMonth = new Map<string, number>();
      for (const t of current) {
        if (t.type !== "expense") continue;
        const m = String(Number(t.date.slice(5, 7)));
        byMonth.set(m, (byMonth.get(m) ?? 0) + t.amount);
      }
      const peak = maxEntry(byMonth);
      // 진행 중인 해는 지난 달 수로 나눈다 (10월이면 10개월)
      const months = period.inProgress ? parseDate(addElapsed(period)).getMonth() + 1 : 12;
      if (peak) messages.push(`한 달 평균 ${won(roundTo(expense / months, 1000))}을 썼고, 가장 많이 쓴 달은 ${peak[0]}월(${won(peak[1])})이에요.`);
    } else {
      const byDay = new Map<string, number>();
      for (const t of current) {
        if (t.type !== "expense") continue;
        byDay.set(t.date, (byDay.get(t.date) ?? 0) + t.amount);
      }
      const peak = maxEntry(byDay);
      if (peak) {
        messages.push(`하루 평균 ${won(roundTo(expense / period.elapsedDays, 100))}을 썼고, 가장 많이 쓴 날은 ${monthDay(parseDate(peak[0]))}(${won(peak[1])})이에요.`);
      }
    }

    // 4) 수입 대비 지출
    if (income > 0) {
      if (expense > income) messages.push(`수입보다 ${won(expense - income)} 더 썼어요.`);
      else messages.push(`수입의 ${Math.round((expense / income) * 100)}%를 지출했어요.`);
    }
  }

  return { expense, income, prevExpense, diff, diffPercent, categories, messages };
}

/** 기간 시작일에서 지난 날 수만큼 간 날짜 (= 진행 중이면 오늘) */
function addElapsed(period: Period): string {
  return fmt(addDays(parseDate(period.start), period.elapsedDays - 1));
}

/** 평균 금액은 끝자리를 정리해 읽기 쉽게 한다 */
function roundTo(n: number, unit: number): number {
  return Math.round(n / unit) * unit;
}
