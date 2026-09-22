/**
 * SQLite 데이터베이스 초기화
 *
 * 앱 전체에서 DB 인스턴스를 하나만 유지하기 위해 모듈 레벨 싱글턴으로 관리한다.
 * getDatabase()를 여러 번 호출해도 한 번만 열린다.
 *
 * 마이그레이션 전략: 단순 CREATE IF NOT EXISTS.
 * 컬럼 추가 등 스키마 변경이 필요하면 user_version을 올려 마이그레이션한다.
 */

import * as SQLite from "expo-sqlite";

let _db: SQLite.SQLiteDatabase | null = null;

export async function getDatabase(): Promise<SQLite.SQLiteDatabase> {
  if (_db) return _db;

  _db = await SQLite.openDatabaseAsync("haru.db");

  // WAL 모드: 동시 읽기 성능 향상, 앱에서 한 연결만 쓰므로 충분
  await _db.execAsync("PRAGMA journal_mode = WAL;");

  // 현재 스키마 버전 확인 — 버전 기반 마이그레이션 전략
  const versionRow = await _db.getFirstAsync<{ user_version: number }>("PRAGMA user_version");
  const schemaVersion = versionRow?.user_version ?? 0;

  // 거래 내역 테이블
  // type: 'income'(수입) | 'expense'(지출)
  // amount: 원 단위 정수 (소수점 없음)
  // date: YYYY-MM-DD — 월별 필터링의 기준 컬럼
  await _db.execAsync(`
    CREATE TABLE IF NOT EXISTS transactions (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      type       TEXT    NOT NULL CHECK(type IN ('income', 'expense')),
      amount     INTEGER NOT NULL CHECK(amount > 0),
      category   TEXT    NOT NULL,
      note       TEXT    NOT NULL DEFAULT '',
      date       TEXT    NOT NULL,
      created_at TEXT    NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_tx_date ON transactions(date DESC);

    -- 일정 테이블
    -- time: HH:MM 형식, 종일 일정이면 빈 문자열
    -- date: YYYY-MM-DD — 달력 렌더링·월별 조회의 기준 컬럼
    CREATE TABLE IF NOT EXISTS schedules (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      title      TEXT    NOT NULL,
      date       TEXT    NOT NULL,
      time       TEXT    NOT NULL DEFAULT '',
      note       TEXT    NOT NULL DEFAULT '',
      created_at TEXT    NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_sch_date ON schedules(date);

    -- 투두리스트 테이블
    -- done: 0(미완료) | 1(완료)
    -- date: YYYY-MM-DD — 날짜별 조회 기준
    CREATE TABLE IF NOT EXISTS todos (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      title      TEXT    NOT NULL,
      done       INTEGER NOT NULL DEFAULT 0,
      date       TEXT    NOT NULL,
      created_at TEXT    NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_todo_date ON todos(date);
  `);

  // ── 마이그레이션 v1 → v2: schedules.color 컬럼 추가 ──────────────
  // ALTER TABLE은 기존 데이터를 보존하면서 컬럼을 추가한다.
  // DEFAULT '#6B6EE7'(인디고)으로 기존 일정에는 기본 색상이 자동 적용된다.
  if (schemaVersion < 2) {
    await _db.execAsync(
      `ALTER TABLE schedules ADD COLUMN color TEXT NOT NULL DEFAULT '#6B6EE7';`
    );
    await _db.execAsync("PRAGMA user_version = 2;");
  }

  return _db;
}
