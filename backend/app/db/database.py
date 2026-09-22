"""
SQLite 데이터베이스 설정 (소셜 기능용)

aiosqlite를 사용해 비동기로 SQLite에 접근한다.
SQLAlchemy ORM 없이 직접 SQL로 처리해 의존성을 최소화했다.
DB 파일은 backend/ 루트에 haru_social.db로 생성된다.

테이블 구조:
  users           — 사용자 계정 (nickname, email, password_hash)
  auth_tokens     — 로그인 토큰 (UUID 기반 Bearer Token)
  friendships     — 친구 관계 (요청→수락 2단계)
  shared_schedules — 친구와 공유한 일정 (앱 로컬 일정 데이터 사본)
  schedule_likes  — 공유 일정 좋아요
"""

import aiosqlite
import os

# DB 파일 경로: 환경변수 DATABASE_URL이 있으면 그것을, 없으면 기본 경로 사용
_DB_DIR = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
DB_PATH = os.environ.get("DATABASE_URL", os.path.join(_DB_DIR, "haru_social.db"))


async def get_db() -> aiosqlite.Connection:
    """FastAPI dependency로 사용하는 DB 연결 팩토리.
    요청마다 새 연결을 열고 응답 후 닫는다."""
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row  # dict-like 접근 가능
        await db.execute("PRAGMA foreign_keys = ON")
        yield db


async def init_db() -> None:
    """앱 시작 시 테이블을 생성한다 (이미 존재하면 무시)."""
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute("PRAGMA foreign_keys = ON")
        await db.executescript("""
            CREATE TABLE IF NOT EXISTS users (
                id           INTEGER PRIMARY KEY AUTOINCREMENT,
                nickname     TEXT NOT NULL,
                email        TEXT NOT NULL UNIQUE,
                password_hash TEXT NOT NULL,
                created_at   TEXT NOT NULL DEFAULT (datetime('now'))
            );

            CREATE TABLE IF NOT EXISTS auth_tokens (
                token      TEXT PRIMARY KEY,
                user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                created_at TEXT NOT NULL DEFAULT (datetime('now'))
            );

            CREATE TABLE IF NOT EXISTS friendships (
                id          INTEGER PRIMARY KEY AUTOINCREMENT,
                from_user   INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                to_user     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                -- pending: 요청 대기, accepted: 친구, rejected: 거절
                status      TEXT NOT NULL DEFAULT 'pending',
                created_at  TEXT NOT NULL DEFAULT (datetime('now')),
                UNIQUE(from_user, to_user)
            );

            CREATE TABLE IF NOT EXISTS shared_schedules (
                id         INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                -- 원본 로컬 일정 ID (앱 SQLite의 schedules.id와 동기화)
                local_id   INTEGER NOT NULL,
                title      TEXT NOT NULL,
                date       TEXT NOT NULL,
                time       TEXT NOT NULL DEFAULT '',
                note       TEXT NOT NULL DEFAULT '',
                color      TEXT NOT NULL DEFAULT '#6B6EE7',
                shared_at  TEXT NOT NULL DEFAULT (datetime('now'))
            );

            CREATE TABLE IF NOT EXISTS schedule_likes (
                id           INTEGER PRIMARY KEY AUTOINCREMENT,
                schedule_id  INTEGER NOT NULL REFERENCES shared_schedules(id) ON DELETE CASCADE,
                user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                created_at   TEXT NOT NULL DEFAULT (datetime('now')),
                UNIQUE(schedule_id, user_id)
            );

            CREATE INDEX IF NOT EXISTS idx_friendships_from ON friendships(from_user);
            CREATE INDEX IF NOT EXISTS idx_friendships_to   ON friendships(to_user);
            CREATE INDEX IF NOT EXISTS idx_shared_user      ON shared_schedules(user_id);
            CREATE INDEX IF NOT EXISTS idx_shared_date      ON shared_schedules(date);
            CREATE INDEX IF NOT EXISTS idx_likes_schedule   ON schedule_likes(schedule_id);
        """)
        await db.commit()
