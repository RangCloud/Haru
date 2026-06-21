"""
네이버 뉴스 검색 API 서비스

외부 API 호출·HTML 파싱·캐싱을 담당한다.
라우터(api/news.py)는 이 서비스만 호출하고 HTTP 세부사항을 알 필요 없도록 분리한다.

사용 API: 네이버 오픈 API — 뉴스 검색 (GET /v1/search/news.json)
헤더: X-Naver-Client-Id / X-Naver-Client-Secret

저작권 준수: 뉴스 본문은 수집·저장하지 않고 헤드라인·요약·출처 링크만 반환한다.
"""

import re
import time

import httpx

from app.core.config import settings
from app.schemas.news import NewsItem, NewsResponse

# 네이버 뉴스 검색 API 엔드포인트
NAVER_NEWS_URL = "https://openapi.naver.com/v1/search/news.json"

# 뉴스 캐시 TTL(초) — 뉴스는 30분마다 새로 불러와도 충분
CACHE_TTL = 1800

# 메모리 캐시 — { "keyword_display": (저장_시각, NewsResponse) }
# 서버 재시작 시 초기화된다. 트래픽이 늘면 Redis로 교체 예정.
_cache: dict[str, tuple[float, NewsResponse]] = {}


def _strip_html(text: str) -> str:
    """
    네이버 API 응답의 title/description에 포함된 HTML 태그를 제거한다.

    네이버는 검색어에 매칭된 부분을 <b>키워드</b>로 강조하므로
    앱에 그대로 노출하면 태그 문자가 보이는 문제가 생긴다.
    HTML 엔티티(&quot; &amp;)도 함께 치환한다.
    """
    text = re.sub(r"<[^>]+>", "", text)  # <태그> 제거
    text = text.replace("&quot;", '"')
    text = text.replace("&amp;", "&")
    text = text.replace("&lt;", "<")
    text = text.replace("&gt;", ">")
    text = text.replace("&apos;", "'")
    return text.strip()


async def get_news(keyword: str = "오늘 뉴스", display: int = 10) -> NewsResponse:
    """
    네이버 뉴스 검색 결과를 반환한다.

    keyword: 검색어 (기본값 "오늘 뉴스")
    display: 반환할 기사 수 (1~100, 기본 10)

    캐시 키: "keyword_display" — 30분 이내 같은 조건의 재요청은 캐시 반환.
    """
    cache_key = f"{keyword}_{display}"

    # 캐시 히트 확인
    if cache_key in _cache:
        saved_at, cached = _cache[cache_key]
        if time.time() - saved_at < CACHE_TTL:
            return cached

    # 네이버 API 인증 헤더
    headers = {
        "X-Naver-Client-Id": settings.naver_client_id,
        "X-Naver-Client-Secret": settings.naver_client_secret,
    }
    params = {
        "query": keyword,
        "display": display,
        "start": 1,
        "sort": "date",  # 최신순 정렬
    }

    async with httpx.AsyncClient(timeout=10.0) as client:
        resp = await client.get(NAVER_NEWS_URL, headers=headers, params=params)
        resp.raise_for_status()
        data = resp.json()

    items = [
        NewsItem(
            title=_strip_html(item["title"]),
            summary=_strip_html(item["description"]),
            link=item["link"],
            pub_date=item.get("pubDate", ""),
        )
        for item in data.get("items", [])
    ]

    result = NewsResponse(
        keyword=keyword,
        total=data.get("total", 0),
        items=items,
    )

    _cache[cache_key] = (time.time(), result)
    return result
