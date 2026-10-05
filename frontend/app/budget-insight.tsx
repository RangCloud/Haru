/**
 * 소비 분석 화면
 *
 * 가계부 탭의 '소비 분석'에서 들어온다. 주·달·년 단위로 지출을 요약해 보여 준다.
 * - 총 지출과 직전 기간 대비 증감 (진행 중인 기간은 직전 기간의 같은 날 수와 비교)
 * - 카테고리별 금액·비율
 * - 한마디: 가장 큰 카테고리, 크게 늘거나 준 카테고리, 평균과 가장 많이 쓴 날, 수입 대비 지출
 *
 * 계산은 모두 기기 안에서만 한다 (src/utils/spendingInsight.ts).
 * 가계부 내역을 서버나 AI로 보내지 않는다 — CLAUDE.md §4 로컬 우선 원칙.
 */

import { router } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { ScrollView, StyleSheet, TouchableOpacity, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Colors, cardShadow } from "@/constants/theme";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { Text } from "@/src/components/AppText";
import { formatAmount } from "@/src/components/BudgetModal";
import { getTransactionsBetween, type Transaction } from "@/src/db/budget";
import { useBudgetStore } from "@/src/store/budgetStore";
import { toDateStr, todayString } from "@/src/utils/date";
import { buildInsight, getPeriod, shiftAnchor, type PeriodUnit } from "@/src/utils/spendingInsight";

const UNITS: { value: PeriodUnit; label: string }[] = [
  { value: "week", label: "주" },
  { value: "month", label: "달" },
  { value: "year", label: "년" },
];

// 카테고리 막대 색 — 금액 순위대로 배정한다 (카테고리 이름이 늘어나도 색이 모자라지 않게 돌려 쓴다)
const BAR_COLORS = ["#EF4444", "#EC4899", "#F59E0B", "#3B82F6", "#10B981", "#8B5CF6", "#9CA3AF"];

export default function BudgetInsightScreen() {
  const colors = Colors[useColorScheme() ?? "light"];
  const insets = useSafeAreaInsets();
  const { homeYear, homeMonth } = useBudgetStore();

  const today = todayString();
  const [unit, setUnit] = useState<PeriodUnit>("month");
  // 기준 날짜 — 처음에는 가계부 탭에서 보고 있던 달. 그 달이 이번 달이면 오늘을 기준으로 삼아
  // '주'로 바꿨을 때 이번 주가 나오게 한다.
  const [anchor, setAnchor] = useState(() => {
    const now = new Date();
    const isCurrent = homeYear === now.getFullYear() && homeMonth === now.getMonth() + 1;
    return isCurrent ? today : toDateStr(homeYear, homeMonth, 1);
  });

  const period = useMemo(() => getPeriod(unit, anchor, today), [unit, anchor, today]);

  const [data, setData] = useState<{ current: Transaction[]; previous: Transaction[] } | null>(null);
  useEffect(() => {
    // 기간을 빠르게 넘기면 먼저 보낸 조회가 늦게 도착할 수 있다 — 마지막 요청의 결과만 반영한다
    let cancelled = false;
    Promise.all([
      getTransactionsBetween(period.start, period.end),
      getTransactionsBetween(period.prevStart, period.prevEnd),
    ])
      .then(([current, previous]) => { if (!cancelled) setData({ current, previous }); })
      // 조회에 실패하면 빈 내역으로 보여 준다 (화면이 로딩 상태로 멈추지 않게)
      .catch(() => { if (!cancelled) setData({ current: [], previous: [] }); });
    return () => { cancelled = true; };
  }, [period.start, period.end, period.prevStart, period.prevEnd]);

  const insight = useMemo(
    () => (data ? buildInsight(period, data.current, data.previous) : null),
    [data, period],
  );

  // 미래 기간에는 내역이 있을 수 없으므로 다음으로 넘기지 못하게 한다
  const canGoNext = period.end < today;
  const maxCategory = insight?.categories[0]?.amount ?? 0;
  // 총 지출 비교 막대는 둘 중 큰 값을 100%로 잡는다
  const maxTotal = Math.max(insight?.expense ?? 0, insight?.prevExpense ?? 0);

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={styles.back}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          accessibilityRole="button"
          accessibilityLabel="뒤로"
        >
          <Text style={[styles.backText, { color: colors.tint }]}>‹</Text>
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.text }]}>소비 분석</Text>
      </View>

      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]}>
        {/* 단위 선택 */}
        <View style={[styles.segment, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
          {UNITS.map((u) => {
            const on = u.value === unit;
            return (
              <TouchableOpacity
                key={u.value}
                onPress={() => setUnit(u.value)}
                style={[styles.segmentBtn, on && { backgroundColor: colors.tint }]}
                accessibilityState={{ selected: on }}
              >
                <Text style={[styles.segmentText, { color: on ? "#fff" : colors.subtext }]}>{u.label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* 기간 이동 */}
        <View style={styles.periodRow}>
          <TouchableOpacity
            onPress={() => setAnchor(shiftAnchor(unit, anchor, -1))}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            accessibilityLabel="이전 기간"
          >
            <Text style={[styles.arrow, { color: colors.tint }]}>‹</Text>
          </TouchableOpacity>
          <Text style={[styles.periodLabel, { color: colors.text }]}>{period.label}</Text>
          <TouchableOpacity
            onPress={() => setAnchor(shiftAnchor(unit, anchor, 1))}
            disabled={!canGoNext}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            accessibilityLabel="다음 기간"
          >
            <Text style={[styles.arrow, { color: canGoNext ? colors.tint : colors.separator }]}>›</Text>
          </TouchableOpacity>
        </View>

        {insight && (
          <>
            {/* 총 지출 */}
            <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.cardBorder }, cardShadow]}>
              <Text style={[styles.cardLabel, { color: colors.subtext }]}>총 지출</Text>
              <Text style={[styles.total, { color: colors.text }]}>{formatAmount(insight.expense)}</Text>
              {insight.prevExpense > 0 || insight.expense > 0 ? (
                <>
                  {/* 더 썼으면 빨강, 덜 썼으면 초록 — 금액 색 규칙(지출=빨강)과 같은 뜻으로 읽힌다 */}
                  {insight.diff !== 0 && (
                    <Text style={[styles.delta, { color: insight.diff > 0 ? colors.expense : colors.income }]}>
                      {period.prevLabel}보다 {insight.diff > 0 ? "▲" : "▼"} {formatAmount(Math.abs(insight.diff))}
                      {insight.diffPercent !== null ? ` (${insight.diffPercent}%)` : ""}
                    </Text>
                  )}
                  {insight.diff === 0 && (
                    <Text style={[styles.delta, { color: colors.subtext }]}>직전 기간과 지출이 같아요</Text>
                  )}
                  <CompareBar label={period.prevLabel} amount={insight.prevExpense} max={maxTotal} color={colors.subtext} colors={colors} />
                  <CompareBar label="이번 기간" amount={insight.expense} max={maxTotal} color={colors.expense} colors={colors} />
                </>
              ) : (
                <Text style={[styles.empty, { color: colors.subtext }]}>이 기간에는 지출 내역이 없어요.</Text>
              )}
            </View>

            {/* 카테고리별 지출 */}
            {insight.categories.length > 0 && (
              <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.cardBorder }, cardShadow]}>
                <Text style={[styles.cardLabel, { color: colors.subtext }]}>카테고리별 지출</Text>
                {insight.categories.map((c, i) => (
                  <View key={c.category} style={styles.catRow}>
                    <View style={styles.catHead}>
                      <Text style={[styles.catName, { color: colors.text }]} numberOfLines={1}>{c.category}</Text>
                      <Text style={[styles.catAmount, { color: colors.text }]}>{formatAmount(c.amount)}</Text>
                      <Text style={[styles.catPercent, { color: colors.subtext }]}>{Math.round(c.ratio * 100)}%</Text>
                    </View>
                    <View style={[styles.track, { backgroundColor: colors.separator }]}>
                      <View
                        style={[styles.fill, {
                          // 가장 큰 카테고리를 꽉 찬 막대로 두고 나머지는 그에 대한 비율로 그린다
                          width: `${maxCategory > 0 ? (c.amount / maxCategory) * 100 : 0}%`,
                          backgroundColor: BAR_COLORS[i % BAR_COLORS.length],
                        }]}
                      />
                    </View>
                  </View>
                ))}
              </View>
            )}

            {/* 한마디 */}
            {insight.messages.length > 0 && (
              <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.cardBorder }, cardShadow]}>
                <Text style={[styles.cardLabel, { color: colors.subtext }]}>한마디</Text>
                {insight.messages.map((m) => (
                  <View key={m} style={styles.msgRow}>
                    <View style={[styles.msgDot, { backgroundColor: colors.tint }]} />
                    <Text style={[styles.msgText, { color: colors.text }]}>{m}</Text>
                  </View>
                ))}
              </View>
            )}
          </>
        )}

        <Text style={[styles.local, { color: colors.subtext }]}>
          기기 안에서만 계산해요. 가계부 내용은 어디에도 전송되지 않아요.
        </Text>
      </ScrollView>
    </View>
  );
}

/** 직전 기간과 이번 기간의 총 지출을 나란히 비교하는 막대 한 줄 */
function CompareBar({ label, amount, max, color, colors }: {
  label: string;
  amount: number;
  max: number;
  color: string;
  colors: typeof Colors.light;
}) {
  return (
    <View style={styles.cmpRow}>
      <View style={styles.cmpHead}>
        <Text style={[styles.cmpLabel, { color: colors.subtext }]} numberOfLines={1}>{label}</Text>
        <Text style={[styles.cmpAmount, { color: colors.subtext }]}>{formatAmount(amount)}</Text>
      </View>
      <View style={[styles.track, { backgroundColor: colors.separator }]}>
        <View style={[styles.fill, { width: `${max > 0 ? (amount / max) * 100 : 0}%`, backgroundColor: color }]} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  header: { alignItems: "center", justifyContent: "center", paddingHorizontal: 24, paddingBottom: 12 },
  back: { position: "absolute", left: 16, bottom: 8 },
  backText: { fontSize: 32, fontWeight: "300" },
  title: { fontSize: 18, fontWeight: "700", paddingVertical: 8 },
  content: { paddingHorizontal: 24, gap: 12 },
  segment: { flexDirection: "row", borderRadius: 12, borderWidth: 1, overflow: "hidden" },
  segmentBtn: { flex: 1, alignItems: "center", paddingVertical: 10 },
  segmentText: { fontSize: 14, fontWeight: "600" },
  periodRow: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 16 },
  arrow: { fontSize: 28, fontWeight: "300", paddingHorizontal: 6 },
  periodLabel: { fontSize: 15, fontWeight: "700", minWidth: 150, textAlign: "center" },
  card: { borderRadius: 16, borderWidth: 1, padding: 18, gap: 10 },
  cardLabel: { fontSize: 13, fontWeight: "600" },
  total: { fontSize: 24, fontWeight: "800", fontVariant: ["tabular-nums"] },
  delta: { fontSize: 12, fontWeight: "700", marginTop: -4 },
  empty: { fontSize: 13 },
  // 글자가 커져도 금액이 잘리지 않도록 이름·금액을 막대 위 한 줄에 두고 막대는 그 아래 전체 폭으로 그린다
  cmpRow: { gap: 4 },
  cmpHead: { flexDirection: "row", justifyContent: "space-between", gap: 8 },
  cmpLabel: { flexShrink: 1, fontSize: 11 },
  cmpAmount: { fontSize: 11, fontVariant: ["tabular-nums"] },
  catRow: { gap: 5 },
  catHead: { flexDirection: "row", alignItems: "baseline", gap: 8 },
  catName: { flex: 1, fontSize: 13, fontWeight: "500" },
  catAmount: { fontSize: 13, fontWeight: "600", fontVariant: ["tabular-nums"] },
  catPercent: { fontSize: 11, minWidth: 30, textAlign: "right", fontVariant: ["tabular-nums"] },
  track: { height: 8, borderRadius: 4, overflow: "hidden" },
  fill: { height: 8, borderRadius: 4 },
  msgRow: { flexDirection: "row", gap: 8 },
  msgDot: { width: 5, height: 5, borderRadius: 2.5, marginTop: 7 },
  msgText: { flex: 1, fontSize: 13, lineHeight: 19 },
  local: { fontSize: 11, textAlign: "center" },
});
