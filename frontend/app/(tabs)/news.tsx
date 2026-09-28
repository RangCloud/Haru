/**
 * 뉴스 탭 — 카테고리별 뉴스 (피드백 19번: 카테고리 필터 + 새로고침)
 * 외부 API는 반드시 백엔드(/api/news)를 경유한다.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, Linking, RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { IconSymbol } from "@/components/ui/icon-symbol";
import { Colors, cardShadow } from "@/constants/theme";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { fetchNews, NEWS_CATEGORIES, type NewsCategory, type NewsItem } from "@/src/api/news";

// ── 섹션 오류 카드 ─────────────────────────────────────────────
// 컴포넌트를 화면 바깥에 정의해야 매 렌더마다 unmount/remount 되는 React 안티패턴을 피한다.

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

// ── 메인 화면 ─────────────────────────────────────────────────

type CategoryState = { items: NewsItem[]; error: string | null; fetchedAt: number };

export default function NewsScreen() {
  const scheme = useColorScheme();
  const colors = Colors[scheme];
  const insets = useSafeAreaInsets();

  const [category, setCategory] = useState<NewsCategory>("all");
  // 카테고리별로 받아 둔 결과 — 칩을 다시 누르면 기다림 없이 바로 보여준다
  const [byCategory, setByCategory] = useState<Partial<Record<NewsCategory, CategoryState>>>({});
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  // 칩을 빠르게 바꿨을 때 늦게 도착한 이전 요청이 현재 목록을 덮어쓰지 않게 요청 번호로 구분한다
  const requestIdRef = useRef(0);

  const load = useCallback(async (cat: NewsCategory) => {
    const requestId = ++requestIdRef.current;
    setLoading(true);
    try {
      const result = await fetchNews(cat, 10);
      setByCategory((prev) => ({ ...prev, [cat]: { items: result.items, error: null, fetchedAt: Date.now() } }));
    } catch (e) {
      const message = e instanceof Error ? e.message : "뉴스를 불러오지 못했습니다.";
      setByCategory((prev) => ({ ...prev, [cat]: { items: prev[cat]?.items ?? [], error: message, fetchedAt: Date.now() } }));
    } finally {
      if (requestId === requestIdRef.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, []);

  // 카테고리를 처음 열 때만 불러온다 (이미 받은 카테고리는 새로고침 버튼으로 갱신)
  useEffect(() => {
    if (!byCategory[category]) load(category);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [category]);

  const onRefresh = useCallback(() => { setRefreshing(true); load(category); }, [category, load]);

  const current = byCategory[category];
  const showSpinner = !current && loading;

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      {/* 제목 + 새로고침 버튼 (상단 안전 영역 반영, 피드백 1번) */}
      <View style={[styles.header, { paddingTop: insets.top + 16 }]}>
        <Text style={[styles.screenTitle, { color: colors.text }]}>뉴스 📰</Text>
        <TouchableOpacity
          onPress={onRefresh}
          disabled={loading}
          style={[styles.refreshBtn, { backgroundColor: colors.tintLight, opacity: loading ? 0.5 : 1 }]}
          accessibilityLabel="뉴스 새로고침"
        >
          {loading && !showSpinner
            ? <ActivityIndicator size="small" color={colors.tint} />
            : <IconSymbol name="arrow.clockwise" size={18} color={colors.tint} />}
        </TouchableOpacity>
      </View>

      {/* 카테고리 칩 (피드백 19번) */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.chipScroll}
        contentContainerStyle={styles.chips}
      >
        {NEWS_CATEGORIES.map((c) => {
          const selected = c.value === category;
          return (
            <TouchableOpacity
              key={c.value}
              onPress={() => setCategory(c.value)}
              style={[styles.chip, { borderColor: selected ? colors.tint : colors.cardBorder, backgroundColor: selected ? colors.tint : colors.card }]}
              accessibilityState={{ selected }}
            >
              <Text style={[styles.chipText, { color: selected ? "#fff" : colors.subtext }]}>{c.label}</Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      <ScrollView
        contentContainerStyle={styles.container}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.tint} />}
      >
        {showSpinner ? (
          <View style={styles.centered}>
            <ActivityIndicator size="large" color={colors.tint} />
            <Text style={[styles.statusText, { color: colors.subtext }]}>뉴스를 불러오는 중...</Text>
          </View>
        ) : current?.error && current.items.length === 0 ? (
          <SectionError message={current.error} onRetry={() => load(category)} colors={colors} />
        ) : (
          <View style={[styles.newsList, { backgroundColor: colors.card, borderColor: colors.cardBorder }, cardShadow]}>
            {!current || current.items.length === 0
              ? <Text style={[styles.newsEmpty, { color: colors.subtext }]}>뉴스를 가져오지 못했습니다.</Text>
              : current.items.map((item) => (
                <NewsCard
                  key={item.link}
                  item={item}
                  colors={colors}
                  onPress={() => Linking.openURL(item.link).catch(() => {})}
                />
              ))
            }
          </View>
        )}
        {current?.fetchedAt ? (
          <Text style={[styles.updatedAt, { color: colors.subtext }]}>
            {formatUpdatedAt(current.fetchedAt)} 업데이트 · 아래로 당기거나 ↻ 버튼으로 새로고침
          </Text>
        ) : null}
      </ScrollView>
    </View>
  );
}

/** 마지막으로 받은 시각 — 'HH:MM' */
function formatUpdatedAt(ms: number): string {
  const d = new Date(ms);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 24, paddingBottom: 12 },
  refreshBtn: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  chipScroll: { flexGrow: 0 },
  chips: { paddingHorizontal: 24, gap: 8, paddingBottom: 12 },
  chip: { borderWidth: 1, borderRadius: 18, paddingHorizontal: 14, paddingVertical: 7 },
  chipText: { fontSize: 13, fontWeight: "600" },
  centered: { justifyContent: "center", alignItems: "center", gap: 12, paddingVertical: 48 },
  statusText: { fontSize: 14 },
  container: { paddingHorizontal: 24, paddingBottom: 32, gap: 8 },
  screenTitle: { fontSize: 28, fontWeight: "700", letterSpacing: -0.5 },
  updatedAt: { fontSize: 11, textAlign: "center", marginTop: 4 },
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
  // ── 섹션 오류 ─────────────────────────────────────────────
  sectionError: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 16,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  sectionErrorText: { fontSize: 13, flex: 1 },
  retryLink: { fontSize: 13, fontWeight: "600", marginLeft: 8 },
});
