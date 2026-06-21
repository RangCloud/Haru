"""
운세 API 출력 스키마
"""

from pydantic import BaseModel


class FortuneResponse(BaseModel):
    date: str       # 기준 날짜 (예: "2025-06-16") — 하루 1회 캐시의 키로 사용
    sign: str       # 별자리(영문 소문자) 또는 "general" (전체 운세)
    content: str    # Claude가 생성한 오늘의 운세 텍스트
    cached: bool    # True면 캐시 응답 — 같은 날 동일 sign 재요청은 항상 True
