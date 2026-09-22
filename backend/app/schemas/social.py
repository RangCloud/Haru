"""소셜 기능 입출력 Pydantic 스키마"""

from pydantic import BaseModel, EmailStr, field_validator
import re


# ── 사용자 ────────────────────────────────────────────────────────

class UserRegisterRequest(BaseModel):
    nickname: str
    email: EmailStr
    password: str

    @field_validator("nickname")
    @classmethod
    def nickname_length(cls, v: str) -> str:
        v = v.strip()
        if len(v) < 2 or len(v) > 20:
            raise ValueError("닉네임은 2~20자여야 합니다.")
        return v

    @field_validator("password")
    @classmethod
    def password_strength(cls, v: str) -> str:
        if len(v) < 6:
            raise ValueError("비밀번호는 6자 이상이어야 합니다.")
        return v


class UserLoginRequest(BaseModel):
    email: EmailStr
    password: str


class TokenResponse(BaseModel):
    token: str
    user_id: int
    nickname: str


class UserProfile(BaseModel):
    id: int
    nickname: str
    email: str


# ── 친구 ─────────────────────────────────────────────────────────

class FriendRequestBody(BaseModel):
    """친구 요청: 상대방 이메일로 식별"""
    email: EmailStr


class FriendItem(BaseModel):
    friendship_id: int
    user_id: int
    nickname: str
    email: str
    status: str          # 'pending' | 'accepted'
    direction: str       # 'sent' | 'received'


# ── 공유 일정 ─────────────────────────────────────────────────────

class ShareScheduleRequest(BaseModel):
    """앱 로컬 일정을 서버에 공유할 때 전송하는 데이터"""
    local_id: int
    title: str
    date: str           # "YYYY-MM-DD"
    time: str = ""      # "HH:MM" 또는 ""
    note: str = ""
    color: str = "#6B6EE7"


class SharedScheduleItem(BaseModel):
    id: int
    user_id: int
    nickname: str       # 공유한 사람 닉네임
    local_id: int
    title: str
    date: str
    time: str
    note: str
    color: str
    shared_at: str
    like_count: int
    liked_by_me: bool


class LikeResponse(BaseModel):
    schedule_id: int
    like_count: int
    liked_by_me: bool
