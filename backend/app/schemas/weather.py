"""
날씨 관련 Pydantic 입출력 스키마

기상청 단기예보 API가 반환하는 복잡한 원본 응답을
앱이 바로 사용할 수 있는 단순한 형태로 정제한다.
"""

from pydantic import BaseModel, Field


# ──────────────────────────────────────────────────────────────
# 요청 스키마
# ──────────────────────────────────────────────────────────────

class WeatherRequest(BaseModel):
    """날씨 조회 요청 파라미터"""
    lat: float = Field(..., ge=-90, le=90, description="위도 (WGS84)")
    lon: float = Field(..., ge=-180, le=180, description="경도 (WGS84)")


# ──────────────────────────────────────────────────────────────
# 응답 스키마
# ──────────────────────────────────────────────────────────────

class HourlyWeather(BaseModel):
    """1시간 단위 예보 데이터"""
    time: str = Field(..., description="예보 시각 (HH:MM 형식, 예: '14:00')")
    temp: float = Field(..., description="기온 (°C)")
    sky: str = Field(..., description="하늘 상태 ('맑음' | '구름조금' | '구름많음' | '흐림')")
    rain_type: str = Field(..., description="강수 형태 ('없음' | '비' | '비/눈' | '눈' | '소나기')")
    humidity: int = Field(..., description="습도 (%)")
    wind_speed: float = Field(..., description="풍속 (m/s)")


class WeatherResponse(BaseModel):
    """날씨 조회 응답 — 앱에서 직접 렌더링하는 형태"""
    nx: int = Field(..., description="기상청 격자 X 좌표")
    ny: int = Field(..., description="기상청 격자 Y 좌표")
    base_date: str = Field(..., description="예보 기준 날짜 (YYYYMMDD)")
    base_time: str = Field(..., description="예보 기준 시각 (HH00)")
    current: HourlyWeather = Field(..., description="현재 시각 예보")
    hourly: list[HourlyWeather] = Field(default_factory=list, description="이후 시간대 예보 (최대 12시간)")


# ──────────────────────────────────────────────────────────────
# 기상청 API 원본 응답 파싱용 내부 모델 (앱에 노출 안 함)
# ──────────────────────────────────────────────────────────────

class _KmaItem(BaseModel):
    """기상청 단기예보 아이템 하나 (category + obsrValue)"""
    baseDate: str
    baseTime: str
    category: str   # T1H(기온), SKY(하늘), PTY(강수형태), REH(습도), WSD(풍속) 등
    fcstDate: str
    fcstTime: str
    fcstValue: str


class _KmaResponse(BaseModel):
    """기상청 응답 최상위 래퍼 — 파싱 실패 시 빠르게 감지하기 위해 사용"""
    class _Body(BaseModel):
        class _Items(BaseModel):
            item: list[_KmaItem]
        items: _Items
        numOfRows: int
        pageNo: int
        totalCount: int

    class _Header(BaseModel):
        resultCode: str
        resultMsg: str

    class _Response(BaseModel):
        header: "_KmaResponse._Header"
        body: "_KmaResponse._Body"

    response: _Response
