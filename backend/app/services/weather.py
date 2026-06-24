"""
기상청 단기예보 API 서비스

외부 API 호출·응답 파싱·캐싱을 담당한다.
라우터(api/weather.py)는 이 서비스만 호출하고
HTTP 세부 사항을 알 필요가 없도록 분리한다.

사용 API: 기상청 API 허브 단기예보조회서비스 v2.0
URL: https://apihub.kma.go.kr/api/typ02/openApi/VilageFcstInfoService_2.0/getVilageFcst
인증: authKey 쿼리 파라미터 (기상청 API 허브에서 발급)
"""

import time
from datetime import datetime, timedelta

import httpx

from app.core.config import settings
from app.core.coordinates import latlon_to_grid
from app.schemas.weather import HourlyWeather, WeatherResponse

# ──────────────────────────────────────────────────────────────
# 기상청 단기예보 API 엔드포인트
# ──────────────────────────────────────────────────────────────
KMA_BASE_URL = "https://apihub.kma.go.kr/api/typ02/openApi/VilageFcstInfoService_2.0/getVilageFcst"

# ──────────────────────────────────────────────────────────────
# 메모리 캐시 — { cache_key: (저장_시각, WeatherResponse) }
# 서버 재시작 시 초기화된다. 트래픽이 많아지면 Redis로 교체 예정.
# ──────────────────────────────────────────────────────────────
_cache: dict[str, tuple[float, WeatherResponse]] = {}


# ── 하늘 상태 코드 → 한국어 변환 ──────────────────────────────
_SKY_MAP = {"1": "맑음", "3": "구름많음", "4": "흐림"}

# ── 강수 형태 코드 → 한국어 변환 ─────────────────────────────
_PTY_MAP = {"0": "없음", "1": "비", "2": "비/눈", "3": "눈", "4": "소나기"}


def _get_base_time(now: datetime) -> tuple[str, str]:
    """
    현재 시각에서 가장 최근에 발표된 예보의 기준 날짜·시각을 반환한다.

    기상청 단기예보는 매일 02:00, 05:00, 08:00, 11:00, 14:00, 17:00, 20:00, 23:00에
    발표된다. 발표 후 약 10분이 지나야 API에서 조회 가능하므로
    안전 마진 10분을 두고 이전 발표 시각을 사용한다.
    """
    base_times = [2, 5, 8, 11, 14, 17, 20, 23]

    # 안전 마진 10분 적용
    adjusted = now - timedelta(minutes=10)
    hour = adjusted.hour

    # 현재 시각보다 작거나 같은 가장 큰 발표 시각 선택
    selected = 23  # 기본값: 전날 23시 예보
    base_date = adjusted.strftime("%Y%m%d")

    for bt in reversed(base_times):
        if hour >= bt:
            selected = bt
            break
    else:
        # 자정 이후 2시 이전 → 전날 23시 예보 사용
        yesterday = adjusted - timedelta(days=1)
        base_date = yesterday.strftime("%Y%m%d")

    base_time = f"{selected:02d}00"
    return base_date, base_time


def _parse_items(items: list[dict]) -> list[HourlyWeather]:
    """
    기상청 API 아이템 리스트 → 시간대별 HourlyWeather 리스트 변환

    기상청 응답은 (날짜, 시각, 카테고리, 값) 형태의 행들이 섞여 있으므로
    먼저 시간대별로 groupby한 뒤 각 카테고리 값을 꺼낸다.
    """
    # { "YYYYMMDD_HHMM": { "T1H": "20", "SKY": "1", ... } }
    grouped: dict[str, dict[str, str]] = {}

    for item in items:
        key = f"{item['fcstDate']}_{item['fcstTime']}"
        if key not in grouped:
            grouped[key] = {}
        grouped[key][item["category"]] = item["fcstValue"]

    hourly: list[HourlyWeather] = []
    for time_key in sorted(grouped.keys()):
        data = grouped[time_key]
        # TMP: 3시간 예보 기온, T1H: 초단기 기온 — 단기예보는 TMP 사용
        temp_raw = data.get("TMP") or data.get("T1H", "0")
        sky_code = data.get("SKY", "1")
        pty_code = data.get("PTY", "0")
        humidity_raw = data.get("REH", "0")
        wind_raw = data.get("WSD", "0")

        hh = time_key[9:11]  # "YYYYMMDD_HHMM"에서 HH 추출
        mm = time_key[11:13]

        hourly.append(
            HourlyWeather(
                time=f"{hh}:{mm}",
                temp=float(temp_raw),
                sky=_SKY_MAP.get(sky_code, "알 수 없음"),
                rain_type=_PTY_MAP.get(pty_code, "알 수 없음"),
                humidity=int(float(humidity_raw)),
                wind_speed=float(wind_raw),
            )
        )

    return hourly


async def get_weather(lat: float, lon: float) -> WeatherResponse:
    """
    위경도를 받아 기상청 단기예보를 조회하고 정제된 응답을 반환한다.

    캐시 키: 격자 좌표 + 예보 기준 시각 → 같은 격자의 같은 예보 시간대면 캐시 반환.
    """
    grid = latlon_to_grid(lat, lon)
    now = datetime.now()
    base_date, base_time = _get_base_time(now)

    cache_key = f"{grid.nx}_{grid.ny}_{base_date}_{base_time}"

    # 캐시 히트 여부 확인
    if cache_key in _cache:
        saved_at, cached = _cache[cache_key]
        if time.time() - saved_at < settings.weather_cache_ttl:
            return cached

    # 기상청 API 호출
    params = {
        "authKey": settings.weather_api_key,  # 기상청 API 허브는 authKey 사용 (공공데이터포털의 serviceKey와 다름)
        "numOfRows": 300,   # 시간대별 × 카테고리 수 고려해 여유 있게 설정
        "pageNo": 1,
        "base_date": base_date,
        "base_time": base_time,
        "nx": grid.nx,
        "ny": grid.ny,
        "dataType": "JSON",
    }

    async with httpx.AsyncClient(timeout=10.0) as client:
        resp = await client.get(KMA_BASE_URL, params=params)
        resp.raise_for_status()
        data = resp.json()

    # 기상청은 HTTP 200이어도 resultCode가 "00"이 아닐 수 있음
    header = data["response"]["header"]
    if header["resultCode"] != "00":
        raise ValueError(f"기상청 API 오류: {header['resultCode']} - {header['resultMsg']}")

    items: list[dict] = data["response"]["body"]["items"]["item"]
    hourly = _parse_items(items)

    if not hourly:
        raise ValueError("기상청 API에서 예보 데이터를 받지 못했습니다.")

    result = WeatherResponse(
        nx=grid.nx,
        ny=grid.ny,
        base_date=base_date,
        base_time=base_time,
        current=hourly[0],
        # 현재 시각 다음 12시간 예보만 전달 (배터리·데이터 절약)
        hourly=hourly[1:13],
    )

    _cache[cache_key] = (time.time(), result)
    return result
