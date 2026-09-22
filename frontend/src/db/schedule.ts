/**
 * 일정 CRUD
 *
 * 모든 데이터는 기기 로컬 SQLite에만 저장된다 (외부 전송 금지, CLAUDE.md §4).
 * UI·상태 관리는 store/scheduleStore.ts가 담당한다.
 */

import { getDatabase } from "./database";

// ── 타입 정의 ──────────────────────────────────────────────────

export interface ScheduleItem {
  id: number;
  title: string;
  date: string;        // YYYY-MM-DD
  time: string;        // HH:MM, 종일이면 ""
  note: string;
  color: string;       // 일정 색상 hex — 기본값 '#6B6EE7'
  created_at: string;  // ISO 8601
}

export type NewScheduleItem = Omit<ScheduleItem, "id" | "created_at">;

// ── CRUD 함수 ──────────────────────────────────────────────────

/** 새 일정을 추가하고 생성된 id를 반환한다 */
export async function addSchedule(s: NewScheduleItem): Promise<number> {
  const db = await getDatabase();
  const result = await db.runAsync(
    `INSERT INTO schedules (title, date, time, note, color, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [s.title, s.date, s.time, s.note, s.color ?? "#6B6EE7", new Date().toISOString()],
  );
  return result.lastInsertRowId;
}

/**
 * 특정 연월의 일정을 날짜순으로 조회한다.
 * LIKE 'YYYY-MM%' 패턴으로 빠르게 필터링한다.
 */
export async function getSchedulesByMonth(
  year: number,
  month: number,
): Promise<ScheduleItem[]> {
  const db = await getDatabase();
  const prefix = `${year}-${String(month).padStart(2, "0")}`;
  return db.getAllAsync<ScheduleItem>(
    `SELECT * FROM schedules
     WHERE date LIKE ?
     ORDER BY date ASC, time ASC`,
    [`${prefix}%`],
  );
}

/** 특정 날짜의 일정만 조회한다 (달력 날짜 탭 시 사용) */
export async function getSchedulesByDate(date: string): Promise<ScheduleItem[]> {
  const db = await getDatabase();
  return db.getAllAsync<ScheduleItem>(
    `SELECT * FROM schedules WHERE date = ? ORDER BY time ASC`,
    [date],
  );
}

/** 일정을 삭제한다 */
export async function deleteSchedule(id: number): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(`DELETE FROM schedules WHERE id = ?`, [id]);
}

/**
 * 일정을 수정한다.
 * 변경할 필드만 동적으로 업데이트한다.
 */
export async function updateSchedule(
  id: number,
  s: Partial<NewScheduleItem>,
): Promise<void> {
  const db = await getDatabase();
  const fields: string[] = [];
  const values: (string | number)[] = [];

  if (s.title !== undefined) { fields.push("title = ?"); values.push(s.title); }
  if (s.date !== undefined)  { fields.push("date = ?");  values.push(s.date); }
  if (s.time !== undefined)  { fields.push("time = ?");  values.push(s.time); }
  if (s.note !== undefined)  { fields.push("note = ?");  values.push(s.note); }
  if (s.color !== undefined) { fields.push("color = ?"); values.push(s.color); }

  if (fields.length === 0) return;
  values.push(id);

  await db.runAsync(
    `UPDATE schedules SET ${fields.join(", ")} WHERE id = ?`,
    values,
  );
}
