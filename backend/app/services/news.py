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
from app.schemas.news import NewsCategory, NewsItem, NewsResponse

# 네이버 뉴스 검색 API 엔드포인트
NAVER_NEWS_URL = "https://openapi.naver.com/v1/search/news.json"

# 카테고리 → (네이버 검색어, 정렬 방식)
# 네이버 검색 API에는 섹션(카테고리) 필터가 없어서, 카테고리를 대표하는 검색어로 조회한다.
# 2026-09-28 실제 결과를 비교해 고른 조합:
#  - 단어 하나('스포츠')로 최신순 검색하면 사모펀드 기사처럼 무관한 기사가 섞였다.
#  - 여러 단어 + 최신순이 정확한 카테고리와, 정확도순(sim)이어야 정확한 카테고리(IT·스포츠)가 있다.
CATEGORY_QUERIES: dict[NewsCategory, tuple[str, str]] = {
    "all": ("오늘 뉴스", "date"),
    "politics": ("국회 정당 대통령", "date"),
    "economy": ("경제 증시 금리", "date"),
    "society": ("사건 사고 사회", "date"),
    "it": ("IT 인공지능 반도체", "sim"),
    "culture": ("문화 전시 공연", "date"),
    "sports": ("프로야구 축구", "sim"),
    "entertainment": ("연예 가수 배우", "date"),
}

# 정확도순은 같은 사건 기사가 여러 개 몰리므로 넉넉히 받아 제목이 비슷한 기사를 걸러낸다
FETCH_MULTIPLIER = 2
DEDUP_PREFIX_LEN = 12

# 뉴스 캐시 TTL(초) — 앱의 새로고침이 의미 있도록 10분.
# 카테고리 8개 × 하루 144회 = 최대 약 1,150회/일로 네이버 무료 한도(25,000회/일)에 여유가 크다.
CACHE_TTL = 600

# 메모리 캐시 — { "category_display": (저장_시각, NewsResponse) }
# 서버 재시작 시 초기화된다. 카테고리가 고정 목록이라 캐시 크기도 제한된다.
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


async def get_news(category: NewsCategory = "all", display: int = 10) -> NewsResponse:
    """
    카테고리별 네이버 뉴스 검색 결과를 반환한다.

    category: 뉴스 카테고리 (기본값 "all" = 오늘 뉴스)
    display: 반환할 기사 수 (라우터에서 1~20으로 제한)

    캐시 키: "category_display" — 10분 이내 같은 조건의 재요청은 캐시 반환.
    """
    keyword, sort = CATEGORY_QUERIES[category]
    cache_key = f"{category}_{display}"

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
        "display": display * FETCH_MULTIPLIER,
        "start": 1,
        "sort": sort,  # date = 최신순, sim = 정확도순
    }

    async with httpx.AsyncClient(timeout=10.0) as client:
        resp = await client.get(NAVER_NEWS_URL, headers=headers, params=params)
        resp.raise_for_status()
        data = resp.json()

    # 제목 앞부분(공백·기호 제외)이 같은 기사는 같은 사건의 중복 보도로 보고 첫 기사만 남긴다
    items: list[NewsItem] = []
    seen: set[str] = set()
    for item in data.get("items", []):
        title = _strip_html(item["title"])
        key = re.sub(r"[^0-9A-Za-z가-힣]", "", title)[:DEDUP_PREFIX_LEN]
        if key in seen:
            continue
        seen.add(key)
        items.append(
            NewsItem(
                title=title,
                summary=_strip_html(item["description"]),
                link=item["link"],
                pub_date=item.get("pubDate", ""),
            )
        )
        if len(items) >= display:
            break

    result = NewsResponse(
        category=category,
        keyword=keyword,
        total=data.get("total", 0),
        items=items,
    )

    _cache[cache_key] = (time.time(), result)
    return result
