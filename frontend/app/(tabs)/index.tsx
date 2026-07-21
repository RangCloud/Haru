/**
 * 홈 화면
 * 이달 가계부 요약 + 오늘 일정 카드 + 테마 토글
 */

import { router } from "expo-router";
import { useEffect } from "react";
import { Alert, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";

import { Colors, cardShadow } from "@/constants/theme";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { useAuthStore } from "@/src/store/authStore";
import { useBudgetStore } from "@/src/store/budgetStore";
import { useScheduleStore } from "@/src/store/scheduleStore";
import { useThemeStore, type ThemeMode } from "@/src/store/themeStore";

// ── 유틸 ─────────────────────────────────────────────────────

function formatToday(): string {
  const now = new Date();
  const days = ["일", "월", "화", "수", "목", "금", "토"];
  return `${now.getFullYear()}년 ${now.getMonth() + 1}월 ${now.getDate()}일 (${days[now.getDay()]})`;
}

function todayString(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function formatAmount(n: number): string {
  return n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",") + "원";
}

// 테마 모드별 이모지 아이콘
const THEME_ICON: Record<ThemeMode, string> = { system: "⚙️", light: "☀️", dark: "🌙" };
const NEXT_MODE: Record<ThemeMode, ThemeMode> = { system: "light", light: "dark", dark: "system" };

// ── 가계부 요약 카드 ──────────────────────────────────────────

function BudgetSummaryCard({
  income, expense, balance, colors,
}: {
  income: number; expense: number; balance: number;
  colors: typeof Colors.light;
}) {
  return (
    <TouchableOpacity
      style={[styles.card, { backgroundColor: colors.card, borderColor: colors.cardBorder }, cardShadow]}
      onPress={() => router.push("/(tabs)/budget")}
      activeOpacity={0.75}
    >
      <View style={styles.cardHeader}>
        <Text style={[styles.cardLabel, { color: colors.subtext }]}>이달 가계부</Text>
        <Text style={[styles.cardLink, { color: colors.tint }]}>자세히 →</Text>
      </View>
      <View style={styles.budgetRow}>
        <View style={styles.budgetItem}>
          <Text style={[styles.budgetCaption, { color: colors.subtext }]}>수입</Text>
          <Text style={[styles.budgetValue, { color: colors.income }]}>{formatAmount(income)}</Text>
        </View>
        <View style={[styles.budgetDivider, { backgroundColor: colors.separator }]} />
        <View style={styles.budgetItem}>
          <Text style={[styles.budgetCaption, { color: colors.subtext }]}>지출</Text>
          <Text style={[styles.budgetValue, { color: colors.expense }]}>{formatAmount(expense)}</Text>
        </View>
        <View style={[styles.budgetDivider, { backgroundColor: colors.separator }]} />
        <View style={styles.budgetItem}>
          <Text style={[styles.budgetCaption, { color: colors.subtext }]}>잔액</Text>
          <Text style={[styles.budgetValue, { color: balance >= 0 ? colors.tint : colors.expense }]}>
            {formatAmount(balance)}
          </Text>
        </View>
      </View>
    </TouchableOpacity>
  );
}

// ── 오늘 일정 카드 ────────────────────────────────────────────

function TodayScheduleCard({
  schedules, colors,
}: {
  schedules: { id: number; title: string; time: string }[];
  colors: typeof Colors.light;
}) {
  const preview = schedules.slice(0, 3);

  return (
    <TouchableOpacity
      style={[styles.card, { backgroundColor: colors.card, borderColor: colors.cardBorder }, cardShadow]}
      onPress={() => router.push("/(tabs)/schedule")}
      activeOpacity={0.75}
    >
      <View style={styles.cardHeader}>
        <Text style={[styles.cardLabel, { color: colors.subtext }]}>오늘 일정</Text>
        <Text style={[styles.cardLink, { color: colors.tint }]}>자세히 →</Text>
      </View>
      {preview.length === 0 ? (
        <Text style={[styles.emptyText, { color: colors.subtext }]}>오늘 일정이 없습니다.</Text>
      ) : (
        <>
          {preview.map((s) => (
            <View key={s.id} style={styles.scheduleItem}>
              <View style={[styles.scheduleDot, { backgroundColor: colors.tint }]} />
              <Text style={[styles.scheduleTitle, { color: colors.text }]} numberOfLines={1}>
                {s.title}
              </Text>
              <Text style={[styles.scheduleTime, { color: colors.subtext }]}>
                {s.time || "종일"}
              </Text>
            </View>
          ))}
          {schedules.length > 3 && (
            <Text style={[styles.moreText, { color: colors.tint }]}>
              +{schedules.length - 3}개 더 보기
            </Text>
          )}
        </>
      )}
    </TouchableOpacity>
  );
}

// ── 메인 화면 ─────────────────────────────────────────────────

export default function HomeScreen() {
  const scheme = useColorScheme();
  const colors = Colors[scheme];

  const { user, signOut } = useAuthStore();
  const { totalIncome, totalExpense, balance, loadMonth } = useBudgetStore();
  const { monthSchedules, loadMonth: loadScheduleMonth } = useScheduleStore();
  const { mode, setMode } = useThemeStore();

  useEffect(() => {
    const now = new Date();
    loadMonth(now.getFullYear(), now.getMonth() + 1);
    loadScheduleMonth(now.getFullYear(), now.getMonth() + 1);
  }, []);

  const today = todayString();
  const todaySchedules = monthSchedules.filter((s) => s.date === today);

  const handleSignOut = () => {
    Alert.alert("로그아웃", "로그아웃할까요?", [
      { text: "취소", style: "cancel" },
      { text: "로그아웃", style: "destructive", onPress: async () => { await signOut(); router.replace("/(auth)/login"); } },
    ]);
  };

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.background }]}
      contentContainerStyle={styles.content}
    >
      {/* 헤더 */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Text style={[styles.greeting, { color: colors.text }]}>
            안녕하세요, {user?.name ?? ""}님 👋
          </Text>
          <Text style={[styles.date, { color: colors.subtext }]}>{formatToday()}</Text>
        </View>
        <View style={styles.headerActions}>
          {/* 테마 토글 — 탭할 때마다 system → light → dark → system 순환 */}
          <TouchableOpacity
            onPress={() => setMode(NEXT_MODE[mode])}
            style={styles.iconBtn}
          >
            <Text style={styles.themeIcon}>{THEME_ICON[mode]}</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={handleSignOut} style={styles.iconBtn}>
            <Text style={[styles.signOutText, { color: colors.subtext }]}>로그아웃</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* 섹션 레이블 */}
      <Text style={[styles.sectionLabel, { color: colors.subtext }]}>이번 달</Text>
      <BudgetSummaryCard income={totalIncome} expense={totalExpense} balance={balance} colors={colors} />

      <Text style={[styles.sectionLabel, { color: colors.subtext }]}>오늘</Text>
      <TodayScheduleCard schedules={todaySchedules} colors={colors} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 24, paddingTop: 64, gap: 8 },
  // ── 헤더 ──────────────────────────────────────────────────
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 20,
  },
  headerLeft: { gap: 4 },
  headerActions: { flexDirection: "row", alignItems: "center", gap: 8, paddingTop: 2 },
  greeting: { fontSize: 22, fontWeight: "700", letterSpacing: -0.3 },
  date: { fontSize: 13 },
  iconBtn: { padding: 4 },
  themeIcon: { fontSize: 20 },
  signOutText: { fontSize: 13 },
  // ── 섹션 레이블 ───────────────────────────────────────────
  sectionLabel: {
    fontSize: 12,
    fontWeight: "600",
    letterSpacing: 0.8,
    textTransform: "uppercase",
    marginTop: 8,
    marginBottom: 6,
  },
  // ── 카드 공통 ─────────────────────────────────────────────
  card: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 20,
    gap: 14,
    marginBottom: 4,
  },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  cardLabel: { fontSize: 13, fontWeight: "600", letterSpacing: 0.2 },
  cardLink: { fontSize: 13 },
  // ── 가계부 ────────────────────────────────────────────────
  budgetRow: { flexDirection: "row", alignItems: "center" },
  budgetItem: { flex: 1, alignItems: "center", gap: 5 },
  budgetDivider: { width: 1, height: 32 },
  budgetCaption: { fontSize: 11 },
  budgetValue: { fontSize: 14, fontWeight: "700" },
  // ── 일정 ──────────────────────────────────────────────────
  scheduleItem: { flexDirection: "row", alignItems: "center", gap: 10 },
  scheduleDot: { width: 7, height: 7, borderRadius: 4 },
  scheduleTitle: { flex: 1, fontSize: 14 },
  scheduleTime: { fontSize: 12 },
  moreText: { fontSize: 13, fontWeight: "500" },
  emptyText: { fontSize: 14 },
});
