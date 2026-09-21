/**
 * 더보기 화면 — 오늘의 운세 + 오늘의 뉴스
 * 외부 API는 반드시 백엔드(/api/fortune, /api/news)를 경유한다.
 */

import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Linking, RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";

import { Colors, cardShadow } from "@/constants/theme";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { fetchNews, type NewsItem } from "@/src/api/news";

// ── 섹션별 오류 카드 ──────────────────────────────────────────
// 컴포넌트를 MoreScreen 밖에 정의해야 매 렌더마다 새 타입이 생성되는 React 안티패턴을 피할 수 있다.

function SectionError({
  message, onRetry, colors,
}: {
  message: string;
  onRetry: () => void;
  colors: typeof Colors.light;
}) {
  return (
    <View style={[styles.sectionError, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
      <Text style={[styles.sectionErrorText, { color: colors.subtext }]}>{message}</Text>
      <TouchableOpacity onPress={onRetry}>
        <Text style={[styles.retryLink, { color: colors.tint }]}>다시 시도</Text>
      </TouchableOpacity>
    </View>
  );
}


// ── 유틸 ─────────────────────────────────────────────────────

/**
 * 뉴스 발행일 포맷팅 — Naver API는 RFC 2822 형식("Mon, 15 Jun 2025 14:30:00 +0900")을 반환한다.
 * Date 파싱 후 "6월 15일 14:30" 형식으로 변환한다. 파싱 실패 시 원문 그대로 반환.
 */
function formatPubDate(s: string): string {
  try {
    const d = new Date(s);
    if (isNaN(d.getTime())) return s;
    return `${d.getMonth() + 1}월 ${d.getDate()}일 ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  } catch {
    return s;
  }
}

// ── 뉴스 카드 ────────────────────────────────────────────────

function NewsCard({ item, colors, onPress }: { item: NewsItem; colors: typeof Colors.light; onPress: () => void }) {
  return (
    <TouchableOpacity
      style={[styles.newsCard, { borderBottomColor: colors.separator }]}
      onPress={onPress}
      activeOpacity={0.6}
    >
      <Text style={[styles.newsTitle, { color: colors.text }]} numberOfLines={2}>{item.title}</Text>
      {item.summary ? (
        <Text style={[styles.newsSummary, { color: colors.subtext }]} numberOfLines={2}>{item.summary}</Text>
      ) : null}
      {item.pub_date ? (
        <Text style={[styles.newsPubDate, { color: colors.subtext }]}>{formatPubDate(item.pub_date)}</Text>
      ) : null}
    </TouchableOpacity>
  );
}

// ── 메인 화면 ────────────────────────────────────────────────

export default function MoreScreen() {
  const scheme = useColorScheme();
  const colors = Colors[scheme];

  const [news, setNews] = useState<NewsItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [newsError, setNewsError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setNewsError(null);
    const [newsResult] = await Promise.allSettled([fetchNews("오늘 뉴스", 10)]);

    if (newsResult.status === "fulfilled") {
      setNews(newsResult.value.items);
    } else {
      setNewsError(newsResult.reason instanceof Error ? newsResult.reason.message : "뉴스를 불러오지 못했습니다.");
    }

    setLoading(false);
    setRefreshing(false);
  }, []);

  useEffect(() => { load(); }, [load]);
  const onRefresh = useCallback(() => { setRefreshing(true); load(); }, [load]);

  if (loading) {
    return (
      <View style={[styles.centered, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.tint} />
        <Text style={[styles.statusText, { color: colors.subtext }]}>운세와 뉴스를 불러오는 중...</Text>
      </View>
    );
  }

  return (
    <ScrollView
      style={{ backgroundColor: colors.background }}
      contentContainerStyle={styles.container}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.tint} />}
    >
      <Text style={[styles.screenTitle, { color: colors.text }]}>더보기</Text>

      {/* 운세는 운세 탭으로 이전됨 */}

      {/* 뉴스 */}
      <Text style={[styles.sectionLabel, { color: colors.subtext }]}>오늘의 뉴스 📰</Text>
      {newsError
        ? <SectionError message={newsError} onRetry={load} colors={colors} />
        : (
          <View style={[styles.newsList, { backgroundColor: colors.card, borderColor: colors.cardBorder }, cardShadow]}>
            {news.length === 0
              ? <Text style={[styles.newsEmpty, { color: colors.subtext }]}>뉴스를 가져오지 못했습니다.</Text>
              : news.map((item, idx) => (
                <NewsCard
                  key={idx}
                  item={item}
                  colors={colors}
                  onPress={() => Linking.openURL(item.link).catch(() => {})}
                />
              ))
            }
          </View>
        )
      }
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  centered: { flex: 1, justifyContent: "center", alignItems: "center", gap: 12, padding: 24 },
  statusText: { fontSize: 14 },
  container: { padding: 24, paddingTop: 64, gap: 8 },
  screenTitle: { fontSize: 28, fontWeight: "700", letterSpacing: -0.5, marginBottom: 12 },
  sectionLabel: {
    fontSize: 12,
    fontWeight: "600",
    letterSpacing: 0.8,
    textTransform: "uppercase",
    marginTop: 8,
    marginBottom: 8,
  },
  // ── 운세 카드 ──────────────────────────────────────────────
  fortuneCard: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 22,
    gap: 10,
    marginBottom: 8,
  },
  fortuneContent: { fontSize: 15, lineHeight: 26 },
  fortuneMeta: { fontSize: 12 },
  // ── 뉴스 ──────────────────────────────────────────────────
  newsList: {
    borderRadius: 16,
    borderWidth: 1,
    overflow: "hidden",
  },
  newsCard: {
    padding: 16,
    gap: 5,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  newsEmpty: { fontSize: 13, padding: 16, textAlign: "center" },
  newsTitle: { fontSize: 14, fontWeight: "600", lineHeight: 20 },
  newsSummary: { fontSize: 12, lineHeight: 18 },
  newsPubDate: { fontSize: 11, lineHeight: 16, marginTop: 2 },
  // ── 섹션별 오류 ───────────────────────────────────────────
  sectionError: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 16,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  sectionErrorText: { fontSize: 13, flex: 1 },
  retryLink: { fontSize: 13, fontWeight: "600", marginLeft: 8 },
});
