/**
 * 운세 API 클라이언트
 *
 * 백엔드 /api/fortune 엔드포인트를 호출한다.
 * 앱이 Claude API를 직접 호출하지 않는 이유:
 * - ANTHROPIC_API_KEY를 앱 번들에 포함하면 추출·남용·비용 폭탄 위험
 * - 하루 1회 캐시, 레이트 리밋은 백엔드에서 제어
 */

// Oracle Cloud 배포 URL
const API_BASE = "https://haru-api.duckdns.org";

// ── 응답 타입 ────────────────────────────────────────────────

export interface FortuneData {
  date: string;      // 기준 날짜 (예: "2025-06-16")
  sign: string;      // "personal" (생년월일 기반) 또는 "general"
  content: string;   // 오늘의 운세 텍스트
  cached: boolean;   // 캐시된 응답 여부
}

// ── 요청 파라미터 타입 ────────────────────────────────────────

export interface FortuneFetchParams {
  birthYear: number;
  birthMonth: number;
  birthMonthType: "solar" | "lunar"; // 양력/음력
  birthDay: number;
  birthHour?: number; // 모르면 undefined
}

// ── API 호출 ─────────────────────────────────────────────────

export async function fetchFortune(params: FortuneFetchParams): Promise<FortuneData> {
  const query = new URLSearchParams({
    birth_year: String(params.birthYear),
    birth_month: String(params.birthMonth),
    birth_month_type: params.birthMonthType,
    birth_day: String(params.birthDay),
    ...(params.birthHour !== undefined ? { birth_hour: String(params.birthHour) } : {}),
  });

  const url = `${API_BASE}/api/fortune?${query.toString()}`;

  // 15초 초과 시 취소 — Claude API 응답이 느릴 때 대비 (캐시 미스 시 생성 시간 고려)
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);

  try {
    const res = await fetch(url, { signal: controller.signal });

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error((body as { detail?: string }).detail ?? `운세 조회 실패 (HTTP ${res.status})`);
    }

    return res.json() as Promise<FortuneData>;
  } catch (e) {
    if ((e as Error).name === "AbortError") throw new Error("운세 요청 시간이 초과됐습니다.");
    throw e;
  } finally {
    clearTimeout(timeout);
  }
}
