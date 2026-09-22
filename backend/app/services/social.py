"""
소셜 기능 비즈니스 로직

인증·친구·공유 일정·좋아요에 관한 순수 로직을 담는다.
DB 접근은 aiosqlite.Connection을 받아 처리하고 트랜잭션은 호출자가 관리한다.
"""

import hashlib
import hmac
import secrets
import time
from collections import defaultdict
from datetime import datetime, timedelta, timezone
import aiosqlite

from app.schemas.social import (
    UserProfile,
    FriendItem,
    SharedScheduleItem,
    LikeResponse,
)


# ── 패스워드 해싱 (PBKDF2 + 사용자별 랜덤 salt) ────────────────────
# SHA256 + 고정 salt 방식은 레인보우 테이블 공격에 취약하다.
# PBKDF2-SHA256: 사용자마다 다른 랜덤 salt를 생성하고 260,000회 반복(OWASP 권장)해
# GPU 병렬 크랙 비용을 수천 배 높인다. Python 표준 라이브러리만 사용.
#
# 저장 형식: "pbkdf2:<salt_hex>:<hash_hex>"

_PBKDF2_ITERATIONS = 260_000


def hash_password(password: str) -> str:
    """PBKDF2-SHA256 + 랜덤 salt로 비밀번호를 해시한다."""
    salt = secrets.token_hex(16)          # 사용자마다 고유한 32자 16진수 salt
    h = hashlib.pbkdf2_hmac(
        "sha256",
        password.encode("utf-8"),
        salt.encode("utf-8"),
        _PBKDF2_ITERATIONS,
    )
    return f"pbkdf2:{salt}:{h.hex()}"


def verify_password(plain: str, stored: str) -> bool:
    """저장된 PBKDF2 해시와 입력 비밀번호를 상수 시간 비교한다.
    타이밍 공격 방지를 위해 hmac.compare_digest 사용."""
    try:
        _, salt, expected_hex = stored.split(":")
        h = hashlib.pbkdf2_hmac(
            "sha256",
            plain.encode("utf-8"),
            salt.encode("utf-8"),
            _PBKDF2_ITERATIONS,
        )
        # 타이밍 공격 방지: 길이가 달라도 상수 시간에 비교
        return hmac.compare_digest(h.hex(), expected_hex)
    except (ValueError, AttributeError):
        return False


# ── 토큰 생성 · 만료 ──────────────────────────────────────────────
# 토큰 만료 없이 영구 유효하면 탈취 시 대응 수단이 없다.
# 30일 후 만료 → 이후 재로그인 필요.

_TOKEN_TTL_DAYS = 30


def generate_token() -> tuple[str, str]:
    """(token, expires_at_iso) 쌍을 반환한다.
    expires_at은 UTC ISO-8601 문자열로 DB에 저장한다."""
    token = secrets.token_hex(32)   # 256비트 엔트로피
    expires_at = (
        datetime.now(timezone.utc) + timedelta(days=_TOKEN_TTL_DAYS)
    ).isoformat()
    return token, expires_at


# ── 로그인 rate limiting (메모리 기반) ────────────────────────────
# 서버 재시작 시 초기화되지만 일반적인 무차별 대입을 막기에 충분하다.
# 이메일 단위로 5분 내 10회 초과 시 차단.

_login_attempts: dict[str, list[float]] = defaultdict(list)
_RATE_WINDOW_SEC = 300   # 5분
_RATE_MAX_TRIES  = 10    # 10회


def _check_login_rate(email: str) -> None:
    """이메일별 로그인 시도를 검사한다. 초과 시 ValueError."""
    now = time.monotonic()
    cutoff = now - _RATE_WINDOW_SEC
    attempts = _login_attempts[email]
    # 윈도우 밖 시도 제거
    _login_attempts[email] = [t for t in attempts if t > cutoff]
    if len(_login_attempts[email]) >= _RATE_MAX_TRIES:
        raise ValueError("로그인 시도가 너무 많습니다. 잠시 후 다시 시도해주세요.")
    _login_attempts[email].append(now)


# ── 인증 ─────────────────────────────────────────────────────────

async def register_user(
    db: aiosqlite.Connection,
    nickname: str,
    email: str,
    password: str,
) -> UserProfile:
    """새 사용자를 등록한다. 이메일 중복이면 ValueError."""
    existing = await db.execute("SELECT id FROM users WHERE email = ?", (email,))
    if await existing.fetchone():
        raise ValueError("이미 사용 중인 이메일입니다.")

    pw_hash = hash_password(password)
    cur = await db.execute(
        "INSERT INTO users (nickname, email, password_hash) VALUES (?, ?, ?)",
        (nickname, email, pw_hash),
    )
    await db.commit()
    return UserProfile(id=cur.lastrowid, nickname=nickname, email=email)


async def login_user(
    db: aiosqlite.Connection,
    email: str,
    password: str,
) -> tuple[str, int, str]:
    """이메일·비밀번호 검증 후 토큰을 발급한다.
    반환: (token, user_id, nickname)"""
    # rate limit 먼저 검사 — 비밀번호 확인 전에 차단해야 타이밍 정보 누출을 막는다
    _check_login_rate(email)

    row = await (
        await db.execute(
            "SELECT id, nickname, password_hash FROM users WHERE email = ?", (email,)
        )
    ).fetchone()

    if not row or not verify_password(password, row["password_hash"]):
        raise ValueError("이메일 또는 비밀번호가 올바르지 않습니다.")

    token, expires_at = generate_token()
    await db.execute(
        "INSERT INTO auth_tokens (token, user_id, expires_at) VALUES (?, ?, ?)",
        (token, row["id"], expires_at),
    )
    await db.commit()
    return token, row["id"], row["nickname"]


async def get_user_by_token(
    db: aiosqlite.Connection,
    token: str,
) -> UserProfile | None:
    """토큰으로 사용자를 조회한다. 만료됐거나 유효하지 않으면 None."""
    row = await (
        await db.execute(
            """SELECT u.id, u.nickname, u.email, t.expires_at
               FROM auth_tokens t JOIN users u ON t.user_id = u.id
               WHERE t.token = ?""",
            (token,),
        )
    ).fetchone()
    if not row:
        return None

    # 토큰 만료 확인 — expires_at이 없는 기존 토큰은 그대로 허용(마이그레이션 호환)
    if row["expires_at"]:
        try:
            exp = datetime.fromisoformat(row["expires_at"])
            if exp < datetime.now(timezone.utc):
                return None  # 만료된 토큰
        except (ValueError, TypeError):
            pass  # 파싱 실패 시 허용 (레거시 행)

    return UserProfile(id=row["id"], nickname=row["nickname"], email=row["email"])


# ── 친구 ─────────────────────────────────────────────────────────

async def send_friend_request(
    db: aiosqlite.Connection,
    from_user_id: int,
    to_email: str,
) -> FriendItem:
    """친구 요청을 보낸다. 이미 요청 중·친구면 ValueError."""
    to_row = await (
        await db.execute("SELECT id, nickname, email FROM users WHERE email = ?", (to_email,))
    ).fetchone()
    if not to_row:
        raise ValueError("해당 이메일의 사용자를 찾을 수 없습니다.")
    if to_row["id"] == from_user_id:
        raise ValueError("자기 자신에게 친구 요청할 수 없습니다.")

    # 이미 관계가 있는지 확인 (방향 무관)
    existing = await (
        await db.execute(
            """SELECT id, status FROM friendships
               WHERE (from_user=? AND to_user=?) OR (from_user=? AND to_user=?)""",
            (from_user_id, to_row["id"], to_row["id"], from_user_id),
        )
    ).fetchone()
    if existing:
        status = existing["status"]
        if status == "accepted":
            raise ValueError("이미 친구입니다.")
        if status == "pending":
            raise ValueError("이미 친구 요청을 보냈거나 받은 상태입니다.")

    cur = await db.execute(
        "INSERT INTO friendships (from_user, to_user, status) VALUES (?, ?, 'pending')",
        (from_user_id, to_row["id"]),
    )
    await db.commit()

    return FriendItem(
        friendship_id=cur.lastrowid,
        user_id=to_row["id"],
        nickname=to_row["nickname"],
        email=to_row["email"],
        status="pending",
        direction="sent",
    )


async def respond_friend_request(
    db: aiosqlite.Connection,
    friendship_id: int,
    current_user_id: int,
    accept: bool,
) -> None:
    """친구 요청을 수락(accept=True) 또는 거절한다."""
    row = await (
        await db.execute(
            "SELECT id, to_user FROM friendships WHERE id = ? AND status = 'pending'",
            (friendship_id,),
        )
    ).fetchone()
    if not row:
        raise ValueError("유효한 친구 요청이 없습니다.")
    if row["to_user"] != current_user_id:
        raise ValueError("이 요청에 응답할 권한이 없습니다.")

    new_status = "accepted" if accept else "rejected"
    await db.execute(
        "UPDATE friendships SET status = ? WHERE id = ?",
        (new_status, friendship_id),
    )
    await db.commit()


async def list_friends(
    db: aiosqlite.Connection,
    user_id: int,
) -> list[FriendItem]:
    """사용자의 친구 목록(accepted) + 대기 중 요청(pending)을 반환한다."""
    rows = await (
        await db.execute(
            """SELECT f.id AS fid, f.from_user, f.to_user, f.status,
                      u_from.id AS uid_from, u_from.nickname AS nn_from, u_from.email AS em_from,
                      u_to.id   AS uid_to,   u_to.nickname   AS nn_to,   u_to.email   AS em_to
               FROM friendships f
               JOIN users u_from ON f.from_user = u_from.id
               JOIN users u_to   ON f.to_user   = u_to.id
               WHERE (f.from_user = ? OR f.to_user = ?) AND f.status IN ('pending','accepted')
               ORDER BY f.created_at DESC""",
            (user_id, user_id),
        )
    ).fetchall()

    result = []
    for r in rows:
        if r["from_user"] == user_id:
            other_id = r["uid_to"]
            other_nn = r["nn_to"]
            other_em = r["em_to"]
            direction = "sent"
        else:
            other_id = r["uid_from"]
            other_nn = r["nn_from"]
            other_em = r["em_from"]
            direction = "received"
        result.append(FriendItem(
            friendship_id=r["fid"],
            user_id=other_id,
            nickname=other_nn,
            email=other_em,
            status=r["status"],
            direction=direction,
        ))
    return result


# ── 공유 일정 ─────────────────────────────────────────────────────

async def share_schedule(
    db: aiosqlite.Connection,
    user_id: int,
    local_id: int,
    title: str,
    date: str,
    time: str,
    note: str,
    color: str,
) -> int:
    """로컬 일정을 서버에 공유한다. 이미 같은 local_id로 공유된 경우 업데이트."""
    existing = await (
        await db.execute(
            "SELECT id FROM shared_schedules WHERE user_id=? AND local_id=?",
            (user_id, local_id),
        )
    ).fetchone()

    if existing:
        await db.execute(
            """UPDATE shared_schedules
               SET title=?, date=?, time=?, note=?, color=?, shared_at=datetime('now')
               WHERE id=?""",
            (title, date, time, note, color, existing["id"]),
        )
        await db.commit()
        return existing["id"]

    cur = await db.execute(
        """INSERT INTO shared_schedules (user_id, local_id, title, date, time, note, color)
           VALUES (?, ?, ?, ?, ?, ?, ?)""",
        (user_id, local_id, title, date, time, note, color),
    )
    await db.commit()
    return cur.lastrowid


async def delete_shared_schedule(
    db: aiosqlite.Connection,
    schedule_id: int,
    user_id: int,
) -> None:
    """공유 일정을 삭제한다. 본인 것이 아니면 ValueError."""
    row = await (
        await db.execute(
            "SELECT user_id FROM shared_schedules WHERE id = ?", (schedule_id,)
        )
    ).fetchone()
    if not row:
        raise ValueError("공유 일정을 찾을 수 없습니다.")
    if row["user_id"] != user_id:
        raise ValueError("삭제 권한이 없습니다.")
    await db.execute("DELETE FROM shared_schedules WHERE id = ?", (schedule_id,))
    await db.commit()


async def get_friend_feed(
    db: aiosqlite.Connection,
    user_id: int,
    date: str | None = None,
) -> list[SharedScheduleItem]:
    """친구들이 공유한 일정 피드를 반환한다. date가 있으면 해당 날짜만."""
    date_filter = "AND ss.date = ?" if date else ""
    params: list = [user_id, user_id]
    if date:
        params.append(date)

    rows = await (
        await db.execute(
            f"""SELECT ss.id, ss.user_id, u.nickname, ss.local_id,
                       ss.title, ss.date, ss.time, ss.note, ss.color, ss.shared_at,
                       COUNT(sl.id) AS like_count,
                       SUM(CASE WHEN sl.user_id = ? THEN 1 ELSE 0 END) AS liked_by_me
                FROM shared_schedules ss
                JOIN users u ON ss.user_id = u.id
                JOIN friendships f ON (
                    (f.from_user = ss.user_id AND f.to_user = ?)
                    OR
                    (f.to_user   = ss.user_id AND f.from_user = ?)
                )
                LEFT JOIN schedule_likes sl ON sl.schedule_id = ss.id
                WHERE f.status = 'accepted'
                  AND ss.user_id != ?
                  {date_filter}
                GROUP BY ss.id
                ORDER BY ss.shared_at DESC
                LIMIT 50""",
            [user_id, user_id, user_id, user_id] + ([date] if date else []),
        )
    ).fetchall()

    return [
        SharedScheduleItem(
            id=r["id"],
            user_id=r["user_id"],
            nickname=r["nickname"],
            local_id=r["local_id"],
            title=r["title"],
            date=r["date"],
            time=r["time"],
            note=r["note"],
            color=r["color"],
            shared_at=r["shared_at"],
            like_count=r["like_count"] or 0,
            liked_by_me=bool(r["liked_by_me"]),
        )
        for r in rows
    ]


async def toggle_like(
    db: aiosqlite.Connection,
    schedule_id: int,
    user_id: int,
) -> LikeResponse:
    """좋아요 토글: 없으면 추가, 있으면 제거."""
    existing = await (
        await db.execute(
            "SELECT id FROM schedule_likes WHERE schedule_id=? AND user_id=?",
            (schedule_id, user_id),
        )
    ).fetchone()

    if existing:
        await db.execute(
            "DELETE FROM schedule_likes WHERE schedule_id=? AND user_id=?",
            (schedule_id, user_id),
        )
        liked_by_me = False
    else:
        await db.execute(
            "INSERT INTO schedule_likes (schedule_id, user_id) VALUES (?, ?)",
            (schedule_id, user_id),
        )
        liked_by_me = True

    await db.commit()

    count_row = await (
        await db.execute(
            "SELECT COUNT(*) AS cnt FROM schedule_likes WHERE schedule_id=?",
            (schedule_id,),
        )
    ).fetchone()

    return LikeResponse(
        schedule_id=schedule_id,
        like_count=count_row["cnt"],
        liked_by_me=liked_by_me,
    )
