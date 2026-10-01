"""
공휴일 API 라우터 — GET /api/holidays?year=2026
"""

import logging
from typing import Annotated

import httpx
from fastapi import APIRouter, HTTPException, Query

from app.schemas.holiday import HolidayResponse
from app.services.holiday import get_holidays

logger = logging.getLogger(__name__)

router = APIRouter(tags=["공휴일"])


@router.get("/holidays", response_model=HolidayResponse)
async def holidays(
    year: Annotated[int, Query(ge=2000, le=2100, description="연도 (예: 2026)")],
) -> HolidayResponse:
    """해당 연도의 공휴일(대체·임시공휴일 포함)을 날짜순으로 반환한다. 하루 캐시."""
    try:
        return await get_holidays(year)
    except (httpx.HTTPError, KeyError, ValueError, TypeError) as e:
        # 서비스키가 담긴 요청 URL이 노출되지 않도록 예외 종류만 기록한다
        status = e.response.status_code if isinstance(e, httpx.HTTPStatusError) else "-"
        logger.error("공휴일 조회 실패: %s (upstream HTTP %s)", type(e).__name__, status)
        raise HTTPException(status_code=502, detail="공휴일 정보를 가져오지 못했습니다.")
