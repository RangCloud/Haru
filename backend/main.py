"""
하루(Haru) 백엔드 진입점

실행 방법:
    cd backend
    uv run uvicorn main:app --reload --port 8000

Swagger UI: http://localhost:8000/docs
"""

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api import fortune, holiday, news, weather, social
from app.core.config import settings
from app.db.database import init_db


@asynccontextmanager
async def lifespan(_app: FastAPI):
    """앱 시작·종료 시 실행할 코드를 여기에 둔다."""
    # DB 테이블 자동 생성 (이미 있으면 무시)
    await init_db()
    yield
    # 종료 시 — 필요하면 리소스 정리


app = FastAPI(
    title="하루(Haru) API",
    description="가계부 · 일정 · 날씨 · 뉴스 · 운세를 제공하는 백엔드",
    version="0.1.0",
    lifespan=lifespan,
    # API 문서는 ENABLE_DOCS=true일 때만 — 운영에서는 끈다(내부 구조 노출 방지, 2026-11 보안 점검)
    docs_url="/docs" if settings.enable_docs else None,
    redoc_url="/redoc" if settings.enable_docs else None,
    openapi_url="/openapi.json" if settings.enable_docs else None,
)

# ──────────────────────────────────────────────────────────────
# CORS 설정 — 앱(iOS·Android)은 CORS와 무관하므로 기본은 붙이지 않는다.
# 웹에서 개발할 때만 .env의 CORS_ORIGINS로 허용할 주소를 정한다.
# 인증은 쿠키가 아니라 Authorization 헤더를 쓰므로 allow_credentials는 끈다.
# ──────────────────────────────────────────────────────────────
if settings.cors_origins:
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=False,
        allow_methods=["GET", "POST", "PUT", "DELETE"],
        allow_headers=["*"],
    )

# ──────────────────────────────────────────────────────────────
# 라우터 등록
# 새 기능(뉴스, 운세 등)이 추가될 때마다 여기에 include_router를 추가한다.
# ──────────────────────────────────────────────────────────────
app.include_router(weather.router, prefix="/api")
app.include_router(news.router, prefix="/api")
app.include_router(fortune.router, prefix="/api")
# 친구 API는 ENABLE_SOCIAL=true일 때만 연다 — v1.0 앱은 친구 탭을 숨겨 쓰지 않는다.
# (DB 테이블 생성 init_db는 그대로 두어, 기존 친구 데이터 파일은 건드리지 않는다)
if settings.enable_social:
    app.include_router(social.router, prefix="/api")
app.include_router(holiday.router, prefix="/api")


@app.get("/health", tags=["시스템"])
async def health_check():
    """서버 상태 확인용 엔드포인트 — 모니터링·배포 헬스체크에 사용"""
    return {"status": "ok"}
