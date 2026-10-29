"""
날씨 API 라우터

GET /api/weather?nx=60&ny=127
→ 해당 기상청 격자의 단기예보를 반환한다.

위치정보법 대응: 새 앱은 위도·경도를 기기 안에서 격자로 바꾸고 격자 번호만 보낸다.
(개인위치정보를 기기 밖으로 보내지 않으면 위치기반서비스사업 신고 대상에서 빠진다 — lbsc.kr 안내)

GET /api/weather?lat=..&lon=.. 는 격자 방식 이전 빌드(테스터 기기)를 위해 잠시 남겨 둔 방식이다.
⚠️ 정식 출시 전에, 테스터가 모두 새 빌드로 바꾼 뒤 lat/lon 받기를 지운다.
"""

import logging

import httpx
from fastapi import APIRouter, HTTPException, Query

from app.core.coordinates import GridXY, latlon_to_grid
from app.schemas.weather import WeatherResponse
from app.services.weather import get_weather

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/weather", tags=["날씨"])

# 기상청 단기예보 격자 범위 (가로 149칸 × 세로 253칸). 이 밖의 값은 기상청에 보내지 않고 바로 거절한다
GRID_NX_MAX = 149
GRID_NY_MAX = 253


@router.get("", response_model=WeatherResponse, summary="현재 지역 날씨 조회")
async def fetch_weather(
    nx: int | None = Query(default=None, ge=1, le=GRID_NX_MAX, description="기상청 격자 X (예: 60 — 서울시청)"),
    ny: int | None = Query(default=None, ge=1, le=GRID_NY_MAX, description="기상청 격자 Y (예: 127)"),
    lat: float | None = Query(default=None, ge=-90, le=90, description="[이전 빌드 호환용] 위도"),
    lon: float | None = Query(default=None, ge=-180, le=180, description="[이전 빌드 호환용] 경도"),
) -> WeatherResponse:
    """
    기상청 격자(nx, ny)를 받아 단기예보를 반환한다.

    - **nx, ny**: 기상청 격자 번호 (앱이 기기 안에서 계산해 보낸다)
    - lat, lon: 격자 방식 이전 빌드 호환용. nx·ny가 없을 때만 쓴다

    응답에는 현재 시각 예보(`current`)와 이후 12시간 예보(`hourly`)가 포함된다.
    """
    # 1) 격자 번호가 오면 그대로 쓴다 (새 빌드)
    if nx is not None and ny is not None:
        grid = GridXY(nx=nx, ny=ny)
    # 2) 이전 빌드는 좌표를 보낸다 — 여기서 격자로 바꾸고 좌표는 더 쓰지 않는다
    elif lat is not None and lon is not None:
        grid = latlon_to_grid(lat, lon)
        # 한반도 밖 좌표는 격자 범위를 벗어난다. 예전에는 기상청 오류(502)로 돌아갔지만, 이제 입력 오류로 바로 알린다
        if not (1 <= grid.nx <= GRID_NX_MAX and 1 <= grid.ny <= GRID_NY_MAX):
            raise HTTPException(status_code=422, detail="날씨를 제공하지 않는 지역입니다.")
    else:
        raise HTTPException(status_code=422, detail="nx와 ny(기상청 격자)를 함께 보내 주세요.")

    try:
        return await get_weather(grid)
    except ValueError as e:
        # 기상청 API 오류 또는 응답 파싱 실패
        raise HTTPException(status_code=502, detail=str(e))
    except (httpx.HTTPError, KeyError, TypeError) as e:
        # 네트워크 오류·기상청 응답 형식 오류만 잡는다. httpx 예외 메시지에는 authKey가 포함된 요청 URL 전체가 들어 있다.
        # 응답은 물론 서버 로그에도 키가 남지 않도록 예외 종류와 HTTP 상태 코드만 기록한다.
        # 개인정보처리방침상 위치는 조회에만 쓰므로 위치(격자·좌표)도 기록하지 않는다.
        status = e.response.status_code if isinstance(e, httpx.HTTPStatusError) else "-"
        logger.error("날씨 조회 실패: %s (upstream HTTP %s)", type(e).__name__, status)
        raise HTTPException(status_code=500, detail="날씨 정보를 가져오지 못했습니다. 잠시 후 다시 시도해 주세요.")
