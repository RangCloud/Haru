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
  getTransactionsByMonth,
  type NewTransaction,
  type Transaction,
} from "@/src/db/budget";

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

  // 액션
  loadMonth: (year: number, month: number) => Promise<void>;
  add: (t: NewTransaction) => Promise<void>;
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

export const useBudgetStore = create<BudgetState>((set, get) => ({
  transactions: [],
  year: now.getFullYear(),
  month: now.getMonth() + 1,
  isLoaded: false,
  totalIncome: 0,
  totalExpense: 0,
  balance: 0,

  /** 특정 연월 데이터를 DB에서 불러와 상태를 교체한다 */
  loadMonth: async (year, month) => {
    const transactions = await getTransactionsByMonth(year, month);
    set({ transactions, year, month, isLoaded: true, ...calcSummary(transactions) });
  },

  /** 거래를 추가하고 현재 월 상태를 갱신한다 */
  add: async (t) => {
    await addTransaction(t);
    const { year, month } = get();
    const transactions = await getTransactionsByMonth(year, month);
    set({ transactions, ...calcSummary(transactions) });
  },

  /** 거래를 삭제하고 현재 월 상태를 갱신한다 */
  remove: async (id) => {
    await deleteTransaction(id);
    const { year, month } = get();
    const transactions = await getTransactionsByMonth(year, month);
    set({ transactions, ...calcSummary(transactions) });
  },
}));
