#!/usr/bin/env python3
"""
하루 서버 일일 보고 — Discord 웹훅으로 전송

매일 오전 10시(한국 시간)에 cron이 실행한다. 서버 자원, 하루 서비스 상태,
어제 하루 동안의 API 요청 수, 운세 AI 실제 호출 수를 모아 Discord 채널에 한 번 보낸다.

설계 원칙
- 표준 라이브러리만 쓴다. 앱의 가상환경과 무관하게 서버 기본 python3로 실행되므로,
  앱 의존성이 깨져도 보고는 계속 온다.
- 웹훅 주소는 저장소 밖의 파일(~/.haru-report.env)에서 읽는다. 주소를 아는 사람은 누구나
  채널에 글을 올릴 수 있어 비밀번호처럼 다뤄야 한다 (CLAUDE.md §6).
  앱의 .env에 넣지 않는 이유: 앱 설정이 모르는 키를 만나면 서버 기동이 실패할 수 있다.
- Discord로는 "건수"만 보낸다. 접속 기록에는 위치 좌표·생년월일이 포함된 요청 주소가 있으므로
  주소 자체는 절대 메시지에 넣지 않는다 (개인정보처리방침: 조회 목적 외 이용 금지).
- 항목 하나를 못 구해도 나머지는 보낸다. 실패한 항목은 "확인 불가"로 표시한다.

사용법
  python3 daily_report.py            # 보고 전송
  python3 daily_report.py --dry-run  # 보내지 않고 메시지만 출력 (설치 확인용)

cron 등록 (서버 시계가 UTC이므로 01:00 UTC = 한국 시간 10:00)
  0 1 * * * /usr/bin/python3 /home/ubuntu/Haru/backend/scripts/daily_report.py >> /home/ubuntu/haru-report.log 2>&1
"""

from __future__ import annotations

import json
import os
import re
import shutil
import subprocess
import sys
import urllib.error
import urllib.request
from collections import Counter
from datetime import datetime, timedelta, timezone
from pathlib import Path

# 한국은 서머타임이 없으므로 고정 +9시간으로 충분하다 (앱의 weather.py·fortune.py와 같은 방식)
KST = timezone(timedelta(hours=9))
# datetime.UTC는 Python 3.11부터 있다. 서버 기본 python3가 더 낮은 버전일 수 있어 예전 표기를 쓴다.
UTC = timezone.utc  # noqa: UP017

SERVICE = "haru"                                  # systemd 서비스 이름 (haru.service)
ENV_FILE = Path.home() / ".haru-report.env"       # DISCORD_WEBHOOK_URL=... 한 줄이 든 파일
FORTUNE_DAILY_LIMIT = 150                         # app/services/fortune.py의 DAILY_RATE_LIMIT와 맞춘다
FORTUNE_LOG_MARK = "FORTUNE_AI_CALL"              # fortune.py가 AI를 실제로 부를 때 남기는 표식

# 경고를 붙일 기준 — 넘으면 메시지 맨 위에 ⚠ 줄로 올린다
DISK_WARN_PERCENT = 85
MEMORY_WARN_PERCENT = 90

# uvicorn 접속 기록 한 줄: INFO:     127.0.0.1:5123 - "GET /api/weather?lat=.. HTTP/1.0" 200 OK
# 경로의 첫 마디(/api/weather)와 상태 코드만 꺼내고, 물음표 뒤(좌표·생년월일)는 버린다.
ACCESS_LINE = re.compile(r'"(?:GET|POST|PUT|PATCH|DELETE) (/api/[a-z_]+)[^"]*" (\d{3})')

API_LABELS = {
    "/api/weather": "날씨",
    "/api/news": "뉴스",
    "/api/fortune": "운세",
    "/api/holidays": "공휴일",
}


def run(cmd: list[str], timeout: int = 60) -> str:
    """명령을 실행해 표준 출력을 돌려준다. 실패하면 예외를 그대로 올린다."""
    return subprocess.run(cmd, capture_output=True, text=True, timeout=timeout, check=True).stdout


def yesterday_range(now: datetime) -> tuple[datetime, datetime]:
    """한국 시간 기준 '어제' 00:00 ~ 오늘 00:00 구간."""
    today_start = now.astimezone(KST).replace(hour=0, minute=0, second=0, microsecond=0)
    return today_start - timedelta(days=1), today_start


def journal_lines(since: datetime, until: datetime) -> list[str]:
    """하루 서비스의 접속 기록을 구간만큼 읽는다 (journalctl은 UTC 시각 문자열을 받는다)."""
    fmt = "%Y-%m-%d %H:%M:%S UTC"
    out = run([
        "journalctl", "-u", SERVICE, "--no-pager", "-o", "cat",
        "--since", since.astimezone(UTC).strftime(fmt),
        "--until", until.astimezone(UTC).strftime(fmt),
    ])
    return out.splitlines()


def summarize_requests(lines: list[str]) -> dict:
    """
    접속 기록에서 API별 요청 수·오류 수, 운세 AI 실제 호출 수, 서버 기동 횟수를 센다.

    - 오류 = 상태 코드 400 이상. 운세 429는 '하루 한도 초과'라 따로 센다.
      어떤 오류였는지 보고에서 바로 알 수 있도록 상태 코드별로도 센다 (error_codes).
    - 서버 기동 횟수 = "Application startup complete" 줄 수. 배포로 재시작한 것도 포함된다.
    """
    total: Counter[str] = Counter()
    errors: Counter[str] = Counter()
    error_codes: dict[str, Counter[int]] = {}
    fortune_limited = 0
    fortune_ai_calls = 0
    startups = 0

    for line in lines:
        if FORTUNE_LOG_MARK in line:
            fortune_ai_calls += 1
            continue
        if "Application startup complete" in line:
            startups += 1
            continue
        m = ACCESS_LINE.search(line)
        if not m:
            continue
        path, status = m.group(1), int(m.group(2))
        total[path] += 1
        if path == "/api/fortune" and status == 429:
            fortune_limited += 1
        elif status >= 400:
            errors[path] += 1
            error_codes.setdefault(path, Counter())[status] += 1

    return {
        "total": total,
        "errors": errors,
        "error_codes": error_codes,
        "fortune_limited": fortune_limited,
        "fortune_ai_calls": fortune_ai_calls,
        "startups": startups,
    }


# 상태 코드를 사람이 읽을 말로 — 보고를 받은 사람이 서버에 접속하지 않고도 원인을 짐작할 수 있게 한다
STATUS_HINTS = {
    404: "없는 주소",
    405: "허용되지 않은 방식",
    422: "요청 값 오류",
    429: "요청 과다",
    500: "서버 내부 오류",
    502: "외부 API 실패",
}


def describe_errors(codes: Counter[int]) -> str:
    """{502: 2, 422: 1} → '502 외부 API 실패 2건, 422 요청 값 오류 1건' (많은 순)"""
    parts = []
    for status, count in codes.most_common():
        hint = STATUS_HINTS.get(status)
        parts.append(f"{status}{' ' + hint if hint else ''} {count}건")
    return ", ".join(parts)


def memory_usage() -> tuple[float, float]:
    """(사용 중 GB, 전체 GB). 캐시는 필요하면 비워지므로 '사용 가능(MemAvailable)'을 기준으로 계산한다."""
    info: dict[str, int] = {}
    for line in Path("/proc/meminfo").read_text().splitlines():
        key, _, rest = line.partition(":")
        info[key] = int(rest.split()[0])   # kB
    total = info["MemTotal"] / 1024 / 1024
    available = info["MemAvailable"] / 1024 / 1024
    return total - available, total


def service_status() -> tuple[str, str]:
    """(상태, 켜진 시각). 상태는 active / failed / inactive 등 systemd 표기 그대로."""
    out = run(["systemctl", "show", SERVICE, "-p", "ActiveState", "-p", "ActiveEnterTimestamp"])
    props = dict(line.split("=", 1) for line in out.splitlines() if "=" in line)
    return props.get("ActiveState", "unknown"), props.get("ActiveEnterTimestamp", "")


def uptime_text(active_since: str, now: datetime) -> str:
    """systemd 시각 문자열('Fri 2026-10-09 06:22:11 UTC')을 '3일 4시간' 같은 경과 시간으로 바꾼다."""
    try:
        started = datetime.strptime(" ".join(active_since.split()[1:3]), "%Y-%m-%d %H:%M:%S").replace(tzinfo=UTC)
    except (ValueError, IndexError):
        return "알 수 없음"
    seconds = int((now - started).total_seconds())
    days, hours, minutes = seconds // 86400, (seconds % 86400) // 3600, (seconds % 3600) // 60
    if days:
        return f"{days}일 {hours}시간"
    if hours:
        return f"{hours}시간 {minutes}분"
    return f"{minutes}분"


def build_message(now: datetime) -> str:
    """Discord에 보낼 본문을 만든다. 항목별로 실패해도 나머지는 채운다."""
    start, end = yesterday_range(now)
    warnings: list[str] = []
    sections: list[str] = []

    # ── 서버 자원 ──
    lines = []
    try:
        load1, _, load15 = os.getloadavg()
        cores = os.cpu_count() or 1
        lines.append(f"CPU 부하  {load1:.2f} (15분 평균 {load15:.2f}, 코어 {cores}개)")
    except (OSError, AttributeError):   # AttributeError: 부하 평균이 없는 운영체제(Windows)에서 시험 실행할 때
        lines.append("CPU 부하  확인 불가")
    try:
        used, total = memory_usage()
        percent = used / total * 100
        lines.append(f"메모리    {used:.1f} / {total:.1f} GB ({percent:.0f}%)")
        if percent >= MEMORY_WARN_PERCENT:
            warnings.append(f"메모리 사용률이 {percent:.0f}%입니다.")
    except (OSError, KeyError, ValueError, ZeroDivisionError):
        lines.append("메모리    확인 불가")
    try:
        disk = shutil.disk_usage("/")
        percent = disk.used / disk.total * 100
        lines.append(f"디스크    {disk.used / 1024**3:.1f} / {disk.total / 1024**3:.1f} GB ({percent:.0f}%), 남은 공간 {disk.free / 1024**3:.1f} GB")
        if percent >= DISK_WARN_PERCENT:
            warnings.append(f"디스크 사용률이 {percent:.0f}%입니다.")
    except OSError:
        lines.append("디스크    확인 불가")
    sections.append("**서버 자원**\n```\n" + "\n".join(lines) + "\n```")

    # ── 접속 기록 (어제 하루) ──
    stats = None
    try:
        stats = summarize_requests(journal_lines(start, end))
    except (OSError, subprocess.SubprocessError):
        pass

    # ── 하루 서비스 상태 ──
    lines = []
    try:
        state, since = service_status()
        lines.append(f"상태      {'정상 (active)' if state == 'active' else state}")
        lines.append(f"가동 시간 {uptime_text(since, now)}")
        if state != "active":
            warnings.append(f"하루 서비스 상태가 {state}입니다.")
    except (OSError, subprocess.SubprocessError, ValueError):
        lines.append("상태      확인 불가")
    if stats is not None:
        lines.append(f"어제 기동 {stats['startups']}회 (배포 재시작 포함)")
        # 배포 없이 여러 번 켜졌다면 서버가 죽었다 살아나기를 반복한 것일 수 있다
        if stats["startups"] >= 5:
            warnings.append(f"어제 서버가 {stats['startups']}번 다시 켜졌습니다. 로그 확인이 필요합니다.")
    sections.append("**하루 서버**\n```\n" + "\n".join(lines) + "\n```")

    # ── API 사용량 ──
    if stats is None:
        sections.append("**API 사용량 (어제)**\n```\n확인 불가 — 접속 기록을 읽지 못했습니다\n```")
    else:
        lines = []
        for path, label in API_LABELS.items():
            count, err = stats["total"][path], stats["errors"][path]
            lines.append(f"{label:<4} {count:>6,}건" + (f"  (오류 {err}건)" if err else ""))
        others = sum(c for p, c in stats["total"].items() if p not in API_LABELS)
        if others:
            other_errors = sum(c for p, c in stats["errors"].items() if p not in API_LABELS)
            lines.append(f"기타 {others:>6,}건" + (f"  (오류 {other_errors}건)" if other_errors else ""))
        lines.append(f"합계 {sum(stats['total'].values()):>6,}건")
        sections.append("**API 사용량 (어제)**\n```\n" + "\n".join(lines) + "\n```")

        total_errors = sum(stats["errors"].values())
        if total_errors:
            warnings.append(f"어제 오류 응답이 {total_errors}건 있었습니다.")
            # 어느 API에서 어떤 오류였는지 — 앱이 쓰지 않는 주소(기타)는 대개 외부에서 훑고 지나간 요청이다
            detail = []
            for path, codes in sorted(stats["error_codes"].items(), key=lambda kv: -sum(kv[1].values())):
                label = API_LABELS.get(path, f"기타 {path}")
                detail.append(f"{label}: {describe_errors(codes)}")
            sections.append("**오류 내역 (어제)**
```
" + "
".join(detail[:8]) + "
```")

        # ── 운세 AI 호출 ──
        calls, limited = stats["fortune_ai_calls"], stats["fortune_limited"]
        lines = [f"실제 AI 호출 {calls} / {FORTUNE_DAILY_LIMIT}회"]
        if limited:
            lines.append(f"한도 초과로 거절 {limited}건")
            warnings.append(f"운세 하루 한도를 넘어 {limited}건이 거절됐습니다. 한도 상향을 검토하세요.")
        elif calls >= FORTUNE_DAILY_LIMIT * 0.8:
            warnings.append(f"운세 AI 호출이 한도의 {calls / FORTUNE_DAILY_LIMIT * 100:.0f}%에 달했습니다.")
        sections.append("**운세 AI 호출 (어제)**\n```\n" + "\n".join(lines) + "\n```")

    header = f"**하루 서버 일일 보고** · {start:%m월 %d일} ({'월화수목금토일'[start.weekday()]}) 기준"
    warning_block = "\n".join(f"⚠ {w}" for w in warnings)
    return "\n".join(part for part in [header, warning_block, *sections] if part)


def load_webhook_url() -> str:
    """~/.haru-report.env에서 DISCORD_WEBHOOK_URL 값을 읽는다."""
    for line in ENV_FILE.read_text(encoding="utf-8").splitlines():
        key, sep, value = line.strip().partition("=")
        if sep and key.strip() == "DISCORD_WEBHOOK_URL":
            return value.strip().strip('"').strip("'")
    raise ValueError("DISCORD_WEBHOOK_URL 항목이 없습니다")


def send(url: str, content: str) -> None:
    """Discord 웹훅으로 전송한다. 본문은 2,000자 제한이 있어 넘치면 잘라 보낸다."""
    body = json.dumps({"content": content[:1990]}).encode("utf-8")
    request = urllib.request.Request(
        url,
        data=body,
        # User-Agent가 없으면 Discord가 요청을 거부한다
        headers={"Content-Type": "application/json", "User-Agent": "haru-daily-report/1.0"},
        method="POST",
    )
    with urllib.request.urlopen(request, timeout=20) as response:
        response.read()


def main() -> int:
    message = build_message(datetime.now(UTC))
    if "--dry-run" in sys.argv:
        print(message)
        return 0
    try:
        url = load_webhook_url()
    except (OSError, ValueError) as e:
        print(f"웹훅 주소를 읽지 못했습니다 ({ENV_FILE}): {type(e).__name__}", file=sys.stderr)
        return 1
    try:
        send(url, message)
    except urllib.error.HTTPError as e:
        # 예외 메시지에 웹훅 주소가 섞여 로그에 남지 않도록 상태 코드만 기록한다
        print(f"Discord 전송 실패: HTTP {e.code}", file=sys.stderr)
        return 1
    except (urllib.error.URLError, OSError) as e:
        print(f"Discord 전송 실패: {type(e).__name__}", file=sys.stderr)
        return 1
    print(f"{datetime.now(KST):%Y-%m-%d %H:%M} 보고 전송 완료")
    return 0


if __name__ == "__main__":
    sys.exit(main())
