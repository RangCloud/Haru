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
  updateTransaction,
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

  // 홈 '이번 달' 카드 전용 합계 — 일정 탭에서 다른 달로 넘겨도 바뀌지 않도록 따로 관리
  thisMonthIncome: number;
  thisMonthExpense: number;

  // 액션
  loadMonth: (year: number, month: number) => Promise<void>;
  loadThisMonth: () => Promise<void>;
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

/** 오늘이 속한 달의 수입·지출 합계 */
async function thisMonthSummary() {
  const d = new Date();
  const { totalIncome, totalExpense } = calcSummary(await getTransactionsByMonth(d.getFullYear(), d.getMonth() + 1));
  return { thisMonthIncome: totalIncome, thisMonthExpense: totalExpense };
}

export const useBudgetStore = create<BudgetState>((set, get) => {
  /** 추가·수정·삭제 후 보고 있는 달과 홈 '이번 달' 합계를 함께 갱신한다 */
  const refresh = async () => {
    const { year, month } = get();
    const [transactions, summary] = await Promise.all([getTransactionsByMonth(year, month), thisMonthSummary()]);
    set({ transactions, ...calcSummary(transactions), ...summary });
  };

  return {
    transactions: [],
    year: now.getFullYear(),
    month: now.getMonth() + 1,
    isLoaded: false,
    totalIncome: 0,
    totalExpense: 0,
    balance: 0,
    thisMonthIncome: 0,
    thisMonthExpense: 0,

    /** 특정 연월 데이터를 DB에서 불러와 상태를 교체한다 (일정 탭 달력용) */
    loadMonth: async (year, month) => {
      const transactions = await getTransactionsByMonth(year, month);
      set({ transactions, year, month, isLoaded: true, ...calcSummary(transactions) });
    },

    /** 홈 '이번 달' 합계를 불러온다 (달이 바뀐 뒤 복귀했을 때도 호출) */
    loadThisMonth: async () => {
      set(await thisMonthSummary());
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
