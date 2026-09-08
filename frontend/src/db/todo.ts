/**
 * 투두리스트 DB 레이어
 *
 * 날짜(YYYY-MM-DD) 기준으로 투두를 관리한다.
 * 완료 여부(done)는 0/1 정수로 저장한다.
 */

import { getDatabase } from "./database";

// ── 타입 ──────────────────────────────────────────────────────

export interface TodoItem {
  id: number;
  title: string;
  done: boolean;   // DB의 0/1을 boolean으로 변환
  date: string;    // YYYY-MM-DD
  created_at: string;
}

export interface NewTodoItem {
  title: string;
  date: string;
}

// ── 조회 ──────────────────────────────────────────────────────

/** 특정 날짜의 투두 목록을 생성순으로 반환한다 */
export async function getTodosByDate(date: string): Promise<TodoItem[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<{
    id: number; title: string; done: number; date: string; created_at: string;
  }>(
    "SELECT * FROM todos WHERE date = ? ORDER BY created_at ASC",
    [date],
  );
  return rows.map((r) => ({ ...r, done: r.done === 1 }));
}

// ── 추가 ──────────────────────────────────────────────────────

/** 투두를 추가하고 생성된 id를 반환한다 */
export async function addTodo(item: NewTodoItem): Promise<number> {
  const db = await getDatabase();
  const result = await db.runAsync(
    "INSERT INTO todos (title, done, date, created_at) VALUES (?, 0, ?, ?)",
    [item.title.trim(), item.date, new Date().toISOString()],
  );
  return result.lastInsertRowId;
}

// ── 수정 ──────────────────────────────────────────────────────

/** 완료 여부를 토글한다 */
export async function toggleTodo(id: number, done: boolean): Promise<void> {
  const db = await getDatabase();
  await db.runAsync("UPDATE todos SET done = ? WHERE id = ?", [done ? 1 : 0, id]);
}

// ── 삭제 ──────────────────────────────────────────────────────

/** 투두를 삭제한다 */
export async function deleteTodo(id: number): Promise<void> {
  const db = await getDatabase();
  await db.runAsync("DELETE FROM todos WHERE id = ?", [id]);
}
