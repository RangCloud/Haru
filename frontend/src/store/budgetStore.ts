/**
 * 가계부 전역 상태 — Zustand store
 *
 * UI 컴포넌트는 이 store를 통해서만 거래 데이터를 읽고 쓴다.
 * 실제 DB 작업은 src/db/budget.ts에 위임한다.
 *
 * 파생값(totalIncome, totalExpense, balance)은 transactions 배열에서
 * 매번 계산하지 않고 set() 시점에 한 번만 계산해 저장한다.
 */

import { create } from "zustand";
import {
  addTransaction,
  deleteTransaction,
  getTransactionsBetween,
  getTransactionsByMonth,
  updateTransaction,
  type NewTransaction,
  type Transaction,
} from "@/src/db/budget";
import { monthPeriod, periodOfDate, type DateRange } from "@/src/utils/budgetPeriod";
import { todayString } from "@/src/utils/date";
import { useSettingsStore } from "@/src/store/settingsStore";

// ── 상태 타입 ──────────────────────────────────────────────────

interface BudgetState {
  transactions: Transaction[];
  year: number;
  month: number;
  isLoaded: boolean;

  // 파생값 — transactions에서 계산, 매 렌더마다 재계산을 피하기 위해 캐싱
  totalIncome: number;
  totalExpense: number;
  balance: number;

  // 홈 가계부 카드와 가계부 탭이 함께 보는 기간 — 홈에서 고른 기간이 가계부 탭에도 그대로 나온다.
  // 일정 탭 달력과는 따로 관리해서, 한쪽에서 달을 넘겨도 다른 쪽이 바뀌지 않는다.
  // 한 달 단위일 때 기간은 설정의 '한 달 시작일'을 따른다 (시작일 10일 → 10월 = 10/10 ~ 11/9).
  homeYear: number;                  // 기간 이름의 연·월 (직접 고른 기간이면 시작일이 속한 달)
  homeMonth: number;
  homeRange: DateRange;              // 실제로 보고 있는 날짜 범위 (양 끝 포함)
  homeCustom: boolean;               // true면 '기간 직접 선택'으로 고른 일회성 기간
  homeIncome: number;
  homeExpense: number;
  homeTransactions: Transaction[];   // 그 기간의 거래 (가계부 탭 목록용, 최신 날짜순)

  // 홈 화면 '오늘 수입·지출' — 홈 카드에서 다른 달을 보고 있어도 항상 오늘 내역을 보여 주기 위해 따로 둔다
  todayTransactions: Transaction[];

  // 액션
  loadMonth: (year: number, month: number) => Promise<void>;
  /** 한 달 단위 — (year, month) 이름의 기간을 한 달 시작일 기준으로 불러온다 */
  loadHomeMonth: (year: number, month: number) => Promise<void>;
  /** 오늘이 들어 있는 한 달 기간으로 돌아간다 ('이번 달' 버튼, 앱 시작, 날짜 변경) */
  loadCurrentPeriod: () => Promise<void>;
  /** 기간 직접 선택 — 저장하지 않는 일회성 보기 */
  loadHomeRange: (range: DateRange) => Promise<void>;
  /** 오늘 거래를 다시 읽는다 (홈 진입 시, 자정이 지나 날짜가 바뀌었을 때) */
  loadTodayTransactions: () => Promise<void>;
  add: (t: NewTransaction) => Promise<void>;
  update: (id: number, t: Partial<NewTransaction>) => Promise<void>;
  remove: (id: number) => Promise<void>;
}

// ── 헬퍼 ──────────────────────────────────────────────────────

function calcSummary(transactions: Transaction[]) {
  let totalIncome = 0;
  let totalExpense = 0;
  for (const t of transactions) {
    if (t.type === "income") totalIncome += t.amount;
    else totalExpense += t.amount;
  }
  return { totalIncome, totalExpense, balance: totalIncome - totalExpense };
}

// ── Store ──────────────────────────────────────────────────────

const now = new Date();

/** 지금 설정된 한 달 시작일 — 화면이 아니라 store 안에서 쓰므로 getState()로 읽는다 */
const startDay = () => useSettingsStore.getState().monthStartDay;

/** 기간의 거래와 수입·지출 합계 (홈 카드·가계부 탭용) */
async function rangeSummary(range: DateRange) {
  const homeTransactions = await getTransactionsBetween(range.start, range.end);
  const { totalIncome, totalExpense } = calcSummary(homeTransactions);
  return { homeTransactions, homeIncome: totalIncome, homeExpense: totalExpense };
}

// 앱을 처음 켰을 때의 기본 기간 — 설정을 읽기 전이라 1일 시작으로 두고, 홈이 곧 다시 계산한다
const initialRange = monthPeriod(now.getFullYear(), now.getMonth() + 1, 1);

export const useBudgetStore = create<BudgetState>((set, get) => {
  /** 추가·수정·삭제 후 일정 탭이 보는 달과 홈 카드가 보는 달을 함께 갱신한다 */
  const refresh = async () => {
    const { year, month, homeRange } = get();
    const today = todayString();
    const [transactions, summary, todayTransactions] = await Promise.all([
      getTransactionsByMonth(year, month),
      rangeSummary(homeRange),
      getTransactionsBetween(today, today),
    ]);
    set({ transactions, ...calcSummary(transactions), ...summary, todayTransactions });
  };

  return {
    transactions: [],
    year: now.getFullYear(),
    month: now.getMonth() + 1,
    isLoaded: false,
    totalIncome: 0,
    totalExpense: 0,
    balance: 0,
    homeYear: now.getFullYear(),
    homeMonth: now.getMonth() + 1,
    homeRange: initialRange,
    homeCustom: false,
    homeIncome: 0,
    homeExpense: 0,
    homeTransactions: [],
    todayTransactions: [],

    /** 특정 연월 데이터를 DB에서 불러와 상태를 교체한다 (일정 탭 달력용) */
    loadMonth: async (year, month) => {
      const transactions = await getTransactionsByMonth(year, month);
      set({ transactions, year, month, isLoaded: true, ...calcSummary(transactions) });
    },

    /** 홈 카드·가계부 탭에서 볼 달을 바꾸고 그 기간 거래와 합계를 불러온다 */
    loadHomeMonth: async (year, month) => {
      const homeRange = monthPeriod(year, month, startDay());
      set({ homeYear: year, homeMonth: month, homeRange, homeCustom: false });
      // 빠르게 달을 바꿔도 마지막으로 고른 기간의 결과만 반영되도록, 응답 시점에 다시 확인한다
      const summary = await rangeSummary(homeRange);
      if (get().homeRange === homeRange) set(summary);
    },

    loadCurrentPeriod: async () => {
      // 시작일이 25일이면 10월 15일은 '9월'(9/25 ~ 10/24) 기간이다 — 달력의 달과 다를 수 있다
      const { year, month } = periodOfDate(todayString(), startDay());
      await get().loadHomeMonth(year, month);
    },

    loadHomeRange: async (homeRange) => {
      // 직접 고른 기간도 이름(연·월)은 시작일이 속한 달로 둔다 — 소비 분석 첫 화면 등이 참고한다
      const { year, month } = periodOfDate(homeRange.start, startDay());
      set({ homeYear: year, homeMonth: month, homeRange, homeCustom: true });
      const summary = await rangeSummary(homeRange);
      if (get().homeRange === homeRange) set(summary);
    },

    loadTodayTransactions: async () => {
      const today = todayString();
      set({ todayTransactions: await getTransactionsBetween(today, today) });
    },

    add: async (t) => {
      await addTransaction(t);
      await refresh();
    },

    update: async (id, t) => {
      await updateTransaction(id, t);
      await refresh();
    },

    remove: async (id) => {
      await deleteTransaction(id);
      await refresh();
    },
  };
});
