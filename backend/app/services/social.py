"""
소셜 기능 비즈니스 로직

인증·친구·공유 일정·좋아요에 관한 순수 로직을 담는다.
DB 접근은 aiosqlite.Connection을 받아 처리하고 트랜잭션은 호출자가 관리한다.
"""

import hashlib
import secrets
import aiosqlite

from app.schemas.social import (
    UserProfile,
    FriendItem,
    SharedScheduleItem,
    LikeResponse,
)


# ── 패스워드 유틸 ─────────────────────────────────────────────────

def hash_password(password: str) -> str:
    """sha256 + salt 방식으로 비밀번호를 해시한다.
    프로덕션에서는 bcrypt/argon2를 권장하지만 MVP 단계에서는 이것으로 충분하다."""
    salt = "haru_salt_2025"   # 실제 배포 시 .env로 외부화할 것
    return hashlib.sha256(f"{salt}{password}".encode()).hexdigest()


def verify_password(plain: str, hashed: str) -> bool:
    return hash_password(plain) == hashed


def generate_token() -> str:
    return secrets.token_hex(32)


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
    row = await (
        await db.execute(
            "SELECT id, nickname, password_hash FROM users WHERE email = ?", (email,)
        )
    ).fetchone()

    if not row or not verify_password(password, row["password_hash"]):
        raise ValueError("이메일 또는 비밀번호가 올바르지 않습니다.")

    token = generate_token()
    await db.execute(
        "INSERT INTO auth_tokens (token, user_id) VALUES (?, ?)",
        (token, row["id"]),
    )
    await db.commit()
    return token, row["id"], row["nickname"]


async def get_user_by_token(
    db: aiosqlite.Connection,
    token: str,
) -> UserProfile | None:
    """토큰으로 사용자를 조회한다. 유효하지 않으면 None."""
    row = await (
        await db.execute(
            """SELECT u.id, u.nickname, u.email
               FROM auth_tokens t JOIN users u ON t.user_id = u.id
               WHERE t.token = ?""",
            (token,),
        )
    ).fetchone()
    if not row:
        return None
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
