/**
 * 일정 CRUD
 *
 * 모든 데이터는 기기 로컬 SQLite에만 저장된다 (외부 전송 금지, CLAUDE.md §4).
 * UI·상태 관리는 store/scheduleStore.ts가 담당한다.
 *
 * 기간 일정: date(시작일) ~ end_date(마지막 날). 하루짜리 일정은 end_date가 빈 문자열이다.
 * 날짜 문자열이 모두 YYYY-MM-DD라서 문자열 비교(<, >=)가 곧 날짜 비교가 된다.
 */

import { sortForDate } from "@/src/utils/scheduleText";

import { getDatabase } from "./database";

// ── 타입 정의 ──────────────────────────────────────────────────

export interface ScheduleItem {
  id: number;
  title: string;
  date: string;        // 시작일 YYYY-MM-DD
  end_date: string;    // 마지막 날 YYYY-MM-DD, 하루짜리면 ""
  time: string;        // 시작 시각 HH:MM, 종일이면 ""
  end_time: string;    // 끝 시각 HH:MM, 정하지 않았으면 ""
  note: string;
  color: string;       // 일정 색상 hex — 기본값 '#6B6EE7'
  created_at: string;  // ISO 8601
  /** 기기 캘린더에서 가져온 일정의 출처 표식. 직접 만든 일정은 "" (화면에서는 쓰지 않는다) */
  source_id?: string;
}

export type NewScheduleItem = Omit<ScheduleItem, "id" | "created_at">;

// 날짜 판정(lastDayOf·occursOn·sortForDate)은 DB와 무관한 순수 계산이라 utils/scheduleText.ts에 둔다

// ── CRUD 함수 ──────────────────────────────────────────────────

/** 새 일정을 추가하고 생성된 id를 반환한다 */
export async function addSchedule(s: NewScheduleItem): Promise<number> {
  const db = await getDatabase();
  const result = await db.runAsync(
    `INSERT INTO schedules (title, date, end_date, time, end_time, note, color, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [s.title, s.date, s.end_date, s.time, s.end_time, s.note, s.color ?? "#6B6EE7", new Date().toISOString()],
  );
  return result.lastInsertRowId;
}

/**
 * 특정 연월에 "걸쳐 있는" 일정을 모두 조회한다.
 *
 * 예) 9/29~10/2 여행은 9월 달력과 10월 달력 양쪽에 나와야 한다.
 * 조건: 시작일 ≤ 그 달 마지막 날  그리고  마지막 날 ≥ 그 달 1일.
 * 말일을 '31'로 고정해도 문자열 비교라 30일·28일인 달에서도 정확하다.
 */
export async function getSchedulesByMonth(
  year: number,
  month: number,
): Promise<ScheduleItem[]> {
  const db = await getDatabase();
  const prefix = `${year}-${String(month).padStart(2, "0")}`;
  return db.getAllAsync<ScheduleItem>(
    `SELECT * FROM schedules
     WHERE date <= ?
       AND (CASE WHEN end_date = '' THEN date ELSE end_date END) >= ?
     ORDER BY date ASC, time ASC`,
    [`${prefix}-31`, `${prefix}-01`],
  );
}

/** 특정 날짜에 걸쳐 있는 일정만 조회한다 (홈 '오늘 일정'·위젯용) */
export async function getSchedulesOnDate(date: string): Promise<ScheduleItem[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<ScheduleItem>(
    `SELECT * FROM schedules
     WHERE date <= ?
       AND (CASE WHEN end_date = '' THEN date ELSE end_date END) >= ?`,
    [date, date],
  );
  return sortForDate(rows, date);
}

/**
 * 기기 캘린더에서 가져온 일정을 한꺼번에 넣는다.
 *
 * source_id가 이미 있는 일정은 건너뛴다 — 가져오기를 여러 번 눌러도 중복되지 않고,
 * 앞서 가져온 뒤 하루에서 고친 내용(제목·색 등)도 덮어쓰지 않는다.
 * 중간에 실패하면 일부만 들어간 상태로 남지 않도록 트랜잭션으로 묶는다.
 *
 * @returns added = 새로 넣은 수, skipped = 이미 있어서 건너뛴 수
 */
export async function importSchedules(
  items: (NewScheduleItem & { source_id: string })[],
): Promise<{ added: number; skipped: number }> {
  const db = await getDatabase();
  let added = 0;
  let skipped = 0;
  const createdAt = new Date().toISOString();

  await db.withTransactionAsync(async () => {
    for (const s of items) {
      const exists = await db.getFirstAsync<{ id: number }>(
        "SELECT id FROM schedules WHERE source_id = ? LIMIT 1",
        [s.source_id],
      );
      if (exists) {
        skipped += 1;
        continue;
      }
      await db.runAsync(
        `INSERT INTO schedules (title, date, end_date, time, end_time, note, color, created_at, source_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [s.title, s.date, s.end_date, s.time, s.end_time, s.note, s.color, createdAt, s.source_id],
      );
      added += 1;
    }
  });

  return { added, skipped };
}

/** 일정을 삭제한다 */
export async function deleteSchedule(id: number): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(`DELETE FROM schedules WHERE id = ?`, [id]);
}

/**
 * 일정을 수정한다.
 * 변경할 필드만 동적으로 업데이트한다. 컬럼 이름은 아래 목록에서만 가져오므로
 * SQL 문자열에 외부 입력이 섞이지 않는다 (값은 모두 ? 바인딩).
 */
export async function updateSchedule(
  id: number,
  s: Partial<NewScheduleItem>,
): Promise<void> {
  const db = await getDatabase();
  const columns = ["title", "date", "end_date", "time", "end_time", "note", "color"] as const;
  const fields: string[] = [];
  const values: (string | number)[] = [];

  for (const col of columns) {
    const v = s[col];
    if (v !== undefined) {
      fields.push(`${col} = ?`);
      values.push(v);
    }
  }

  if (fields.length === 0) return;
  values.push(id);

  await db.runAsync(
    `UPDATE schedules SET ${fields.join(", ")} WHERE id = ?`,
    values,
  );
}
