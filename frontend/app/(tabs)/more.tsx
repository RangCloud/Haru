/**
 * 더보기 화면 — 오늘의 운세 + 오늘의 뉴스
 * 외부 API는 반드시 백엔드(/api/fortune, /api/news)를 경유한다.
 */

import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Linking, RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";

import { Colors, cardShadow } from "@/constants/theme";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { fetchFortune, type FortuneData } from "@/src/api/fortune";
import { fetchNews, type NewsItem } from "@/src/api/news";

// ── 운세 카드 ────────────────────────────────────────────────

function FortuneCard({ data, colors }: { data: FortuneData; colors: typeof Colors.light }) {
  return (
    <View style={[styles.fortuneCard, { backgroundColor: colors.tintLight, borderColor: colors.cardBorder }, cardShadow]}>
      <Text style={[styles.fortuneContent, { color: colors.text }]}>{data.content}</Text>
      <Text style={[styles.fortuneMeta, { color: colors.subtext }]}>{data.date} 기준</Text>
    </View>
  );
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
    </TouchableOpacity>
  );
}

// ── 메인 화면 ────────────────────────────────────────────────

export default function MoreScreen() {
  const scheme = useColorScheme();
  const colors = Colors[scheme];

  const [fortune, setFortune] = useState<FortuneData | null>(null);
  const [news, setNews] = useState<NewsItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [fortuneData, newsData] = await Promise.all([
        fetchFortune("general"),
        fetchNews("오늘 뉴스", 10),
      ]);
      setFortune(fortuneData);
      setNews(newsData.items);
    } catch (e) {
      setError(e instanceof Error ? e.message : "데이터를 불러오지 못했습니다.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
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

  if (error) {
    return (
      <View style={[styles.centered, { backgroundColor: colors.background }]}>
        <Text style={styles.errorEmoji}>⚠️</Text>
        <Text style={[styles.errorText, { color: colors.text }]}>{error}</Text>
        <TouchableOpacity onPress={load} style={[styles.retryBtn, { backgroundColor: colors.tint }]}>
          <Text style={styles.retryBtnText}>다시 시도</Text>
        </TouchableOpacity>
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

      {/* 운세 */}
      <Text style={[styles.sectionLabel, { color: colors.subtext }]}>오늘의 운세 🔮</Text>
      {fortune && <FortuneCard data={fortune} colors={colors} />}

      {/* 뉴스 */}
      <Text style={[styles.sectionLabel, { color: colors.subtext }]}>오늘의 뉴스 📰</Text>
      <View style={[styles.newsList, { backgroundColor: colors.card, borderColor: colors.cardBorder }, cardShadow]}>
        {news.map((item, idx) => (
          <NewsCard
            key={idx}
            item={item}
            colors={colors}
            onPress={() => Linking.openURL(item.link).catch(() => {})}
          />
        ))}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  centered: { flex: 1, justifyContent: "center", alignItems: "center", gap: 12, padding: 24 },
  statusText: { fontSize: 14 },
  errorEmoji: { fontSize: 40 },
  errorText: { fontSize: 15, textAlign: "center", lineHeight: 24 },
  retryBtn: { marginTop: 8, paddingHorizontal: 28, paddingVertical: 12, borderRadius: 12 },
  retryBtnText: { color: "#fff", fontSize: 15, fontWeight: "600" },
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
  newsTitle: { fontSize: 14, fontWeight: "600", lineHeight: 20 },
  newsSummary: { fontSize: 12, lineHeight: 18 },
});
