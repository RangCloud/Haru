/**
 * 일정 색상 목록
 *
 * 일정 추가 화면의 색 선택과 기기 캘린더 가져오기(가까운 색 찾기)가 같은 목록을 써야 해서 한곳에 둔다.
 */

export const SCHEDULE_COLORS = [
  "#6B6EE7", // 인디고 (기본)
  "#3B82F6", // 파랑
  "#0EA5E9", // 하늘
  "#10B981", // 초록
  "#F59E0B", // 노랑
  "#F97316", // 주황
  "#EF4444", // 빨강
  "#EC4899", // 분홍
];

/** '#RRGGBB' 또는 '#AARRGGBB' → [r, g, b]. 형식이 다르면 null */
function toRgb(hex: string): [number, number, number] | null {
  const m = /^#?([0-9a-f]{6}|[0-9a-f]{8})$/i.exec(hex.trim());
  if (!m) return null;
  // Android 캘린더 색은 앞에 투명도가 붙은 8자리일 수 있다 — 뒤 6자리가 색이다
  const rgb = m[1].slice(-6);
  return [parseInt(rgb.slice(0, 2), 16), parseInt(rgb.slice(2, 4), 16), parseInt(rgb.slice(4, 6), 16)];
}

/**
 * 임의의 색을 하루의 일정 색 중 가장 가까운 것으로 바꾼다.
 * 기기 캘린더는 캘린더마다 제각각인 색을 쓰지만, 하루는 색마다 이름을 붙여 쓰므로 정해진 색 안에서만 고른다.
 * 색 형식을 읽을 수 없으면 기본색(인디고)을 돌려준다.
 */
export function nearestScheduleColor(hex: string | null | undefined): string {
  const target = hex ? toRgb(hex) : null;
  if (!target) return SCHEDULE_COLORS[0];

  let best = SCHEDULE_COLORS[0];
  let bestDistance = Infinity;
  for (const candidate of SCHEDULE_COLORS) {
    const c = toRgb(candidate);
    if (!c) continue;
    // RGB 거리 제곱 — 가장 가까운 것만 고르면 되므로 제곱근은 필요 없다
    const d = (c[0] - target[0]) ** 2 + (c[1] - target[1]) ** 2 + (c[2] - target[2]) ** 2;
    if (d < bestDistance) {
      bestDistance = d;
      best = candidate;
    }
  }
  return best;
}
