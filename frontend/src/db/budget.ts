/**
 * 가계부 거래 내역 CRUD
 *
 * 모든 데이터는 기기 로컬 SQLite에만 저장된다 (외부 전송 금지, CLAUDE.md §4).
 * 이 파일은 DB 작업만 담당하고 UI·상태 관리는 store/budgetStore.ts가 담당한다.
 */

import { getDatabase } from "./database";

// ── 타입 정의 ──────────────────────────────────────────────────

export interface Transaction {
  id: number;
  type: "income" | "expense";
  amount: number;      // 원 단위 정수
  category: string;
  note: string;
  date: string;        // YYYY-MM-DD
  created_at: string;  // ISO 8601 datetime
}

// id와 created_at은 DB가 자동 생성하므로 입력 시 제외
export type NewTransaction = Omit<Transaction, "id" | "created_at">;

// ── 카테고리 목록 ──────────────────────────────────────────────

export const EXPENSE_CATEGORIES = ["식비", "교통", "쇼핑", "카페", "의료", "문화", "기타"] as const;
export const INCOME_CATEGORIES  = ["급여", "부수입", "기타"] as const;

// ── CRUD 함수 ──────────────────────────────────────────────────

/** 새 거래를 추가하고 생성된 id를 반환한다 */
export async function addTransaction(t: NewTransaction): Promise<number> {
  const db = await getDatabase();
  const result = await db.runAsync(
    `INSERT INTO transactions (type, amount, category, note, date, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [t.type, t.amount, t.category, t.note, t.date, new Date().toISOString()],
  );
  return result.lastInsertRowId;
}

/**
 * 특정 연월의 거래 내역을 최신순으로 조회한다.
 *
 * LIKE 'YYYY-MM%' 패턴으로 필터링한다.
 * date 컬럼에 인덱스가 있어 빠르게 동작한다.
 */
export async function getTransactionsByMonth(
  year: number,
  month: number,
): Promise<Transaction[]> {
  const db = await getDatabase();
  const prefix = `${year}-${String(month).padStart(2, "0")}`;
  return db.getAllAsync<Transaction>(
    `SELECT * FROM transactions
     WHERE date LIKE ?
     ORDER BY date DESC, created_at DESC`,
    [`${prefix}%`],
  );
}

/** 거래를 삭제한다 */
export async function deleteTransaction(id: number): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(`DELETE FROM transactions WHERE id = ?`, [id]);
}
