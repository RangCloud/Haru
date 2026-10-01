/**
 * 고정 루틴 DB 레이어
 *
 * 루틴 = 정해진 요일마다 반복되는 할 일 (예: 운동 — 월·수·금).
 * 루틴 자체는 한 번만 저장하고, "그날 완료했는지"는 routine_checks에 날짜별로 따로 기록한다.
 * 그래서 월요일에 체크해도 수요일 목록에는 다시 빈 체크박스로 나타난다.
 */

import { getDatabase } from "./database";

// ── 타입 ──────────────────────────────────────────────────────

export interface Routine {
  id: number;
  title: string;
  weekdays: string;    // 일~토 7자리 '0'/'1' (예: 월·수·금 = '0101010')
  important: boolean;
  start_date: string;  // 이 날짜 이전에는 표시하지 않음
  created_at: string;
}

/** 특정 날짜에 보여줄 루틴 + 그날의 완료 여부 */
export interface RoutineForDate extends Routine {
  done: boolean;
}

type RoutineRow = Omit<Routine, "important"> & { important: number };

export const WEEKDAY_LABELS = ["일", "월", "화", "수", "목", "금", "토"] as const;

/** '0101010' → '월·수·금', 매일이면 '매일' */
export function describeWeekdays(weekdays: string): string {
  if (weekdays === "1111111") return "매일";
  if (weekdays === "0111110") return "평일";
  if (weekdays === "1000001") return "주말";
  return WEEKDAY_LABELS.filter((_, i) => weekdays[i] === "1").join("·");
}

/** YYYY-MM-DD의 요일 인덱스(0=일요일). 시간대 영향을 받지 않도록 로컬 날짜로 만든다 */
function weekdayOf(date: string): number {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(y, m - 1, d).getDay();
}

// ── 조회 ──────────────────────────────────────────────────────

/** 해당 날짜의 요일에 반복되는 루틴과 그날의 완료 여부를 반환한다 */
export async function getRoutinesForDate(date: string): Promise<RoutineForDate[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<RoutineRow & { done: number }>(
    `SELECT r.*,
            EXISTS(SELECT 1 FROM routine_checks c WHERE c.routine_id = r.id AND c.date = ?) AS done
     FROM routines r
     WHERE r.start_date <= ?
     ORDER BY r.important DESC, r.created_at ASC`,
    [date, date],
  );
  const wd = weekdayOf(date);
  return rows
    .filter((r) => r.weekdays[wd] === "1")
    .map((r) => ({ ...r, important: r.important === 1, done: r.done === 1 }));
}

// ── 추가·수정·삭제 ─────────────────────────────────────────────

export async function addRoutine(title: string, weekdays: string, startDate: string, important = false): Promise<number> {
  const db = await getDatabase();
  const result = await db.runAsync(
    "INSERT INTO routines (title, weekdays, important, start_date, created_at) VALUES (?, ?, ?, ?, ?)",
    [title.trim(), weekdays, important ? 1 : 0, startDate, new Date().toISOString()],
  );
  return result.lastInsertRowId;
}

export async function updateRoutine(id: number, fields: { title?: string; weekdays?: string; important?: boolean }): Promise<void> {
  const db = await getDatabase();
  if (fields.title !== undefined) await db.runAsync("UPDATE routines SET title = ? WHERE id = ?", [fields.title.trim(), id]);
  if (fields.weekdays !== undefined) await db.runAsync("UPDATE routines SET weekdays = ? WHERE id = ?", [fields.weekdays, id]);
  if (fields.important !== undefined) await db.runAsync("UPDATE routines SET important = ? WHERE id = ?", [fields.important ? 1 : 0, id]);
}

/** 루틴과 그 루틴의 모든 완료 기록을 함께 지운다 */
export async function deleteRoutine(id: number): Promise<void> {
  const db = await getDatabase();
  await db.withTransactionAsync(async () => {
    await db.runAsync("DELETE FROM routine_checks WHERE routine_id = ?", [id]);
    await db.runAsync("DELETE FROM routines WHERE id = ?", [id]);
  });
}

/** 특정 날짜의 루틴 완료 여부를 기록한다 */
export async function setRoutineDone(id: number, date: string, done: boolean): Promise<void> {
  const db = await getDatabase();
  if (done) {
    await db.runAsync("INSERT OR IGNORE INTO routine_checks (routine_id, date) VALUES (?, ?)", [id, date]);
  } else {
    await db.runAsync("DELETE FROM routine_checks WHERE routine_id = ? AND date = ?", [id, date]);
  }
}
