"""
뉴스 API 입출력 스키마

저작권 준수: 뉴스 본문은 보관하지 않고 헤드라인·요약·출처 링크만 다룬다.
"""

from pydantic import BaseModel


class NewsItem(BaseModel):
    title: str      # 뉴스 헤드라인 (HTML 태그 제거됨)
    summary: str    # 뉴스 요약 (네이버 API description 필드)
    link: str       # 원본 기사 URL — 앱은 이 링크를 열어 본문을 읽도록 유도
    pub_date: str   # 발행일 (예: "Mon, 16 Jun 2025 10:00:00 +0900")


class NewsResponse(BaseModel):
    keyword: str            # 검색어 (예: "오늘 뉴스")
    total: int              # 네이버 API가 반환한 전체 결과 수
    items: list[NewsItem]   # 실제 반환된 기사 목록
