"""
뉴스 API 라우터 — GET /api/news

이 파일은 라우팅만 담당한다.
뉴스 검색 로직은 services/news.py에서 처리한다.
"""

import logging
from typing import Annotated

import httpx
from fastapi import APIRouter, HTTPException, Query

from app.schemas.news import NewsCategory, NewsResponse
from app.services.news import get_news

logger = logging.getLogger(__name__)

router = APIRouter(tags=["뉴스"])


@router.get("/news", response_model=NewsResponse)
async def news(
    category: Annotated[
        NewsCategory,
        Query(description="카테고리 (all·politics·economy·society·it·culture·sports·entertainment)"),
    ] = "all",
    display: Annotated[int, Query(ge=1, le=20, description="반환 기사 수 (1~20)")] = 10,
) -> NewsResponse:
    """
    카테고리별 네이버 뉴스 검색 결과를 반환한다.

    - 헤드라인·요약·출처 링크만 제공 (본문 복제 금지, 저작권 준수)
    - 10분 캐시 적용
    - 예전 앱 빌드가 보내는 `keyword` 파라미터는 무시되고 "all"(오늘 뉴스)로 동작한다
    """
    try:
        return await get_news(category=category, display=display)
    except (httpx.HTTPError, KeyError, ValueError) as e:
        # 네트워크·네이버 응답 오류만 잡는다. 오류 내용은 서버 로그에만 남기고 앱에는 안내 문구만 보낸다
        status = e.response.status_code if isinstance(e, httpx.HTTPStatusError) else "-"
        logger.error("뉴스 조회 실패: %s (upstream HTTP %s)", type(e).__name__, status)
        raise HTTPException(status_code=502, detail="뉴스를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.")
