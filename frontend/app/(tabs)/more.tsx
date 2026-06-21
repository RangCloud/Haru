/**
 * 더보기 화면 — 오늘의 운세 + 오늘의 뉴스
 *
 * 운세: 상단 카드, 하루 1회 Claude API 호출 (백엔드 캐시)
 * 뉴스: 스크롤 가능한 카드 리스트, 헤드라인·요약·링크만 표시 (저작권 준수)
 *
 * 아키텍처 원칙: 외부 API(Claude, 네이버)는 절대 앱에서 직접 호출하지 않는다.
 * 반드시 백엔드(/api/fortune, /api/news)를 경유한다.
 */

import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Linking,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

import { Colors } from "@/constants/theme";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { fetchFortune, type FortuneData } from "@/src/api/fortune";
import { fetchNews, type NewsItem } from "@/src/api/news";

// ── 운세 카드 ────────────────────────────────────────────────

interface FortuneCardProps {
  data: FortuneData;
  colors: (typeof Colors)["light"];
}

function FortuneCard({ data, colors }: FortuneCardProps) {
  return (
    <View style={[styles.fortuneCard, { backgroundColor: colors.tint + "18" }]}>
      <Text style={[styles.fortuneContent, { color: colors.text }]}>
        {data.content}
      </Text>
      <Text style={[styles.fortuneMeta, { color: colors.icon }]}>
        {data.date} 기준
      </Text>
    </View>
  );
}

// ── 뉴스 카드 ────────────────────────────────────────────────

interface NewsCardProps {
  item: NewsItem;
  colors: (typeof Colors)["light"];
  onPress: () => void;
}

function NewsCard({ item, colors, onPress }: NewsCardProps) {
  return (
    <TouchableOpacity
      style={[styles.newsCard, { borderBottomColor: colors.icon + "30" }]}
      onPress={onPress}
      activeOpacity={0.6}
    >
      <Text style={[styles.newsTitle, { color: colors.text }]} numberOfLines={2}>
        {item.title}
      </Text>
      {item.summary ? (
        <Text style={[styles.newsSummary, { color: colors.icon }]} numberOfLines={2}>
          {item.summary}
        </Text>
      ) : null}
    </TouchableOpacity>
  );
}

// ── 메인 화면 ────────────────────────────────────────────────

export default function MoreScreen() {
  const colors = Colors[useColorScheme() ?? "light"];

  const [fortune, setFortune] = useState<FortuneData | null>(null);
  const [news, setNews] = useState<NewsItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      // 운세와 뉴스를 병렬 호출 — 둘 다 백엔드 경유, 서로 의존 없음
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

  useEffect(() => {
    load();
  }, [load]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    load();
  }, [load]);

  // 뉴스 링크를 외부 브라우저로 열기
  const openLink = (url: string) => {
    Linking.openURL(url).catch(() => {});
  };

  // ── 로딩 상태 ─────────────────────────────────────────────
  if (loading) {
    return (
      <View style={[styles.centered, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.tint} />
        <Text style={[styles.loadingText, { color: colors.icon }]}>
          운세와 뉴스를 불러오는 중...
        </Text>
      </View>
    );
  }

  // ── 에러 상태 ─────────────────────────────────────────────
  if (error) {
    return (
      <View style={[styles.centered, { backgroundColor: colors.background }]}>
        <Text style={styles.errorIcon}>⚠️</Text>
        <Text style={[styles.errorText, { color: colors.text }]}>{error}</Text>
        <TouchableOpacity
          onPress={load}
          style={[styles.retryBtn, { borderColor: colors.tint }]}
        >
          <Text style={[styles.retryText, { color: colors.tint }]}>다시 시도</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // ── 정상 렌더 ─────────────────────────────────────────────
  return (
    <ScrollView
      style={{ backgroundColor: colors.background }}
      contentContainerStyle={styles.container}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={onRefresh}
          tintColor={colors.tint}
        />
      }
    >
      <Text style={[styles.screenTitle, { color: colors.text }]}>더보기</Text>

      {/* 오늘의 운세 섹션 */}
      <Text style={[styles.sectionTitle, { color: colors.text }]}>🔮 오늘의 운세</Text>
      {fortune && <FortuneCard data={fortune} colors={colors} />}

      {/* 오늘의 뉴스 섹션 */}
      <Text style={[styles.sectionTitle, { color: colors.text }]}>📰 오늘의 뉴스</Text>
      <View style={[styles.newsList, { borderColor: colors.icon + "30" }]}>
        {news.map((item, idx) => (
          <NewsCard
            key={idx}
            item={item}
            colors={colors}
            onPress={() => openLink(item.link)}
          />
        ))}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  centered: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    gap: 12,
    padding: 24,
  },
  loadingText: {
    fontSize: 14,
  },
  errorIcon: {
    fontSize: 40,
  },
  errorText: {
    fontSize: 15,
    textAlign: "center",
    lineHeight: 24,
  },
  retryBtn: {
    marginTop: 8,
    paddingHorizontal: 24,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
  },
  retryText: {
    fontSize: 15,
    fontWeight: "500",
  },
  container: {
    padding: 24,
    paddingTop: 64,
    gap: 12,
  },
  screenTitle: {
    fontSize: 28,
    fontWeight: "700",
    marginBottom: 8,
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: "600",
    marginTop: 8,
  },
  fortuneCard: {
    borderRadius: 16,
    padding: 20,
    gap: 10,
  },
  fortuneContent: {
    fontSize: 15,
    lineHeight: 24,
  },
  fortuneMeta: {
    fontSize: 12,
  },
  newsList: {
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: "hidden",
  },
  newsCard: {
    padding: 16,
    gap: 6,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  newsTitle: {
    fontSize: 14,
    fontWeight: "600",
    lineHeight: 20,
  },
  newsSummary: {
    fontSize: 12,
    lineHeight: 18,
  },
});
