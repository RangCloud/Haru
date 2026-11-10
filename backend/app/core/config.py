from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    # 기상청 API 허브 인증키(authKey) — 공공데이터포털(data.go.kr) 서비스키와 호환되지 않음
    weather_api_key: str = ""

    # 날씨 캐시 TTL(초) — 기상청 단기예보는 3시간마다 갱신되므로 1시간 캐시로 충분
    weather_cache_ttl: int = 3600

    # 공공데이터포털(data.go.kr) 서비스키 — 한국천문연구원 '특일 정보'(공휴일) 조회에 사용
    # 비어 있으면 공휴일 API는 빈 목록을 돌려주고 앱은 공휴일 없이 동작한다
    holiday_api_key: str = ""

    # 네이버 오픈 API 인증 정보 — 뉴스 검색에 사용
    # 발급처: https://developers.naver.com → 애플리케이션 등록 → 검색 API 신청
    naver_client_id: str = ""
    naver_client_secret: str = ""

    # Anthropic API 키 — 오늘의 운세 생성(Claude)에 사용
    # 발급처: https://console.anthropic.com
    anthropic_api_key: str = ""

    # CORS 허용 오리진 — 기본은 비어 있음(CORS 미들웨어 자체를 붙이지 않는다).
    # 왜: CORS는 '웹 브라우저'에서 다른 사이트가 이 API를 부를 때만 쓰인다. 하루 앱(iOS·Android)은
    # 브라우저가 아니라 CORS와 무관하므로, 열어 둘 이유가 없다(2026-11 보안 점검).
    # 웹에서 개발할 때만 .env에 CORS_ORIGINS=["http://localhost:8081"]처럼 넣는다.
    cors_origins: list[str] = []

    # API 문서(/docs·/redoc·/openapi.json) 공개 여부 — 기본 꺼짐.
    # 운영 서버에서 켜 두면 숨긴 기능(친구 API 등)까지 전체 구조가 누구에게나 보인다. 로컬 개발 때만 ENABLE_DOCS=true.
    enable_docs: bool = False

    # 친구(소셜) API 사용 여부 — 기본 꺼짐.
    # v1.0 앱은 친구 탭을 숨겼는데 서버 API는 열려 있어, 무제한 가입·이메일 존재 확인·대용량 일정 저장이 가능했다.
    # 친구 기능을 다시 켜는 버전(v1.1)에서 가입 제한·입력 길이 제한 등을 보강한 뒤 ENABLE_SOCIAL=true로 켠다.
    enable_social: bool = False

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        # .env에 없는 키를 환경 변수에서도 찾음
        extra="ignore",
    )


# 싱글턴으로 import해서 사용: from app.core.config import settings
settings = Settings()
