"""
운세 API 라우터 — GET /api/fortune

이 파일은 라우팅·입력 검증만 담당한다.
Claude API 호출·캐싱·레이트 리밋은 services/fortune.py에서 처리한다.
"""

from fastapi import APIRouter, HTTPException, Query

from app.schemas.fortune import FortuneResponse
from app.services.fortune import get_fortune

router = APIRouter(tags=["운세"])


@router.get("/fortune", response_model=FortuneResponse)
async def fortune(
    birth_year: int | None = Query(default=None, description="태어난 연도 (예: 1990)"),
    birth_month: int | None = Query(default=None, description="태어난 월 (1~12)"),
    birth_month_type: str = Query(default="solar", description="양력(solar) 또는 음력(lunar)"),
    birth_day: int | None = Query(default=None, description="태어난 일 (1~31)"),
    birth_hour: int | None = Query(default=None, description="태어난 시간 (0~23), 모르면 생략"),
):
    """
    오늘의 운세를 반환한다.

    - 생년월일(시)을 기반으로 개인화된 운세 생성
    - 하루 1회 Claude 실제 호출 후 캐시 (같은 날 같은 생년월일은 cached=True)
    - 하루 최대 50회 Claude 호출 제한 (레이트 리밋)
    """
    # 월 유형 검증
    if birth_month_type not in ("solar", "lunar"):
        raise HTTPException(
            status_code=422,
            detail="birth_month_type은 'solar'(양력) 또는 'lunar'(음력)만 허용합니다.",
        )

    # 생년월일 범위 검증 (제공된 경우)
    if birth_month is not None and not (1 <= birth_month <= 12):
        raise HTTPException(status_code=422, detail="birth_month는 1~12 범위여야 합니다.")
    if birth_day is not None and not (1 <= birth_day <= 31):
        raise HTTPException(status_code=422, detail="birth_day는 1~31 범위여야 합니다.")
    if birth_hour is not None and not (0 <= birth_hour <= 23):
        raise HTTPException(status_code=422, detail="birth_hour는 0~23 범위여야 합니다.")

    try:
        return await get_fortune(
            birth_year=birth_year,
            birth_month=birth_month,
            birth_month_type=birth_month_type,
            birth_day=birth_day,
            birth_hour=birth_hour,
        )
    except RuntimeError as e:
        # 레이트 리밋 초과 → 429 Too Many Requests
        raise HTTPException(status_code=429, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"운세 조회 실패: {e!s}")
