/**
 * 뉴스 API 클라이언트
 *
 * 백엔드 /api/news 엔드포인트를 호출한다.
 * 앱이 네이버 뉴스 API를 직접 호출하지 않는 이유:
 * - API 키(Client-Id/Secret)를 앱 번들에 포함하면 노출·남용 위험이 있음
 * - HTML 태그 제거, 저작권 준수(본문 제외) 처리는 백엔드에서 담당
 */

// Oracle Cloud 배포 URL
const API_BASE = "https://haru-api.duckdns.org";

// ── 응답 타입 ────────────────────────────────────────────────

export interface NewsItem {
  title: string;      // 뉴스 헤드라인 (HTML 태그 제거됨)
  summary: string;    // 뉴스 요약 (본문 복제 아님, 네이버 API description)
  link: string;       // 원본 기사 URL (외부 브라우저로 열도록 유도)
  pub_date: string;   // 발행일 문자열
}

export interface NewsData {
  keyword: string;
  total: number;
  items: NewsItem[];
}

// ── API 호출 ─────────────────────────────────────────────────

export async function fetchNews(
  keyword = "오늘 뉴스",
  display = 10,
): Promise<NewsData> {
  const url = `${API_BASE}/api/news?keyword=${encodeURIComponent(keyword)}&display=${display}`;

  // 10초 초과 시 취소 — 네이버 API 지연 시 뉴스 카드가 무한 로딩되는 현상 방지
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);

  try {
    const res = await fetch(url, { signal: controller.signal });

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error((body as { detail?: string }).detail ?? `뉴스 조회 실패 (HTTP ${res.status})`);
    }

    return res.json() as Promise<NewsData>;
  } catch (e) {
    if ((e as Error).name === "AbortError") throw new Error("뉴스 요청 시간이 초과됐습니다.");
    throw e;
  } finally {
    clearTimeout(timeout);
  }
}
