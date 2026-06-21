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
  `);

  return _db;
}
