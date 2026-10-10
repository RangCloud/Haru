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
import { todayString } from "@/src/utils/date";

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

  // 홈 가계부 카드와 가계부 탭이 함께 보는 달 — 홈에서 고른 달이 가계부 탭에도 그대로 나온다.
  // 일정 탭 달력과는 따로 관리해서, 한쪽에서 달을 넘겨도 다른 쪽이 바뀌지 않는다.
  homeYear: number;
  homeMonth: number;
  homeIncome: number;
  homeExpense: number;
  homeTransactions: Transaction[];   // 그 달의 거래 (가계부 탭 목록용, 최신 날짜순)

  // 홈 화면 '오늘 수입·지출' — 홈 카드에서 다른 달을 보고 있어도 항상 오늘 내역을 보여 주기 위해 따로 둔다
  todayTransactions: Transaction[];

  // 액션
  loadMonth: (year: number, month: number) => Promise<void>;
  loadHomeMonth: (year: number, month: number) => Promise<void>;
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

/** 특정 달의 거래와 수입·지출 합계 (홈 카드·가계부 탭용) */
async function monthSummary(year: number, month: number) {
  const homeTransactions = await getTransactionsByMonth(year, month);
  const { totalIncome, totalExpense } = calcSummary(homeTransactions);
  return { homeTransactions, homeIncome: totalIncome, homeExpense: totalExpense };
}

export const useBudgetStore = create<BudgetState>((set, get) => {
  /** 추가·수정·삭제 후 일정 탭이 보는 달과 홈 카드가 보는 달을 함께 갱신한다 */
  const refresh = async () => {
    const { year, month, homeYear, homeMonth } = get();
    const today = todayString();
    const [transactions, summary, todayTransactions] = await Promise.all([
      getTransactionsByMonth(year, month),
      monthSummary(homeYear, homeMonth),
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
    homeIncome: 0,
    homeExpense: 0,
    homeTransactions: [],
    todayTransactions: [],

    /** 특정 연월 데이터를 DB에서 불러와 상태를 교체한다 (일정 탭 달력용) */
    loadMonth: async (year, month) => {
      const transactions = await getTransactionsByMonth(year, month);
      set({ transactions, year, month, isLoaded: true, ...calcSummary(transactions) });
    },

    /** 홈 카드·가계부 탭에서 볼 달을 바꾸고 그 달 거래와 합계를 불러온다 */
    loadHomeMonth: async (year, month) => {
      // 빠르게 ‹ › 를 눌러도 마지막으로 고른 달의 결과만 반영되도록, 응답 시점에 다시 확인한다
      set({ homeYear: year, homeMonth: month });
      const summary = await monthSummary(year, month);
      const cur = get();
      if (cur.homeYear === year && cur.homeMonth === month) set(summary);
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
