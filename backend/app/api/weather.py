"""
날씨 API 라우터

GET /api/weather?lat=37.5665&lon=126.9780
→ 해당 위치의 기상청 단기예보를 반환한다.
"""

import logging

import httpx
from fastapi import APIRouter, HTTPException, Query

from app.schemas.weather import WeatherResponse
from app.services.weather import get_weather

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/weather", tags=["날씨"])


@router.get("", response_model=WeatherResponse, summary="현재 위치 날씨 조회")
async def fetch_weather(
    lat: float = Query(..., ge=-90, le=90, description="위도 (WGS84)"),
    lon: float = Query(..., ge=-180, le=180, description="경도 (WGS84)"),
) -> WeatherResponse:
    """
    위경도를 받아 기상청 단기예보를 반환한다.

    - **lat**: 위도 (예: 37.5665 — 서울시청)
    - **lon**: 경도 (예: 126.9780)

    응답에는 현재 시각 예보(`current`)와 이후 12시간 예보(`hourly`)가 포함된다.
    """
    try:
        return await get_weather(lat=lat, lon=lon)
    except ValueError as e:
        # 기상청 API 오류 또는 응답 파싱 실패
        raise HTTPException(status_code=502, detail=str(e))
    except Exception as e:
        # httpx 예외 메시지에는 authKey가 포함된 요청 URL 전체가 들어 있다.
        # 응답은 물론 서버 로그에도 키가 남지 않도록 예외 종류와 HTTP 상태 코드만 기록한다.
        # 개인정보처리방침상 위치는 조회에만 쓰므로 좌표(lat/lon)도 기록하지 않는다.
        status = e.response.status_code if isinstance(e, httpx.HTTPStatusError) else "-"
        logger.error("날씨 조회 실패: %s (upstream HTTP %s)", type(e).__name__, status)
        raise HTTPException(status_code=500, detail="날씨 정보를 가져오지 못했습니다. 잠시 후 다시 시도해 주세요.")
