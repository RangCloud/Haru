"""
뉴스 API 라우터 — GET /api/news

이 파일은 라우팅만 담당한다.
뉴스 검색 로직은 services/news.py에서 처리한다.
"""

from fastapi import APIRouter, HTTPException, Query

from app.schemas.news import NewsResponse
from app.services.news import get_news

router = APIRouter(tags=["뉴스"])


@router.get("/news", response_model=NewsResponse)
async def news(
    keyword: str = Query(default="오늘 뉴스", description="검색어"),
    display: int = Query(default=10, ge=1, le=20, description="반환 기사 수 (1~20)"),
):
    """
    네이버 뉴스 검색 결과를 반환한다.

    - 헤드라인·요약·출처 링크만 제공 (본문 복제 금지, 저작권 준수)
    - 30분 캐시 적용
    """
    try:
        return await get_news(keyword=keyword, display=display)
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"뉴스 조회 실패: {e!s}")
