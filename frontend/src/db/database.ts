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

// DB 인스턴스가 아니라 "열고 마이그레이션까지 끝내는 작업(Promise)"을 공유한다.
// 홈 화면은 가계부·일정·할 일을 동시에 불러오는데, 인스턴스만 공유하면
// 두 번째 호출이 마이그레이션이 끝나기 전의 DB를 받아 새 컬럼 조회에 실패할 수 있다.
let _dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;

export function getDatabase(): Promise<SQLite.SQLiteDatabase> {
  if (!_dbPromise) {
    // 실패하면 다음 호출에서 다시 시도할 수 있도록 캐시를 비운다
    _dbPromise = openAndMigrate().catch((e: unknown) => {
      _dbPromise = null;
      throw e;
    });
  }
  return _dbPromise;
}

async function openAndMigrate(): Promise<SQLite.SQLiteDatabase> {
  const _db = await SQLite.openDatabaseAsync("haru.db");

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

  // ── 마이그레이션 v2 → v3: 기간 일정·종료 시간·중요 할 일·루틴·색상 이름 ──
  // 모두 "추가"만 하므로 기존 일정·거래·할 일 데이터는 그대로 유지된다.
  // 중간에 실패하면 일부 컬럼만 추가된 채 버전이 올라가는 일이 없도록 트랜잭션으로 묶는다.
  if (schemaVersion < 3) {
    const db = _db;
    await db.withTransactionAsync(async () => {
      await db.execAsync(`
        -- end_date: 기간 일정의 마지막 날(YYYY-MM-DD). 하루짜리 일정은 빈 문자열
        -- end_time: 끝나는 시각(HH:MM). 시작 시각이 없거나 끝 시각을 안 정하면 빈 문자열
        ALTER TABLE schedules ADD COLUMN end_date TEXT NOT NULL DEFAULT '';
        ALTER TABLE schedules ADD COLUMN end_time TEXT NOT NULL DEFAULT '';

        -- important: 1이면 홈 할 일 목록 맨 위에 별표와 함께 표시
        ALTER TABLE todos ADD COLUMN important INTEGER NOT NULL DEFAULT 0;

        -- 고정 루틴 — 요일마다 반복되는 할 일
        -- weekdays: 일~토 7자리 '0'/'1' 문자열 (예: 월·수·금 = '0101010')
        -- start_date: 이 날짜 이전에는 루틴을 보여주지 않는다 (만들기 전 날짜에 나타나지 않게)
        CREATE TABLE IF NOT EXISTS routines (
          id         INTEGER PRIMARY KEY AUTOINCREMENT,
          title      TEXT    NOT NULL,
          weekdays   TEXT    NOT NULL,
          important  INTEGER NOT NULL DEFAULT 0,
          start_date TEXT    NOT NULL,
          created_at TEXT    NOT NULL
        );

        -- 루틴은 매번 새로 체크하므로 "어느 날 완료했는지"를 따로 기록한다
        CREATE TABLE IF NOT EXISTS routine_checks (
          routine_id INTEGER NOT NULL,
          date       TEXT    NOT NULL,
          PRIMARY KEY (routine_id, date)
        );

        -- 일정 색상별 사용자 이름 (예: #3B82F6 → '회사')
        CREATE TABLE IF NOT EXISTS color_labels (
          color TEXT PRIMARY KEY,
          label TEXT NOT NULL
        );

        PRAGMA user_version = 3;
      `);
    });
  }

  // ── 마이그레이션 v3 → v4: 기기 캘린더에서 가져온 일정 표식 ──
  // source_id: 기기 캘린더의 어느 일정에서 왔는지(기기 일정 ID + 시작 시각). 직접 만든 일정은 빈 문자열.
  // 가져오기를 다시 눌러도 같은 일정이 두 번 들어가지 않게 하는 데만 쓴다.
  // 컬럼을 "추가"만 하므로 기존 일정은 그대로 유지된다.
  if (schemaVersion < 4) {
    const db = _db;
    await db.withTransactionAsync(async () => {
      await db.execAsync(`
        ALTER TABLE schedules ADD COLUMN source_id TEXT NOT NULL DEFAULT '';
        -- 가져올 때마다 "이미 있는 일정인가"를 찾으므로 인덱스를 둔다
        CREATE INDEX IF NOT EXISTS idx_schedules_source ON schedules(source_id);
        PRAGMA user_version = 4;
      `);
    });
  }

  return _db;
}
