/**
 * 운세 API 클라이언트
 *
 * 백엔드 /api/fortune 엔드포인트를 호출한다.
 * 앱이 Claude API를 직접 호출하지 않는 이유:
 * - ANTHROPIC_API_KEY를 앱 번들에 포함하면 추출·남용·비용 폭탄 위험
 * - 하루 1회 캐시, 레이트 리밋은 백엔드에서 제어
 */

const API_BASE = __DEV__ ? "http://localhost:8000" : "https://api.haru-app.com";

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
