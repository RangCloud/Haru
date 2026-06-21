/**
 * 홈 화면 — DAY 5 통합 완성
 *
 * 구성:
 * 1. 헤더: 로그인 유저 이름 + 오늘 날짜
 * 2. 이달 가계부 요약 카드 (수입 / 지출 / 잔액)
 * 3. 오늘 일정 카드 (최대 3개, 더보기 버튼)
 * 4. 로그아웃 버튼
 *
 * 날씨는 별도 탭에서 확인 가능하므로 홈에서는 제외.
 */

import { router } from "expo-router";
import { useEffect } from "react";
import {
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

import { Colors } from "@/constants/theme";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { useAuthStore } from "@/src/store/authStore";
import { useBudgetStore } from "@/src/store/budgetStore";
import { useScheduleStore } from "@/src/store/scheduleStore";

// ── 유틸 ─────────────────────────────────────────────────────

function formatToday(): string {
  const now = new Date();
  const days = ["일", "월", "화", "수", "목", "금", "토"];
  const y = now.getFullYear();
  const m = now.getMonth() + 1;
  const d = now.getDate();
  const dow = days[now.getDay()];
  return `${y}년 ${m}월 ${d}일 (${dow})`;
}

function todayString(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function formatAmount(n: number): string {
  return n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",") + "원";
}

// ── 가계부 요약 카드 ──────────────────────────────────────────

interface BudgetCardProps {
  income: number;
  expense: number;
  balance: number;
  colors: (typeof Colors)["light"];
}

function BudgetSummaryCard({ income, expense, balance, colors }: BudgetCardProps) {
  return (
    <TouchableOpacity
      style={[styles.card, { backgroundColor: colors.tint + "18" }]}
      onPress={() => router.push("/(tabs)/budget")}
      activeOpacity={0.8}
    >
      <View style={styles.cardHeader}>
        <Text style={[styles.cardTitle, { color: colors.text }]}>💰 이달 가계부</Text>
        <Text style={[styles.cardLink, { color: colors.tint }]}>자세히 →</Text>
      </View>
      <View style={styles.budgetRow}>
        <View style={styles.budgetItem}>
          <Text style={[styles.budgetLabel, { color: colors.icon }]}>수입</Text>
          <Text style={[styles.budgetIncome]}>{formatAmount(income)}</Text>
        </View>
        <View style={styles.budgetItem}>
          <Text style={[styles.budgetLabel, { color: colors.icon }]}>지출</Text>
          <Text style={[styles.budgetExpense]}>{formatAmount(expense)}</Text>
        </View>
        <View style={styles.budgetItem}>
          <Text style={[styles.budgetLabel, { color: colors.icon }]}>잔액</Text>
          <Text style={[styles.budgetBalance, { color: balance >= 0 ? colors.tint : "#e74c3c" }]}>
            {formatAmount(balance)}
          </Text>
        </View>
      </View>
    </TouchableOpacity>
  );
}

// ── 오늘 일정 카드 ────────────────────────────────────────────

interface TodayScheduleCardProps {
  schedules: { id: number; title: string; time: string }[];
  colors: (typeof Colors)["light"];
}

function TodayScheduleCard({ schedules, colors }: TodayScheduleCardProps) {
  const preview = schedules.slice(0, 3);
  const rest = schedules.length - preview.length;

  return (
    <TouchableOpacity
      style={[styles.card, { backgroundColor: colors.tint + "18" }]}
      onPress={() => router.push("/(tabs)/schedule")}
      activeOpacity={0.8}
    >
      <View style={styles.cardHeader}>
        <Text style={[styles.cardTitle, { color: colors.text }]}>📅 오늘 일정</Text>
        <Text style={[styles.cardLink, { color: colors.tint }]}>자세히 →</Text>
      </View>
      {preview.length === 0 ? (
        <Text style={[styles.emptyText, { color: colors.icon }]}>오늘 일정이 없습니다.</Text>
      ) : (
        <>
          {preview.map((s) => (
            <View key={s.id} style={styles.scheduleItem}>
              <View style={[styles.scheduleDot, { backgroundColor: colors.tint }]} />
              <Text style={[styles.scheduleTitle, { color: colors.text }]} numberOfLines={1}>
                {s.title}
              </Text>
              <Text style={[styles.scheduleTime, { color: colors.icon }]}>
                {s.time || "종일"}
              </Text>
            </View>
          ))}
          {rest > 0 && (
            <Text style={[styles.moreText, { color: colors.tint }]}>
              +{rest}개 더 보기
            </Text>
          )}
        </>
      )}
    </TouchableOpacity>
  );
}

// ── 메인 화면 ─────────────────────────────────────────────────

export default function HomeScreen() {
  const scheme = useColorScheme() ?? "light";
  const colors = Colors[scheme];

  const { user, signOut } = useAuthStore();
  const { totalIncome, totalExpense, balance, loadMonth } = useBudgetStore();
  const { monthSchedules, loadMonth: loadScheduleMonth } = useScheduleStore();

  // 이달 가계부·일정 로드
  useEffect(() => {
    const now = new Date();
    const y = now.getFullYear();
    const m = now.getMonth() + 1;
    loadMonth(y, m);
    loadScheduleMonth(y, m);
  }, []);

  // 오늘 일정만 필터링
  const today = todayString();
  const todaySchedules = monthSchedules.filter((s) => s.date === today);

  const handleSignOut = () => {
    Alert.alert("로그아웃", "로그아웃할까요?", [
      { text: "취소", style: "cancel" },
      {
        text: "로그아웃",
        style: "destructive",
        onPress: async () => {
          await signOut();
          router.replace("/(auth)/login");
        },
      },
    ]);
  };

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.background }]}
      contentContainerStyle={styles.content}
    >
      {/* 헤더 */}
      <View style={styles.header}>
        <View>
          <Text style={[styles.greeting, { color: colors.text }]}>
            안녕하세요, {user?.name ?? ""}님 👋
          </Text>
          <Text style={[styles.date, { color: colors.icon }]}>{formatToday()}</Text>
        </View>
        <TouchableOpacity onPress={handleSignOut} style={styles.signOutBtn}>
          <Text style={[styles.signOutText, { color: colors.icon }]}>로그아웃</Text>
        </TouchableOpacity>
      </View>

      {/* 이달 가계부 요약 */}
      <BudgetSummaryCard
        income={totalIncome}
        expense={totalExpense}
        balance={balance}
        colors={colors}
      />

      {/* 오늘 일정 */}
      <TodayScheduleCard schedules={todaySchedules} colors={colors} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 24, paddingTop: 64, gap: 16 },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 8,
  },
  greeting: { fontSize: 24, fontWeight: "700" },
  date: { fontSize: 13, marginTop: 4 },
  signOutBtn: { paddingTop: 4 },
  signOutText: { fontSize: 13 },
  // ── 카드 공통 ─────────────────────────────────────────────
  card: {
    borderRadius: 16,
    padding: 18,
    gap: 12,
  },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  cardTitle: { fontSize: 16, fontWeight: "600" },
  cardLink: { fontSize: 13 },
  // ── 가계부 ────────────────────────────────────────────────
  budgetRow: { flexDirection: "row", justifyContent: "space-around" },
  budgetItem: { alignItems: "center", gap: 4 },
  budgetLabel: { fontSize: 12 },
  budgetIncome: { fontSize: 15, fontWeight: "600", color: "#27ae60" },
  budgetExpense: { fontSize: 15, fontWeight: "600", color: "#e74c3c" },
  budgetBalance: { fontSize: 15, fontWeight: "700" },
  // ── 일정 ──────────────────────────────────────────────────
  scheduleItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  scheduleDot: { width: 6, height: 6, borderRadius: 3 },
  scheduleTitle: { flex: 1, fontSize: 14 },
  scheduleTime: { fontSize: 12 },
  moreText: { fontSize: 13, fontWeight: "500" },
  emptyText: { fontSize: 14 },
});
