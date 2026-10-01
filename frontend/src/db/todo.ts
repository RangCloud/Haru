/**
 * 투두리스트 DB 레이어
 *
 * 날짜(YYYY-MM-DD) 기준으로 투두를 관리한다.
 * 완료 여부(done)·중요 여부(important)는 0/1 정수로 저장한다.
 */

import { getDatabase } from "./database";

// ── 타입 ──────────────────────────────────────────────────────

export interface TodoItem {
  id: number;
  title: string;
  done: boolean;       // DB의 0/1을 boolean으로 변환
  important: boolean;  // true면 목록 맨 위 + 별 표시
  date: string;        // YYYY-MM-DD
  created_at: string;
}

export interface NewTodoItem {
  title: string;
  date: string;
  important?: boolean;
}

type TodoRow = {
  id: number; title: string; done: number; important: number; date: string; created_at: string;
};

const toItem = (r: TodoRow): TodoItem => ({ ...r, done: r.done === 1, important: r.important === 1 });

// ── 조회 ──────────────────────────────────────────────────────

/** 특정 날짜의 투두 목록 — 중요한 항목을 먼저, 그 안에서는 만든 순서대로 */
export async function getTodosByDate(date: string): Promise<TodoItem[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<TodoRow>(
    "SELECT * FROM todos WHERE date = ? ORDER BY important DESC, created_at ASC",
    [date],
  );
  return rows.map(toItem);
}

// ── 추가 ──────────────────────────────────────────────────────

/** 투두를 추가하고 생성된 id를 반환한다 */
export async function addTodo(item: NewTodoItem): Promise<number> {
  const db = await getDatabase();
  const result = await db.runAsync(
    "INSERT INTO todos (title, done, important, date, created_at) VALUES (?, 0, ?, ?, ?)",
    [item.title.trim(), item.important ? 1 : 0, item.date, new Date().toISOString()],
  );
  return result.lastInsertRowId;
}

// ── 수정 ──────────────────────────────────────────────────────

/** 완료 여부를 토글한다 */
export async function toggleTodo(id: number, done: boolean): Promise<void> {
  const db = await getDatabase();
  await db.runAsync("UPDATE todos SET done = ? WHERE id = ?", [done ? 1 : 0, id]);
}

/** 내용·날짜·중요 표시를 바꾼다 (넘긴 값만 수정) */
export async function updateTodo(
  id: number,
  fields: { title?: string; date?: string; important?: boolean },
): Promise<void> {
  const db = await getDatabase();
  if (fields.title !== undefined) await db.runAsync("UPDATE todos SET title = ? WHERE id = ?", [fields.title.trim(), id]);
  if (fields.date !== undefined) await db.runAsync("UPDATE todos SET date = ? WHERE id = ?", [fields.date, id]);
  if (fields.important !== undefined) await db.runAsync("UPDATE todos SET important = ? WHERE id = ?", [fields.important ? 1 : 0, id]);
}

/** 중요 표시를 바꾼다 */
export async function setTodoImportant(id: number, important: boolean): Promise<void> {
  const db = await getDatabase();
  await db.runAsync("UPDATE todos SET important = ? WHERE id = ?", [important ? 1 : 0, id]);
}

// ── 삭제 ──────────────────────────────────────────────────────

/** 투두를 삭제한다 */
export async function deleteTodo(id: number): Promise<void> {
  const db = await getDatabase();
  await db.runAsync("DELETE FROM todos WHERE id = ?", [id]);
}
