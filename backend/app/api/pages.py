"""
안내 페이지 라우터 — 개인정보처리방침(/privacy) · 고객 지원(/support)

왜 백엔드에서 직접 제공하나 (2026-11-18)
- 두 페이지는 원래 claude.ai 게시 페이지에 있었다. App Store 심사에서 4.2.6(앱 생성 서비스)
  반려를 받았는데, 방침·지원 주소가 AI 서비스 도메인이면 "AI 생성 서비스로 만든 앱"으로
  오해받을 수 있어 앱과 같은 서버 주소(https://haru-api.duckdns.org)로 옮겼다.
- 스토어 심사자·이용자가 로그인 없이 열어야 하므로 인증 없이 누구나 GET으로 열 수 있다.

설계 메모
- 페이지는 app/static/pages/ 아래의 완성된 HTML 파일이다. 템플릿 엔진 없이 파일을 그대로 보낸다
  (새 라이브러리 없이 FastAPI 기본 기능만 사용).
- 파일은 서버가 켜질 때 한 번 읽어 메모리에 둔다 — 요청마다 디스크를 읽지 않게 하고,
  파일이 없으면 서버 시작 단계에서 바로 실패해 배포 실수를 빨리 알 수 있다.
- 경로는 /api 아래가 아니라 최상위(/privacy, /support)다. 스토어에 입력하는 사람이 읽기 쉬운
  주소가 필요하고, nginx가 모든 경로를 uvicorn으로 넘기므로 따로 설정할 것이 없다.
- 내용을 고치면 git push → 서버 git pull → 서비스 재시작까지 해야 반영된다(메모리에 읽어 두므로).
"""

from pathlib import Path

from fastapi import APIRouter
from fastapi.responses import HTMLResponse

router = APIRouter(tags=["안내 페이지"])

# app/api/pages.py 기준으로 app/static/pages/ 를 찾는다 — 서버의 작업 폴더가 달라도 같은 파일을 읽는다
_PAGES_DIR = Path(__file__).resolve().parent.parent / "static" / "pages"

# 서버 시작 시 한 번 읽는다 (UTF-8 — 한글 페이지)
_PRIVACY_HTML = (_PAGES_DIR / "privacy.html").read_text(encoding="utf-8")
_SUPPORT_HTML = (_PAGES_DIR / "support.html").read_text(encoding="utf-8")

# 정적 문서라 브라우저·중간 캐시가 1시간 동안 재사용해도 된다.
# 너무 길게 잡으면 방침을 고친 뒤에도 옛 내용이 보이므로 1시간으로 둔다.
_CACHE_HEADERS = {"Cache-Control": "public, max-age=3600"}


@router.get("/privacy", response_class=HTMLResponse, include_in_schema=False)
async def privacy_policy() -> HTMLResponse:
    """개인정보처리방침 페이지 — 앱 설정·로그인 화면과 두 스토어에 입력한 주소"""
    return HTMLResponse(content=_PRIVACY_HTML, headers=_CACHE_HEADERS)


@router.get("/support", response_class=HTMLResponse, include_in_schema=False)
async def support() -> HTMLResponse:
    """고객 지원 페이지 — 문의·계정 및 데이터 삭제 안내(#delete)·자주 묻는 질문"""
    return HTMLResponse(content=_SUPPORT_HTML, headers=_CACHE_HEADERS)
