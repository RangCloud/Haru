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

// 백엔드 app/schemas/news.py의 NewsCategory와 같은 목록이어야 한다 (다른 값은 422로 거절됨)
export type NewsCategory =
  | "all" | "politics" | "economy" | "society" | "it" | "culture" | "sports" | "entertainment";

export const NEWS_CATEGORIES: { value: NewsCategory; label: string }[] = [
  { value: "all", label: "전체" },
  { value: "politics", label: "정치" },
  { value: "economy", label: "경제" },
  { value: "society", label: "사회" },
  { value: "it", label: "IT·과학" },
  { value: "culture", label: "생활·문화" },
  { value: "sports", label: "스포츠" },
  { value: "entertainment", label: "연예" },
];

export interface NewsData {
  category: NewsCategory;
  keyword: string;
  total: number;
  items: NewsItem[];
}

// ── API 호출 ─────────────────────────────────────────────────

export async function fetchNews(
  category: NewsCategory = "all",
  display = 10,
): Promise<NewsData> {
  const url = `${API_BASE}/api/news?category=${category}&display=${display}`;

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
