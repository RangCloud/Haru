"""
공휴일 서비스 — 한국천문연구원 '특일 정보' API

외부 API 호출·응답 파싱·캐싱을 담당한다.
사용 API: 공공데이터포털 한국천문연구원_특일 정보 / getRestDeInfo (공휴일 정보)
  - solYear(연도)와 solMonth(월)를 함께 보내야 한다 → 1년치는 12번 나눠 조회한다.
  - 결과가 1건이면 items.item이 배열이 아니라 객체로 온다 → 항상 리스트로 맞춘다.
  - isHoliday가 'Y'인 날만 실제로 쉬는 날이다.

공휴일은 거의 바뀌지 않지만 임시공휴일이 몇 주 전에 지정되기도 하므로 하루 단위로 캐시한다.
"""

import asyncio
import logging
import time
from typing import Any
from urllib.parse import unquote

import httpx

from app.core.config import settings
from app.schemas.holiday import Holiday, HolidayResponse

logger = logging.getLogger(__name__)

HOLIDAY_URL = "https://apis.data.go.kr/B090041/openapi/service/SpcdeInfoService/getRestDeInfo"
CACHE_TTL = 60 * 60 * 24   # 1일

# { 연도: (저장_시각, HolidayResponse) } — 연도별 1건이라 캐시 크기가 작다
_cache: dict[int, tuple[float, HolidayResponse]] = {}


def _as_list(items: Any) -> list[dict[str, Any]]:
    """items.item이 객체 하나·배열·빈 문자열 중 무엇이든 리스트로 통일한다"""
    if not items or not isinstance(items, dict):
        return []
    item = items.get("item")
    if item is None:
        return []
    return item if isinstance(item, list) else [item]


async def _fetch_month(client: httpx.AsyncClient, year: int, month: int) -> list[Holiday]:
    params = {
        # .env의 키가 URL 인코딩된 형태(%2B 등)여도 httpx가 다시 인코딩하지 않도록 먼저 디코딩한다
        "ServiceKey": unquote(settings.holiday_api_key),
        "solYear": str(year),
        "solMonth": f"{month:02d}",
        "numOfRows": 50,
        "_type": "json",
    }
    resp = await client.get(HOLIDAY_URL, params=params)
    resp.raise_for_status()
    body = resp.json()["response"]["body"]
    result: list[Holiday] = []
    for it in _as_list(body.get("items")):
        if it.get("isHoliday") != "Y":
            continue
        d = str(it["locdate"])   # 20261003 (숫자로 오기도 한다)
        result.append(Holiday(date=f"{d[:4]}-{d[4:6]}-{d[6:8]}", name=str(it.get("dateName", "")).strip()))
    return result


async def get_holidays(year: int) -> HolidayResponse:
    """해당 연도의 공휴일 목록을 반환한다. 키가 없으면 빈 목록."""
    if year in _cache:
        saved_at, cached = _cache[year]
        if time.time() - saved_at < CACHE_TTL:
            return cached

    if not settings.holiday_api_key:
        logger.warning("HOLIDAY_API_KEY가 없어 공휴일을 빈 목록으로 응답합니다.")
        return HolidayResponse(year=year, holidays=[])

    async with httpx.AsyncClient(timeout=10.0) as client:
        months = await asyncio.gather(*(_fetch_month(client, year, m) for m in range(1, 13)))

    # 같은 날 이름이 두 번 오는 경우(예: 겹치는 기념일)를 대비해 날짜 기준으로 정리
    by_date: dict[str, Holiday] = {}
    for h in (h for month in months for h in month):
        by_date.setdefault(h.date, h)
    result = HolidayResponse(year=year, holidays=sorted(by_date.values(), key=lambda h: h.date))

    _cache[year] = (time.time(), result)
    return result
