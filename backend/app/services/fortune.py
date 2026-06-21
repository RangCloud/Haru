"""
오늘의 운세 서비스 — Claude API (claude-haiku-4-5) 사용

비용 최적화 전략 (CLAUDE.md §6: 유료 호출은 캐싱+레이트 리밋으로 비용 절감):
1. 날짜+별자리를 캐시 키로 — 하루 1회만 Claude 실제 호출, 이후는 캐시 반환
2. claude-haiku-4-5 모델 — 짧은 운세 텍스트(200자) 생성에 충분, Opus 대비 비용 대폭 절감
3. 하루 최대 DAILY_RATE_LIMIT회 제한 — 새 별자리 첫 요청(캐시 미스)에만 차감
"""

import time
from datetime import date

import anthropic

from app.core.config import settings
from app.schemas.fortune import FortuneResponse

# 하루 Claude API 최대 실제 호출 횟수 (12개 별자리 + general = 13이면 충분)
DAILY_RATE_LIMIT = 50

# 날별 캐시 — { "YYYY-MM-DD_sign": (저장_시각, FortuneResponse) }
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
    # 오늘 날짜가 아닌 키는 정리
    for d in list(_daily_calls.keys()):
        if d != today:
            del _daily_calls[d]

    count = _daily_calls.get(today, 0)
    if count >= DAILY_RATE_LIMIT:
        raise RuntimeError(
            f"오늘 운세 조회 한도({DAILY_RATE_LIMIT}회)에 도달했습니다. 내일 다시 시도해 주세요."
        )

    _daily_calls[today] = count + 1


# 별자리 영문 → 한국어 변환 테이블
_SIGN_KO: dict[str, str] = {
    "general": "오늘의 전체 운세",
    "aries": "양자리(3.21~4.19) 운세",
    "taurus": "황소자리(4.20~5.20) 운세",
    "gemini": "쌍둥이자리(5.21~6.21) 운세",
    "cancer": "게자리(6.22~7.22) 운세",
    "leo": "사자자리(7.23~8.22) 운세",
    "virgo": "처녀자리(8.23~9.22) 운세",
    "libra": "천칭자리(9.23~10.22) 운세",
    "scorpio": "전갈자리(10.23~11.21) 운세",
    "sagittarius": "사수자리(11.22~12.21) 운세",
    "capricorn": "염소자리(12.22~1.19) 운세",
    "aquarius": "물병자리(1.20~2.18) 운세",
    "pisces": "물고기자리(2.19~3.20) 운세",
}


async def get_fortune(sign: str = "general") -> FortuneResponse:
    """
    오늘의 운세를 반환한다.

    sign: 별자리(영문 소문자) 또는 "general"(전체 운세)

    캐시 히트: 같은 날 같은 sign → 즉시 반환 (Claude 미호출, cached=True)
    캐시 미스: Claude 실제 호출 → 결과 캐시 저장 (cached=False)
    """
    today = _today()
    cache_key = f"{today}_{sign}"

    # 캐시 히트 → Claude 호출 없이 즉시 반환
    if cache_key in _cache:
        _, cached = _cache[cache_key]
        return cached.model_copy(update={"cached": True})

    # 레이트 리밋 확인 + 카운터 증가
    _check_and_increment(today)

    # Claude API 호출
    # claude-haiku-4-5: 짧은 텍스트 생성에 최적화된 소형 모델 (비용 절감)
    client = anthropic.AsyncAnthropic(api_key=settings.anthropic_api_key)

    sign_label = _SIGN_KO.get(sign, f"{sign} 운세")
    prompt = (
        f"오늘({today}) {sign_label}을 한국어로 작성해 주세요.\n"
        "긍정적이고 따뜻한 톤으로, 150~200자 이내로 간결하게 작성해 주세요.\n"
        "운세 내용만 작성하고 제목·인사말·부연 설명·별자리 이름은 생략합니다."
    )

    message = await client.messages.create(
        model="claude-haiku-4-5",
        max_tokens=400,  # 200자 한국어 ≈ 최대 400 토큰
        messages=[{"role": "user", "content": prompt}],
    )

    content_block = message.content[0]
    content = content_block.text.strip() if hasattr(content_block, "text") else ""

    result = FortuneResponse(
        date=today,
        sign=sign,
        content=content,
        cached=False,
    )

    _cache[cache_key] = (time.time(), result)
    return result
