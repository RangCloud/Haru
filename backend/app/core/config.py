from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    # 기상청 공공데이터포털 API 인증키 (단기예보조회서비스)
    weather_api_key: str = ""

    # 날씨 캐시 TTL(초) — 기상청 단기예보는 3시간마다 갱신되므로 1시간 캐시로 충분
    weather_cache_ttl: int = 3600

    # 네이버 오픈 API 인증 정보 — 뉴스 검색에 사용
    # 발급처: https://developers.naver.com → 애플리케이션 등록 → 검색 API 신청
    naver_client_id: str = ""
    naver_client_secret: str = ""

    # Anthropic API 키 — 오늘의 운세 생성(Claude)에 사용
    # 발급처: https://console.anthropic.com
    anthropic_api_key: str = ""

    # 프론트엔드(Expo)가 로컬에서 연결할 때 필요한 CORS 허용 오리진
    # 프로덕션에서는 실제 도메인으로 교체
    cors_origins: list[str] = ["*"]

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        # .env에 없는 키를 환경 변수에서도 찾음
        extra="ignore",
    )


# 싱글턴으로 import해서 사용: from app.core.config import settings
settings = Settings()
