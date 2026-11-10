"""
접속자(IP)별 호출 제한 — 외부 유료·할당량 API를 한 사람이 다 써 버리지 못하게 막는다.

왜 필요한가 (2026-11 보안 점검):
- 운세: 하루 AI 호출 한도(150회)가 서버 전체 공용이라, 한 사람이 생년월일을 바꿔 가며 150번 부르면
  그날 모든 사용자의 운세가 막혔다.
- 날씨: 격자 번호를 바꿔 가며 부르면 캐시에 걸리지 않아 매번 기상청을 호출 → 기상청 일일 할당량을 소진할 수 있었다.
→ "캐시에 없어서 외부 API를 실제로 부르는 경우"에만 IP별로 센다. 캐시 응답은 비용이 없으므로 세지 않는다.

동작 방식 (슬라이딩 윈도우):
1. IP마다 최근 호출 시각 목록을 들고 있는다.
2. 호출이 오면 window_sec보다 오래된 시각을 버린다.
3. 남은 개수가 max_calls 이상이면 거절, 아니면 지금 시각을 추가하고 허용.
4. 오래 안 쓰인 IP 기록은 주기적으로 통째로 지워 메모리가 계속 늘지 않게 한다.

서버 재시작 시 기록은 사라진다 — 무차별 호출을 늦추는 용도로는 충분하고, 별도 저장소(Redis 등)를 두지 않는다.
"""

import time
from collections import deque

from fastapi import Request

# 이 주소들에서 온 요청은 실제 접속자 IP를 모르는 것으로 본다.
# nginx가 X-Forwarded-For를 넘기지 않으면 모든 요청이 127.0.0.1로 보이는데,
# 이때 IP별 제한을 걸면 전체 사용자가 한 사람처럼 묶여 함께 막힌다 → 제한을 건너뛰고 전체 한도만 쓴다.
_UNKNOWN_HOSTS = {"127.0.0.1", "::1", "localhost", "testclient"}


class RateLimitExceeded(RuntimeError):
    """IP별 호출 한도 초과. 라우터에서 429로 바꾼다 (RuntimeError라 기존 운세 429 처리와도 호환)."""


def client_key(request: Request) -> str | None:
    """
    요청한 사람의 IP. 알 수 없으면 None.

    uvicorn은 기본 설정(--proxy-headers, forwarded-allow-ips=127.0.0.1)으로
    같은 서버의 nginx가 보낸 X-Forwarded-For를 믿고 request.client.host를 실제 접속자 IP로 바꿔 준다.
    """
    host = request.client.host if request.client else None
    if not host or host in _UNKNOWN_HOSTS:
        return None
    return host


class SlidingWindowLimiter:
    """IP별 슬라이딩 윈도우 호출 제한기 (메모리)."""

    # 기록이 이 수를 넘으면 오래된 IP를 한 번 청소한다
    _SWEEP_THRESHOLD = 5000

    def __init__(self, max_calls: int, window_sec: float, message: str) -> None:
        self.max_calls = max_calls
        self.window_sec = window_sec
        self.message = message
        self._hits: dict[str, deque[float]] = {}

    def hit(self, key: str | None, now: float | None = None) -> None:
        """
        key의 호출 한 번을 기록한다. 한도를 넘으면 RateLimitExceeded.
        key가 None(접속자를 모름)이면 아무것도 하지 않는다.
        """
        if key is None:
            return
        now = time.monotonic() if now is None else now
        cutoff = now - self.window_sec

        # 1) 이 IP의 오래된 기록 버리기
        hits = self._hits.setdefault(key, deque())
        while hits and hits[0] <= cutoff:
            hits.popleft()

        # 2) 한도 확인 — 거절된 호출은 기록하지 않는다(계속 두드려도 창이 늘어나지 않게)
        if len(hits) >= self.max_calls:
            raise RateLimitExceeded(self.message)

        # 3) 허용 — 지금 시각 기록
        hits.append(now)

        # 4) 메모리 관리 — IP가 많이 쌓이면 창 밖으로 완전히 지난 IP를 지운다
        if len(self._hits) > self._SWEEP_THRESHOLD:
            self._sweep(cutoff)

    def _sweep(self, cutoff: float) -> None:
        stale = [k for k, q in self._hits.items() if not q or q[-1] <= cutoff]
        for k in stale:
            del self._hits[k]
