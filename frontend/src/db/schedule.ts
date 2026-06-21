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
  created_at: string;  // ISO 8601
}

export type NewScheduleItem = Omit<ScheduleItem, "id" | "created_at">;

// ── CRUD 함수 ──────────────────────────────────────────────────

/** 새 일정을 추가하고 생성된 id를 반환한다 */
export async function addSchedule(s: NewScheduleItem): Promise<number> {
  const db = await getDatabase();
  const result = await db.runAsync(
    `INSERT INTO schedules (title, date, time, note, created_at)
     VALUES (?, ?, ?, ?, ?)`,
    [s.title, s.date, s.time, s.note, new Date().toISOString()],
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
