"""
소셜 기능 FastAPI 라우터

엔드포인트 목록:
  POST   /api/social/register        — 회원가입
  POST   /api/social/login           — 로그인 (Bearer Token 발급)
  GET    /api/social/me              — 내 프로필
  POST   /api/social/friends/request — 친구 요청
  GET    /api/social/friends         — 친구 목록
  PUT    /api/social/friends/{id}/accept  — 친구 수락
  PUT    /api/social/friends/{id}/reject  — 친구 거절
  POST   /api/social/schedules/share — 일정 공유
  DELETE /api/social/schedules/{id}  — 공유 일정 삭제
  GET    /api/social/feed            — 친구 피드 (date 쿼리 선택)
  POST   /api/social/schedules/{id}/like — 좋아요 토글

인증: Authorization: Bearer <token> 헤더
"""

from fastapi import APIRouter, Depends, HTTPException, Header
from typing import Annotated
import aiosqlite

from app.db.database import get_db
from app.schemas.social import (
    UserRegisterRequest, UserLoginRequest, TokenResponse, UserProfile,
    FriendRequestBody, FriendItem,
    ShareScheduleRequest, SharedScheduleItem, LikeResponse,
)
import app.services.social as svc

router = APIRouter(prefix="/social", tags=["소셜"])


# ── 인증 의존성 ──────────────────────────────────────────────────

async def get_current_user(
    authorization: Annotated[str | None, Header()] = None,
    db: aiosqlite.Connection = Depends(get_db),
) -> UserProfile:
    """Authorization: Bearer <token> 헤더에서 사용자를 추출하는 공통 의존성."""
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="인증 토큰이 필요합니다.")
    token = authorization.removeprefix("Bearer ").strip()
    user = await svc.get_user_by_token(db, token)
    if not user:
        raise HTTPException(status_code=401, detail="유효하지 않은 토큰입니다.")
    return user


# ── 인증 ─────────────────────────────────────────────────────────

@router.post("/register", response_model=UserProfile, status_code=201)
async def register(
    body: UserRegisterRequest,
    db: aiosqlite.Connection = Depends(get_db),
):
    """회원가입. 이메일 중복이면 400."""
    try:
        return await svc.register_user(db, body.nickname, body.email, body.password)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/login", response_model=TokenResponse)
async def login(
    body: UserLoginRequest,
    db: aiosqlite.Connection = Depends(get_db),
):
    """로그인. 성공하면 Bearer Token 반환."""
    try:
        token, user_id, nickname = await svc.login_user(db, body.email, body.password)
        return TokenResponse(token=token, user_id=user_id, nickname=nickname)
    except ValueError as e:
        raise HTTPException(status_code=401, detail=str(e))


@router.get("/me", response_model=UserProfile)
async def get_me(current_user: UserProfile = Depends(get_current_user)):
    """현재 로그인한 사용자 프로필."""
    return current_user


# ── 친구 ─────────────────────────────────────────────────────────

@router.post("/friends/request", response_model=FriendItem, status_code=201)
async def send_friend_request(
    body: FriendRequestBody,
    current_user: UserProfile = Depends(get_current_user),
    db: aiosqlite.Connection = Depends(get_db),
):
    """이메일로 친구 요청 전송."""
    try:
        return await svc.send_friend_request(db, current_user.id, body.email)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/friends", response_model=list[FriendItem])
async def list_friends(
    current_user: UserProfile = Depends(get_current_user),
    db: aiosqlite.Connection = Depends(get_db),
):
    """친구 목록 + 대기 중인 요청."""
    return await svc.list_friends(db, current_user.id)


@router.put("/friends/{friendship_id}/accept", status_code=204)
async def accept_friend(
    friendship_id: int,
    current_user: UserProfile = Depends(get_current_user),
    db: aiosqlite.Connection = Depends(get_db),
):
    """친구 요청 수락."""
    try:
        await svc.respond_friend_request(db, friendship_id, current_user.id, accept=True)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.put("/friends/{friendship_id}/reject", status_code=204)
async def reject_friend(
    friendship_id: int,
    current_user: UserProfile = Depends(get_current_user),
    db: aiosqlite.Connection = Depends(get_db),
):
    """친구 요청 거절."""
    try:
        await svc.respond_friend_request(db, friendship_id, current_user.id, accept=False)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


# ── 공유 일정 ─────────────────────────────────────────────────────

@router.post("/schedules/share", status_code=201)
async def share_schedule(
    body: ShareScheduleRequest,
    current_user: UserProfile = Depends(get_current_user),
    db: aiosqlite.Connection = Depends(get_db),
):
    """로컬 일정을 친구들에게 공유한다."""
    shared_id = await svc.share_schedule(
        db, current_user.id,
        body.local_id, body.title, body.date, body.time, body.note, body.color,
    )
    return {"id": shared_id}


@router.delete("/schedules/{schedule_id}", status_code=204)
async def delete_shared_schedule(
    schedule_id: int,
    current_user: UserProfile = Depends(get_current_user),
    db: aiosqlite.Connection = Depends(get_db),
):
    """공유한 일정을 취소(삭제)한다."""
    try:
        await svc.delete_shared_schedule(db, schedule_id, current_user.id)
    except ValueError as e:
        raise HTTPException(status_code=403, detail=str(e))


@router.get("/feed", response_model=list[SharedScheduleItem])
async def get_feed(
    date: str | None = None,
    current_user: UserProfile = Depends(get_current_user),
    db: aiosqlite.Connection = Depends(get_db),
):
    """친구들이 공유한 일정 피드. date(YYYY-MM-DD) 파라미터로 필터링 가능."""
    return await svc.get_friend_feed(db, current_user.id, date)


@router.post("/schedules/{schedule_id}/like", response_model=LikeResponse)
async def toggle_like(
    schedule_id: int,
    current_user: UserProfile = Depends(get_current_user),
    db: aiosqlite.Connection = Depends(get_db),
):
    """공유 일정 좋아요 토글 (없으면 추가, 있으면 제거)."""
    return await svc.toggle_like(db, schedule_id, current_user.id)
