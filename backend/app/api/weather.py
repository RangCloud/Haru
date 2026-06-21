"""
날씨 API 라우터

GET /api/weather?lat=37.5665&lon=126.9780
→ 해당 위치의 기상청 단기예보를 반환한다.
"""

from fastapi import APIRouter, HTTPException, Query

from app.schemas.weather import WeatherResponse
from app.services.weather import get_weather

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
        # 네트워크 오류 등 예상치 못한 예외
        raise HTTPException(status_code=500, detail=f"날씨 조회 중 오류가 발생했습니다: {e}")
