"""
오늘의 운세 서비스 — Claude API (claude-haiku-4-5) 사용

비용 최적화 전략 (CLAUDE.md §6: 유료 호출은 캐싱+레이트 리밋으로 비용 절감):
1. 날짜+생년월일을 캐시 키로 — 하루 1회만 Claude 실제 호출, 이후는 캐시 반환
2. claude-haiku-4-5 모델 — 짧은 운세 텍스트(200자) 생성에 충분, Opus 대비 비용 대폭 절감
3. 하루 최대 DAILY_RATE_LIMIT회 제한 — 캐시 미스(신규 요청)에만 차감
"""

import time
from datetime import date

import anthropic

from app.core.config import settings
from app.schemas.fortune import FortuneResponse

# 하루 Claude API 최대 실제 호출 횟수
DAILY_RATE_LIMIT = 50

# 날별 캐시 — { "YYYY-MM-DD_cachekey": (저장_시각, FortuneResponse) }
_cache: dict[str, tuple[float, FortuneResponse]] = {}

# 일별 호출 카운터 — { "YYYY-MM-DD": 호출_횟수 }
_daily_calls: dict[str, int] = {}


def _today() -> str:
    """오늘 날짜를 ISO 형식으로 반환한다 (서버가 KST 기준)"""
    return date.today().isoformat()  # "2025-06-16"


def _check_and_increment(today: str) -> None:
    """
    일별 호출 횟수를 확인하고 초과 시 예외를 발생시킨다.
    초과하지 않으면 카운터를 1 증가시킨다.

    날짜가 바뀌면 이전 날의 카운터를 삭제해 메모리 누수를 방지한다.
    """
    for d in list(_daily_calls.keys()):
        if d != today:
            del _daily_calls[d]

    count = _daily_calls.get(today, 0)
    if count >= DAILY_RATE_LIMIT:
        raise RuntimeError(
            f"오늘 운세 조회 한도({DAILY_RATE_LIMIT}회)에 도달했습니다. 내일 다시 시도해 주세요."
        )

    _daily_calls[today] = count + 1


def _make_cache_key(
    birth_year: int | None,
    birth_month: int | None,
    birth_month_type: str,
    birth_day: int | None,
    birth_hour: int | None,
) -> str:
    """캐시 키를 생성한다 — 생년월일+오늘 날짜 조합으로 하루 1회 캐시를 보장한다"""
    today = _today()
    # 생년월일 정보가 없으면 "general" 키로 처리
    if birth_year is None or birth_month is None or birth_day is None:
        return f"{today}_general"
    hour_str = str(birth_hour) if birth_hour is not None else "unknown"
    return f"{today}_{birth_year}_{birth_month}_{birth_month_type}_{birth_day}_{hour_str}"


def _build_prompt(
    today: str,
    birth_year: int | None,
    birth_month: int | None,
    birth_month_type: str,
    birth_day: int | None,
    birth_hour: int | None,
) -> str:
    """생년월일 기반 개인화 운세 프롬프트를 생성한다"""
    # 생년월일 정보가 없으면 일반 운세
    if birth_year is None or birth_month is None or birth_day is None:
        return (
            f"오늘({today}) 일반적인 오늘의 운세를 한국어로 작성해 주세요.\n"
            "긍정적이고 따뜻한 톤으로, 150~200자 이내로 간결하게 작성해 주세요.\n"
            "운세 내용만 작성하고 제목·인사말·부연 설명은 생략합니다."
        )

    month_type_label = "양력" if birth_month_type == "solar" else "음력"
    hour_label = f"{birth_hour}시" if birth_hour is not None else "시간 모름"

    return (
        f"생년월일: {birth_year}년 {birth_month}월({month_type_label}) {birth_day}일, 태어난 시간: {hour_label}\n"
        f"오늘({today}) 이 분의 오늘 하루 운세를 한국어로 작성해 주세요.\n"
        "긍정적이고 따뜻한 톤으로, 오늘 하루 주의할 점·좋은 방향·행운 요소를 포함해 150~200자 이내로 작성해 주세요.\n"
        "운세 내용만 작성하고 제목·인사말·부연 설명은 생략합니다."
    )


async def get_fortune(
    birth_year: int | None = None,
    birth_month: int | None = None,
    birth_month_type: str = "solar",
    birth_day: int | None = None,
    birth_hour: int | None = None,
) -> FortuneResponse:
    """
    오늘의 운세를 반환한다.

    생년월일을 기반으로 개인화된 운세를 생성한다.
    캐시 히트: 같은 날 같은 생년월일 → 즉시 반환 (Claude 미호출, cached=True)
    캐시 미스: Claude 실제 호출 → 결과 캐시 저장 (cached=False)
    """
    today = _today()
    cache_key = _make_cache_key(birth_year, birth_month, birth_month_type, birth_day, birth_hour)

    # 캐시 히트 → Claude 호출 없이 즉시 반환
    if cache_key in _cache:
        _, cached = _cache[cache_key]
        return cached.model_copy(update={"cached": True})

    # 레이트 리밋 확인 + 카운터 증가
    _check_and_increment(today)

    # Claude API 호출
    # claude-haiku-4-5: 짧은 텍스트 생성에 최적화된 소형 모델 (비용 절감)
    client = anthropic.AsyncAnthropic(api_key=settings.anthropic_api_key)

    prompt = _build_prompt(today, birth_year, birth_month, birth_month_type, birth_day, birth_hour)

    message = await client.messages.create(
        model="claude-haiku-4-5",
        max_tokens=400,  # 200자 한국어 ≈ 최대 400 토큰
        messages=[{"role": "user", "content": prompt}],
    )

    content_block = message.content[0]
    content = content_block.text.strip() if hasattr(content_block, "text") else ""

    # sign 필드는 하위 호환성을 위해 유지 (생년월일 기반 시 "personal" 사용)
    sign = "general" if birth_year is None else "personal"

    result = FortuneResponse(
        date=today,
        sign=sign,
        content=content,
        cached=False,
    )

    _cache[cache_key] = (time.time(), result)
    return result
