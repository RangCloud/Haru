/**
 * 뉴스 탭 — 카테고리별 뉴스 (피드백 19번: 카테고리 필터 + 새로고침)
 * 목록을 좌우로 밀면 이전·다음 카테고리로 넘어간다 (칩 순서대로, 달력과 같은 미끄러지는 전환).
 * 새로고침은 세 가지: 맨 위에서 아래로 당기기, 맨 아래에서 더 끌어올리기, ↻ 버튼.
 * 외부 API는 반드시 백엔드(/api/news)를 경유한다.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  Linking,
  RefreshControl,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  View,
  type GestureResponderEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { IconSymbol } from "@/components/ui/icon-symbol";
import { Colors, cardShadow } from "@/constants/theme";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { fetchNews, NEWS_CATEGORIES, type NewsCategory, type NewsItem } from "@/src/api/news";
import { Text } from "@/src/components/AppText";
import { NewsCategorySheet } from "@/src/components/NewsCategorySheet";
import { useSlideSwipe } from "@/src/hooks/useSlideSwipe";
import { useSettingsStore } from "@/src/store/settingsStore";

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

// 맨 아래에서 손가락을 이만큼 더 끌어올렸다 놓으면 새로고침한다 (살짝 건드린 것과 구분하기 위한 거리)
const BOTTOM_PULL_DISTANCE = 70;
// 목록 끝에서 이 정도 안쪽까지는 "맨 아래"로 본다 (소수점 오차 흡수)
const BOTTOM_TOLERANCE = 4;

type CategoryState = { items: NewsItem[]; error: string | null; fetchedAt: number };

export default function NewsScreen() {
  const scheme = useColorScheme();
  const colors = Colors[scheme];
  const insets = useSafeAreaInsets();

  // 사용자가 켜 둔 카테고리만, 정한 순서대로 칩에 보여준다 (수정 3번)
  const { newsCategories } = useSettingsStore();
  const [category, setCategory] = useState<NewsCategory>(newsCategories[0] ?? "all");
  const [editVisible, setEditVisible] = useState(false);
  // 카테고리별로 받아 둔 결과 — 칩을 다시 누르면 기다림 없이 바로 보여준다
  const [byCategory, setByCategory] = useState<Partial<Record<NewsCategory, CategoryState>>>({});
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  // 맨 아래에서 끌어올려 새로고침하는 중 — 목록 아래쪽에 진행 표시를 띄운다
  const [bottomRefreshing, setBottomRefreshing] = useState(false);
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
        setBottomRefreshing(false);
      }
    }
  }, []);

  // 보던 카테고리를 설정에서 끄면 첫 번째 카테고리로 옮긴다
  useEffect(() => {
    if (!newsCategories.includes(category)) setCategory(newsCategories[0]);
  }, [newsCategories, category]);

  // 카테고리를 처음 열 때만 불러온다 (이미 받은 카테고리는 새로고침 버튼으로 갱신)
  useEffect(() => {
    if (!byCategory[category]) load(category);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [category]);

  const onRefresh = useCallback(() => { setRefreshing(true); load(category); }, [category, load]);

  // ── 맨 아래에서 더 끌어올리면 새로고침 ──
  // 위에서 당기는 새로고침(RefreshControl)은 목록 맨 위에서만 동작한다. 뉴스를 끝까지 읽은 뒤에는
  // 다시 맨 위로 올라가야 해서, 맨 아래에서도 같은 손동작으로 새로 불러올 수 있게 한다.
  // Android는 목록 끝에서 더 스크롤되지 않아 스크롤 위치만으로는 "더 당김"을 알 수 없다.
  // 그래서 두 플랫폼 공통으로 "맨 아래에서 시작한 손가락이 위로 얼마나 움직였는가"로 판정한다.
  const scrollPos = useRef({ offsetY: 0, layoutHeight: 0, contentHeight: 0 });
  const pullStart = useRef<{ x: number; y: number; atBottom: boolean } | null>(null);

  // 내용이 화면보다 짧아 스크롤이 없는 경우도 "맨 아래"로 친다
  const isAtBottom = () => {
    const { offsetY, layoutHeight, contentHeight } = scrollPos.current;
    return layoutHeight > 0 && offsetY + layoutHeight >= contentHeight - BOTTOM_TOLERANCE;
  };

  const onListScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    scrollPos.current.offsetY = e.nativeEvent.contentOffset.y;
  };

  const onListTouchStart = (e: GestureResponderEvent) => {
    pullStart.current = { x: e.nativeEvent.pageX, y: e.nativeEvent.pageY, atBottom: isAtBottom() };
  };

  const onListTouchEnd = (e: GestureResponderEvent) => {
    const start = pullStart.current;
    pullStart.current = null;
    if (!start || !start.atBottom || loading) return;
    const up = start.y - e.nativeEvent.pageY;             // 양수 = 손가락을 위로 끌어올림
    const sideways = Math.abs(e.nativeEvent.pageX - start.x);
    // 좌우로 미는 카테고리 넘기기와 헷갈리지 않도록, 세로 움직임이 가로보다 뚜렷이 클 때만 인정한다
    if (up >= BOTTOM_PULL_DISTANCE && up > sideways * 1.5) {
      setBottomRefreshing(true);
      load(category);
    }
  };

  const current = byCategory[category];
  const showSpinner = !current && loading;

  // 칩에 보이는 순서 그대로의 카테고리 목록 — 스와이프의 이전·다음도 이 순서를 따른다
  const visibleCategories = useMemo(
    () => NEWS_CATEGORIES.filter((c) => newsCategories.includes(c.value))
      .sort((a, b) => newsCategories.indexOf(a.value) - newsCategories.indexOf(b.value)),
    [newsCategories],
  );
  const categoryIndex = Math.max(0, visibleCategories.findIndex((c) => c.value === category));

  // 좌우로 미는 동안에는 목록의 세로 스크롤을 잠근다 (밀다가 화면이 위아래로 움직이지 않게)
  const [swiping, setSwiping] = useState(false);
  const { panHandlers, slideStyle } = useSlideSwipe({
    pageIndex: categoryIndex,
    onSwipe: (direction) => {
      const next = visibleCategories[categoryIndex + direction];
      if (next) setCategory(next.value);
    },
    // 첫 카테고리에서 오른쪽, 마지막에서 왼쪽으로는 넘길 곳이 없다 — 살짝만 따라오다 돌아간다
    canSwipe: (direction) => categoryIndex + direction >= 0 && categoryIndex + direction < visibleCategories.length,
    onActiveChange: setSwiping,
  });

  // 스와이프로 카테고리가 바뀌면 선택된 칩이 화면 밖에 있을 수 있다 — 칩 줄을 그 칩 위치로 옮긴다
  const chipScrollRef = useRef<ScrollView>(null);
  const chipX = useRef<Partial<Record<NewsCategory, number>>>({});
  useEffect(() => {
    const x = chipX.current[category];
    if (x !== undefined) chipScrollRef.current?.scrollTo({ x: Math.max(0, x - 24), animated: true });
  }, [category]);

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      {/* 제목 + 필터 + 새로고침 (상단 안전 영역 반영) */}
      <View style={[styles.header, { paddingTop: insets.top + 16 }]}>
        <View style={styles.titleGroup}>
          <Text style={[styles.screenTitle, { color: colors.text }]}>뉴스 📰</Text>
          {/* 보고 싶은 카테고리 켜기·끄기와 순서 변경 */}
          <TouchableOpacity
            onPress={() => setEditVisible(true)}
            style={[styles.filterBtn, { borderColor: colors.tint }]}
            accessibilityLabel="뉴스 카테고리 필터"
          >
            <Text style={[styles.filterText, { color: colors.tint }]}>필터</Text>
          </TouchableOpacity>
        </View>
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
        ref={chipScrollRef}
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.chipScroll}
        contentContainerStyle={styles.chips}
      >
        {visibleCategories.map((c) => {
            const selected = c.value === category;
            return (
              <TouchableOpacity
                key={c.value}
                onPress={() => setCategory(c.value)}
                onLayout={(e) => { chipX.current[c.value] = e.nativeEvent.layout.x; }}
                style={[styles.chip, { borderColor: selected ? colors.tint : colors.cardBorder, backgroundColor: selected ? colors.tint : colors.card }]}
                accessibilityState={{ selected }}
              >
                <Text style={[styles.chipText, { color: selected ? "#fff" : colors.subtext }]}>{c.label}</Text>
              </TouchableOpacity>
            );
          })}
      </ScrollView>

      {/* 손가락은 움직이지 않는 바깥 틀이 받고, 목록 내용만 안쪽에서 미끄러진다 */}
      <View style={styles.list} {...panHandlers}>
      <ScrollView
        style={styles.list}
        contentContainerStyle={styles.container}
        scrollEnabled={!swiping}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.tint} />}
        onScroll={onListScroll}
        scrollEventThrottle={32}
        onLayout={(e) => { scrollPos.current.layoutHeight = e.nativeEvent.layout.height; }}
        onContentSizeChange={(_, height) => { scrollPos.current.contentHeight = height; }}
        onTouchStart={onListTouchStart}
        onTouchEnd={onListTouchEnd}
      >
        <Animated.View style={[styles.slide, slideStyle]}>
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
            {formatUpdatedAt(current.fetchedAt)} 업데이트 · 맨 위·맨 아래에서 당기거나 ↻ 버튼으로 새로고침
          </Text>
        ) : null}
        {bottomRefreshing && (
          <View style={styles.bottomRefresh}>
            <ActivityIndicator size="small" color={colors.tint} />
            <Text style={[styles.updatedAt, styles.bottomRefreshText, { color: colors.subtext }]}>새 뉴스를 불러오는 중…</Text>
          </View>
        )}
        {visibleCategories.length > 1 && (
          <Text style={[styles.updatedAt, { color: colors.subtext }]}>좌우로 밀면 다른 카테고리로 넘어가요</Text>
        )}
        </Animated.View>
      </ScrollView>
      </View>
      <NewsCategorySheet visible={editVisible} onClose={() => setEditVisible(false)} colors={colors} />
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
  // flexShrink 0: 기사가 많아도 칩 줄 높이가 줄어들어 글자가 잘리지 않게 한다
  chipScroll: { flexGrow: 0, flexShrink: 0 },
  list: { flex: 1 },
  titleGroup: { flexDirection: "row", alignItems: "center", gap: 10 },
  filterBtn: { borderWidth: 1, borderRadius: 14, paddingHorizontal: 12, paddingVertical: 4 },
  filterText: { fontSize: 13, fontWeight: "600" },
  chips: { paddingHorizontal: 24, gap: 8, paddingBottom: 12 },
  chip: { borderWidth: 1, borderRadius: 18, paddingHorizontal: 14, paddingVertical: 7 },
  chipText: { fontSize: 13, fontWeight: "600" },
  centered: { justifyContent: "center", alignItems: "center", gap: 12, paddingVertical: 48 },
  statusText: { fontSize: 14 },
  container: { paddingHorizontal: 24, paddingBottom: 32, gap: 8 },
  // 미끄러지는 안쪽 틀 — 예전에 container가 주던 항목 사이 간격을 여기서 준다
  slide: { gap: 8 },
  screenTitle: { fontSize: 28, fontWeight: "700", letterSpacing: -0.5 },
  updatedAt: { fontSize: 11, textAlign: "center", marginTop: 4 },
  bottomRefresh: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingTop: 8 },
  bottomRefreshText: { marginTop: 0 },
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
