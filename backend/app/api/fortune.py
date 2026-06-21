"""
운세 API 라우터 — GET /api/fortune

이 파일은 라우팅·입력 검증만 담당한다.
Claude API 호출·캐싱·레이트 리밋은 services/fortune.py에서 처리한다.
"""

from fastapi import APIRouter, HTTPException, Query

from app.schemas.fortune import FortuneResponse
from app.services.fortune import get_fortune

router = APIRouter(tags=["운세"])

# 지원하는 별자리 목록 — 입력값 검증에 사용
_VALID_SIGNS = frozenset({
    "general",
    "aries", "taurus", "gemini", "cancer",
    "leo", "virgo", "libra", "scorpio", "sagittarius",
    "capricorn", "aquarius", "pisces",
})


@router.get("/fortune", response_model=FortuneResponse)
async def fortune(
    sign: str = Query(
        default="general",
        description="별자리(영문 소문자) 또는 'general' (전체 운세)",
    ),
):
    """
    오늘의 운세를 반환한다.

    - 하루 1회 Claude 실제 호출 후 캐시 (같은 날 같은 별자리는 cached=True 반환)
    - 하루 최대 50회 Claude 호출 제한 (레이트 리밋)
    """
    sign = sign.lower().strip()

    if sign not in _VALID_SIGNS:
        raise HTTPException(
            status_code=422,
            detail=(
                f"유효하지 않은 별자리: '{sign}'. "
                f"가능한 값: {', '.join(sorted(_VALID_SIGNS))}"
            ),
        )

    try:
        return await get_fortune(sign=sign)
    except RuntimeError as e:
        # 레이트 리밋 초과 → 429 Too Many Requests
        raise HTTPException(status_code=429, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"운세 조회 실패: {e!s}")
