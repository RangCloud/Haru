"""
운세 API 라우터 — GET /api/fortune, POST /api/fortune/report

이 파일은 라우팅·입력 검증만 담당한다.
Claude API 호출·캐싱·레이트 리밋·신고 기록은 services/fortune.py에서 처리한다.
"""

import logging
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, HTTPException, Query, Request

from app.core.rate_limit import client_key
from app.schemas.fortune import (
    FortuneReportRequest,
    FortuneReportResponse,
    FortuneResponse,
)
from app.services.fortune import get_fortune, report_fortune

router = APIRouter(tags=["운세"])

logger = logging.getLogger("uvicorn.error")

# 태어난 연도 허용 범위의 하한. 상한은 올해(한국 시간)
_MIN_BIRTH_YEAR = 1900
_KST = timezone(timedelta(hours=9))


@router.get("/fortune", response_model=FortuneResponse)
async def fortune(
    request: Request,
    birth_year: int | None = Query(default=None, description="태어난 연도 (예: 1990)"),
    birth_month: int | None = Query(default=None, description="태어난 월 (1~12)"),
    birth_month_type: str = Query(default="solar", description="양력(solar) 또는 음력(lunar)"),
    birth_day: int | None = Query(default=None, description="태어난 일 (1~31)"),
    birth_hour: int | None = Query(default=None, description="태어난 시간 (0~23), 모르면 생략"),
    birth_minute: int | None = Query(default=None, description="태어난 분 (0~59), 시를 보낸 경우에만 사용"),
):
    """
    오늘의 운세를 반환한다.

    - 생년월일(시)을 기반으로 개인화된 운세 생성
    - 하루 1회 Claude 실제 호출 후 캐시 (같은 날 같은 생년월일은 cached=True)
    - 하루 최대 150회 Claude 호출 제한 (레이트 리밋)
    """
    # 월 유형 검증
    if birth_month_type not in ("solar", "lunar"):
        raise HTTPException(
            status_code=422,
            detail="birth_month_type은 'solar'(양력) 또는 'lunar'(음력)만 허용합니다.",
        )

    # 생년월일 범위 검증 (제공된 경우)
    # 연도도 검증한다 — 예전에는 아무 숫자나 받아, 연도만 바꿔 가며 새 캐시 키(=새 AI 호출)를 무한히 만들 수 있었다
    this_year = datetime.now(_KST).year
    if birth_year is not None and not (_MIN_BIRTH_YEAR <= birth_year <= this_year):
        raise HTTPException(status_code=422, detail=f"birth_year는 {_MIN_BIRTH_YEAR}~{this_year} 범위여야 합니다.")
    if birth_month is not None and not (1 <= birth_month <= 12):
        raise HTTPException(status_code=422, detail="birth_month는 1~12 범위여야 합니다.")
    if birth_day is not None and not (1 <= birth_day <= 31):
        raise HTTPException(status_code=422, detail="birth_day는 1~31 범위여야 합니다.")
    if birth_hour is not None and not (0 <= birth_hour <= 23):
        raise HTTPException(status_code=422, detail="birth_hour는 0~23 범위여야 합니다.")
    if birth_minute is not None and not (0 <= birth_minute <= 59):
        raise HTTPException(status_code=422, detail="birth_minute는 0~59 범위여야 합니다.")

    try:
        return await get_fortune(
            birth_year=birth_year,
            birth_month=birth_month,
            birth_month_type=birth_month_type,
            birth_day=birth_day,
            birth_hour=birth_hour,
            # 시를 모르면 분은 의미가 없으므로 버린다
            birth_minute=birth_minute if birth_hour is not None else None,
            client_key=client_key(request),
        )
    except RuntimeError as e:
        # 레이트 리밋 초과(서버 전체 하루 한도 또는 IP별 한도, RateLimitExceeded도 RuntimeError) → 429
        raise HTTPException(status_code=429, detail=str(e))
    except Exception as e:
        # 내부 오류 문구(AI 서비스 응답 등)를 그대로 내보내지 않는다 — 서버 기록에는 예외 종류만 남긴다
        logger.error("운세 생성 실패: %s", type(e).__name__)
        raise HTTPException(status_code=502, detail="운세를 만들지 못했어요. 잠시 후 다시 시도해 주세요.") from e


@router.post("/fortune/report", response_model=FortuneReportResponse)
async def fortune_report(body: FortuneReportRequest) -> FortuneReportResponse:
    """
    부적절한 AI 운세를 신고한다 (Google Play AI 생성 콘텐츠 정책 대응).

    - 본문: 운세 날짜와 글 (생년월일은 받지 않음)
    - 서버 기록에만 남기고, 일일 보고에서 신고 수를 알린다
    - 하루 신고 상한을 넘으면 429
    """
    try:
        report_fortune(date=body.date, content=body.content)
    except RuntimeError as e:
        raise HTTPException(status_code=429, detail=str(e))
    return FortuneReportResponse(received=True)
