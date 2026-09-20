/**
 * 날씨 API 클라이언트
 *
 * 백엔드 /api/weather 엔드포인트를 호출한다.
 * 앱이 기상청 API를 직접 호출하지 않고 반드시 백엔드를 경유하는 이유:
 * - API 키를 앱 번들에 포함시키면 추출·남용 위험이 있음
 * - 격자 좌표 변환, 응답 파싱, 캐싱은 백엔드에서 처리
 */

// Oracle Cloud 배포 URL
const API_BASE = "https://haru-api.duckdns.org";

// ── 응답 타입 ────────────────────────────────────────────────

export interface HourlyWeather {
  time: string;       // "14:00"
  temp: number;       // 기온 (°C)
  sky: string;        // "맑음" | "구름조금" | "구름많음" | "흐림"
  rain_type: string;  // "없음" | "비" | "비/눈" | "눈" | "소나기"
  humidity: number;   // 습도 (%)
  wind_speed: number; // 풍속 (m/s)
}

export interface WeatherData {
  nx: number;
  ny: number;
  base_date: string;      // "20250615"
  base_time: string;      // "1100"
  current: HourlyWeather;
  hourly: HourlyWeather[];
}

// ── API 호출 ─────────────────────────────────────────────────

export async function fetchWeather(lat: number, lon: number): Promise<WeatherData> {
  const url = `${API_BASE}/api/weather?lat=${lat}&lon=${lon}`;

  // 10초 초과 시 요청 취소 — 기상청 API가 느릴 때 화면이 무한 로딩되는 현상 방지
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);

  try {
    const res = await fetch(url, { signal: controller.signal });

    if (!res.ok) {
      // 백엔드가 반환한 detail 메시지를 그대로 노출
      const body = await res.json().catch(() => ({}));
      throw new Error(body.detail ?? `날씨 조회 실패 (HTTP ${res.status})`);
    }

    return res.json() as Promise<WeatherData>;
  } catch (e) {
    if ((e as Error).name === "AbortError") throw new Error("날씨 요청 시간이 초과됐습니다.");
    throw e;
  } finally {
    clearTimeout(timeout);
  }
}
