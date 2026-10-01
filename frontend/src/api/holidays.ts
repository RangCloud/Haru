/**
 * 공휴일 API 클라이언트 — 백엔드 /api/holidays
 *
 * 공휴일 원본은 한국천문연구원 특일 정보 API이고, 키 보관·호출·캐싱은 백엔드가 맡는다.
 */

const API_BASE = "https://haru-api.duckdns.org";

export interface HolidayItem {
  date: string;   // YYYY-MM-DD
  name: string;   // 예: "추석", "대체공휴일(추석)"
}

export async function fetchHolidays(year: number): Promise<HolidayItem[]> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);
  try {
    const res = await fetch(`${API_BASE}/api/holidays?year=${year}`, { signal: controller.signal });
    if (!res.ok) throw new Error(`공휴일 조회 실패 (HTTP ${res.status})`);
    const data = (await res.json()) as { holidays?: HolidayItem[] };
    return data.holidays ?? [];
  } finally {
    clearTimeout(timeout);
  }
}
