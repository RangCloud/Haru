"""
공휴일 API 입출력 스키마
"""

from pydantic import BaseModel


class Holiday(BaseModel):
    date: str   # YYYY-MM-DD
    name: str   # 예: "추석", "대체공휴일(추석)"


class HolidayResponse(BaseModel):
    year: int
    holidays: list[Holiday]   # 날짜순, 쉬는 날(isHoliday=Y)만
