"""
기상청 격자 좌표 변환 모듈

기상청 단기예보 API는 WGS84 위경도(lat/lon)가 아닌
'람베르트 정형 원통 투영(Lambert Conformal Conic)' 기반의
5km 격자 좌표(nx, ny)를 요구한다.

이 모듈은 기상청이 공식 배포한 변환 공식을 Python으로 구현한다.
참고: https://www.kma.go.kr/파일/기상청_단기예보_격자.pdf
"""

import math
from dataclasses import dataclass


# ──────────────────────────────────────────────────────────────
# 기상청 격자 변환에 사용되는 상수 (변경 금지)
# ──────────────────────────────────────────────────────────────
RE = 6371.00877    # 지구 반경 (km)
GRID = 5.0         # 격자 간격 (km)
SLAT1 = 30.0       # 투영 면의 표준 위도 1 (°)
SLAT2 = 60.0       # 투영 면의 표준 위도 2 (°)
OLON = 126.0       # 기준점 경도 (°) — 한반도 중앙
OLAT = 38.0        # 기준점 위도 (°)
XO = 43.0          # 기준점 X 격자 좌표
YO = 136.0         # 기준점 Y 격자 좌표

DEGRAD = math.pi / 180.0   # 도(°) → 라디안 변환 계수
RADDEG = 180.0 / math.pi   # 라디안 → 도(°) 변환 계수


@dataclass(frozen=True)
class GridXY:
    """기상청 격자 좌표"""
    nx: int
    ny: int


@dataclass(frozen=True)
class LatLon:
    """WGS84 위경도 좌표"""
    lat: float
    lon: float


def latlon_to_grid(lat: float, lon: float) -> GridXY:
    """
    WGS84 위경도 → 기상청 격자(nx, ny) 변환

    Args:
        lat: 위도 (예: 37.5665, 서울시청 기준)
        lon: 경도 (예: 126.9780)

    Returns:
        GridXY(nx, ny) — 기상청 단기예보 API 요청에 사용
    """
    # 람베르트 투영 상수 계산
    re = RE / GRID
    slat1 = SLAT1 * DEGRAD
    slat2 = SLAT2 * DEGRAD
    olon = OLON * DEGRAD
    olat = OLAT * DEGRAD

    sn = math.tan(math.pi * 0.25 + slat2 * 0.5) / math.tan(math.pi * 0.25 + slat1 * 0.5)
    sn = math.log(math.cos(slat1) / math.cos(slat2)) / math.log(sn)

    sf = math.tan(math.pi * 0.25 + slat1 * 0.5)
    sf = (sf ** sn) * math.cos(slat1) / sn

    ro = math.tan(math.pi * 0.25 + olat * 0.5)
    ro = re * sf / (ro ** sn)

    # 입력 좌표 변환
    ra = math.tan(math.pi * 0.25 + lat * DEGRAD * 0.5)
    ra = re * sf / (ra ** sn)

    theta = lon * DEGRAD - olon
    # 경도 차이를 -π ~ π 범위로 정규화
    if theta > math.pi:
        theta -= 2.0 * math.pi
    if theta < -math.pi:
        theta += 2.0 * math.pi
    theta *= sn

    nx = int(ra * math.sin(theta) + XO + 0.5)
    ny = int(ro - ra * math.cos(theta) + YO + 0.5)

    return GridXY(nx=nx, ny=ny)


def grid_to_latlon(nx: int, ny: int) -> LatLon:
    """
    기상청 격자(nx, ny) → WGS84 위경도 역변환

    단위 테스트 및 디버깅용. 앱에서는 주로 latlon_to_grid만 사용.
    """
    re = RE / GRID
    slat1 = SLAT1 * DEGRAD
    slat2 = SLAT2 * DEGRAD
    olon = OLON * DEGRAD
    olat = OLAT * DEGRAD

    sn = math.tan(math.pi * 0.25 + slat2 * 0.5) / math.tan(math.pi * 0.25 + slat1 * 0.5)
    sn = math.log(math.cos(slat1) / math.cos(slat2)) / math.log(sn)

    sf = math.tan(math.pi * 0.25 + slat1 * 0.5)
    sf = (sf ** sn) * math.cos(slat1) / sn

    ro = math.tan(math.pi * 0.25 + olat * 0.5)
    ro = re * sf / (ro ** sn)

    xn = nx - XO
    yn = ro - (ny - YO)
    ra = math.sqrt(xn * xn + yn * yn)
    if sn < 0.0:
        ra = -ra

    alat = (re * sf / ra) ** (1.0 / sn)
    alat = 2.0 * math.atan(alat) - math.pi * 0.5

    if abs(xn) <= 0.0:
        theta = 0.0
    else:
        if abs(yn) <= 0.0:
            theta = math.pi * 0.5
            if xn < 0.0:
                theta = -theta
        else:
            theta = math.atan2(xn, yn)

    alon = theta / sn + olon

    return LatLon(
        lat=alat * RADDEG,
        lon=alon * RADDEG,
    )
