/**
 * 위경도 → 기상청 단기예보 격자(nx, ny) 변환 — 기기 안에서만 계산한다
 *
 * 왜 서버가 아니라 앱에서 계산하나 (CLAUDE.md는 순수 계산을 backend/app/core/에 두지만 여기만 예외):
 * - 위치정보법: 개인위치정보를 사용자 기기 안에서만 쓰고 사업자 서버로 보내지 않으면
 *   위치기반서비스사업 신고 대상에서 빠진다 (위치정보지원센터 lbsc.kr 안내).
 * - 그래서 위도·경도는 폰 밖으로 내보내지 않고, 5km 격자 번호만 서버로 보낸다.
 * - 기상청 예보 자체가 격자 단위라, 격자만 보내도 날씨 정확도는 그대로다.
 *
 * 공식은 backend/app/core/coordinates.py의 latlon_to_grid와 같다 (기상청 배포 람베르트 정각원추 투영).
 * 두 곳의 상수·계산 순서를 바꾸면 결과가 달라지므로 함께 고친다.
 */

// ── 기상청 격자 변환 상수 (변경 금지) ─────────────────────────
const RE = 6371.00877; // 지구 반경 (km)
const GRID = 5.0;      // 격자 간격 (km)
const SLAT1 = 30.0;    // 투영 표준 위도 1 (°)
const SLAT2 = 60.0;    // 투영 표준 위도 2 (°)
const OLON = 126.0;    // 기준점 경도 (°)
const OLAT = 38.0;     // 기준점 위도 (°)
const XO = 43;         // 기준점 X 격자
const YO = 136;        // 기준점 Y 격자
const DEGRAD = Math.PI / 180.0;

export interface KmaGrid {
  nx: number;
  ny: number;
}

// 위치를 못 쓸 때(권한 거부·GPS 시간 초과) 쓰는 서울시청 격자 — latlonToGrid(37.5665, 126.978) 결과
export const SEOUL_GRID: KmaGrid = { nx: 60, ny: 127 };

export function latlonToGrid(lat: number, lon: number): KmaGrid {
  // 1) 투영 상수 — 입력과 무관한 값이지만 서버 코드와 한 줄씩 대조하기 쉽도록 같은 순서로 둔다
  const re = RE / GRID;
  const slat1 = SLAT1 * DEGRAD;
  const slat2 = SLAT2 * DEGRAD;
  const olon = OLON * DEGRAD;
  const olat = OLAT * DEGRAD;

  let sn = Math.tan(Math.PI * 0.25 + slat2 * 0.5) / Math.tan(Math.PI * 0.25 + slat1 * 0.5);
  sn = Math.log(Math.cos(slat1) / Math.cos(slat2)) / Math.log(sn);
  let sf = Math.tan(Math.PI * 0.25 + slat1 * 0.5);
  sf = (Math.pow(sf, sn) * Math.cos(slat1)) / sn;
  let ro = Math.tan(Math.PI * 0.25 + olat * 0.5);
  ro = (re * sf) / Math.pow(ro, sn);

  // 2) 입력 좌표를 투영면 위 거리(ra)와 각도(theta)로 바꾼다
  let ra = Math.tan(Math.PI * 0.25 + lat * DEGRAD * 0.5);
  ra = (re * sf) / Math.pow(ra, sn);
  let theta = lon * DEGRAD - olon;
  // 경도 차이를 -π ~ π로 정규화
  if (theta > Math.PI) theta -= 2.0 * Math.PI;
  if (theta < -Math.PI) theta += 2.0 * Math.PI;
  theta *= sn;

  // 3) 격자 번호 — 파이썬 int(x + 0.5)와 같게 반올림한다 (한반도 범위에서는 값이 항상 양수라 Math.floor와 같다)
  return {
    nx: Math.floor(ra * Math.sin(theta) + XO + 0.5),
    ny: Math.floor(ro - ra * Math.cos(theta) + YO + 0.5),
  };
}
