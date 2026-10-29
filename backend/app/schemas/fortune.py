"""
운세 API 입출력 스키마
"""

from pydantic import BaseModel, Field


class FortuneResponse(BaseModel):
    date: str       # 기준 날짜 (예: "2025-06-16") — 하루 1회 캐시의 키로 사용
    sign: str       # 별자리(영문 소문자) 또는 "general" (전체 운세)
    content: str    # Claude가 생성한 오늘의 운세 텍스트
    cached: bool    # True면 캐시 응답 — 같은 날 동일 sign 재요청은 항상 True


class FortuneReportRequest(BaseModel):
    """
    부적절한 AI 운세 신고 — POST /api/fortune/report 본문

    Google Play AI 생성 콘텐츠 정책: 앱 안에서 AI 결과를 신고할 수 있어야 한다.
    생년월일은 받지 않는다. 신고 처리에는 '어떤 글이었는지'만 필요하다.
    """

    # "YYYY-MM-DD" — 형식만 확인한다. 날짜가 틀려도 기록 참고용일 뿐이라 해가 없다
    date: str = Field(..., pattern=r"^\d{4}-\d{2}-\d{2}$")
    # 운세 글은 200자 안팎이다. 넉넉히 1,000자까지만 받아 서버 기록이 부풀려지는 것을 막는다
    content: str = Field(..., min_length=1, max_length=1000)


class FortuneReportResponse(BaseModel):
    received: bool  # 기록했으면 True
