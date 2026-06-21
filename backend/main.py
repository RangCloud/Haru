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

from app.api import fortune, news, weather
from app.core.config import settings


@asynccontextmanager
async def lifespan(_app: FastAPI):
    """앱 시작·종료 시 실행할 코드를 여기에 둔다 (DB 연결, 캐시 초기화 등)."""
    # 시작 시 — 현재는 별도 초기화 없음
    yield
    # 종료 시 — 필요하면 리소스 정리


app = FastAPI(
    title="하루(Haru) API",
    description="가계부 · 일정 · 날씨 · 뉴스 · 운세를 제공하는 백엔드",
    version="0.1.0",
    lifespan=lifespan,
)

# ──────────────────────────────────────────────────────────────
# CORS 설정
# 개발 단계에서는 모든 오리진 허용.
# 프로덕션 배포 시 cors_origins를 실제 앱 도메인으로 제한해야 한다.
# ──────────────────────────────────────────────────────────────
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ──────────────────────────────────────────────────────────────
# 라우터 등록
# 새 기능(뉴스, 운세 등)이 추가될 때마다 여기에 include_router를 추가한다.
# ──────────────────────────────────────────────────────────────
app.include_router(weather.router, prefix="/api")
app.include_router(news.router, prefix="/api")
app.include_router(fortune.router, prefix="/api")


@app.get("/health", tags=["시스템"])
async def health_check():
    """서버 상태 확인용 엔드포인트 — 모니터링·배포 헬스체크에 사용"""
    return {"status": "ok"}
