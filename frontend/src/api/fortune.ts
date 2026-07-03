/**
 * 운세 API 클라이언트
 *
 * 백엔드 /api/fortune 엔드포인트를 호출한다.
 * 앱이 Claude API를 직접 호출하지 않는 이유:
 * - ANTHROPIC_API_KEY를 앱 번들에 포함하면 추출·남용·비용 폭탄 위험
 * - 하루 1회 캐시, 레이트 리밋은 백엔드에서 제어
 */

// Render 배포 URL — 개발/프로덕션 모두 동일하게 사용
// (에뮬레이터에서 localhost:8000은 호스트 PC를 가리키지 않으므로 Render URL 통일)
const API_BASE = "https://haru-bnsg.onrender.com";

// ── 응답 타입 ────────────────────────────────────────────────

export interface FortuneData {
  date: string;      // 기준 날짜 (예: "2025-06-16")
  sign: string;      // 별자리(영문) 또는 "general"
  content: string;   // 오늘의 운세 텍스트
  cached: boolean;   // 캐시된 응답 여부
}

// ── API 호출 ─────────────────────────────────────────────────

export async function fetchFortune(sign = "general"): Promise<FortuneData> {
  const url = `${API_BASE}/api/fortune?sign=${encodeURIComponent(sign)}`;

  const res = await fetch(url);

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as { detail?: string }).detail ?? `운세 조회 실패 (HTTP ${res.status})`);
  }

  return res.json() as Promise<FortuneData>;
}
