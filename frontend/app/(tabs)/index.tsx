/**
 * 홈 화면
 * 이달 가계부 요약 + 오늘 일정 카드 + 투두리스트 + 테마 토글
 */

import { router } from "expo-router";
import { useEffect, useRef, useState } from "react";
import {
  Alert,
  AppState,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

import { Colors, cardShadow } from "@/constants/theme";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { useAuthStore } from "@/src/store/authStore";
import { useBudgetStore } from "@/src/store/budgetStore";
import { useScheduleStore } from "@/src/store/scheduleStore";
import { useThemeStore, type ThemeMode } from "@/src/store/themeStore";
import { useTodoStore } from "@/src/store/todoStore";

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

// ── 투두리스트 카드 ───────────────────────────────────────────

function TodoCard({ colors }: { colors: typeof Colors.light }) {
  const { todos, add, toggle, remove } = useTodoStore();
  const [input, setInput] = useState("");
  const inputRef = useRef<TextInput>(null);

  const doneCount = todos.filter((t) => t.done).length;

  const handleAdd = async () => {
    if (!input.trim()) return;
    await add(input.trim());
    setInput("");
  };

  const handleLongPress = (id: number, title: string) => {
    Alert.alert("할 일 삭제", `"${title}"을(를) 삭제할까요?`, [
      { text: "취소", style: "cancel" },
      { text: "삭제", style: "destructive", onPress: () => remove(id) },
    ]);
  };

  return (
    <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.cardBorder }, cardShadow]}>
      <View style={styles.cardHeader}>
        <Text style={[styles.cardLabel, { color: colors.subtext }]}>오늘 할 일</Text>
        {todos.length > 0 && (
          <Text style={[styles.todoBadge, { color: colors.subtext }]}>
            {doneCount}/{todos.length}
          </Text>
        )}
      </View>

      {/* 투두 목록 */}
      {todos.length === 0 ? (
        <Text style={[styles.emptyText, { color: colors.subtext }]}>할 일을 추가해보세요.</Text>
      ) : (
        todos.map((t) => (
          <TouchableOpacity
            key={t.id}
            style={styles.todoItem}
            onPress={() => toggle(t.id, !t.done)}
            onLongPress={() => handleLongPress(t.id, t.title)}
            activeOpacity={0.7}
          >
            {/* 체크박스 */}
            <View style={[
              styles.checkbox,
              { borderColor: t.done ? colors.tint : colors.separator },
              t.done && { backgroundColor: colors.tint },
            ]}>
              {t.done && <Text style={styles.checkmark}>✓</Text>}
            </View>
            <Text style={[
              styles.todoTitle,
              { color: t.done ? colors.subtext : colors.text },
              t.done && styles.todoTitleDone,
            ]} numberOfLines={1}>
              {t.title}
            </Text>
          </TouchableOpacity>
        ))
      )}

      {/* 입력창 */}
      <View style={[styles.todoInputRow, { borderTopColor: colors.separator }]}>
        <TextInput
          ref={inputRef}
          style={[styles.todoInput, { color: colors.text }]}
          placeholder="+ 할 일 추가"
          placeholderTextColor={colors.subtext}
          value={input}
          onChangeText={setInput}
          onSubmitEditing={handleAdd}
          returnKeyType="done"
          blurOnSubmit={false}
        />
        {input.trim().length > 0 && (
          <TouchableOpacity onPress={handleAdd} style={styles.todoAddBtn}>
            <Text style={[styles.todoAddText, { color: colors.tint }]}>추가</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
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
  const { load: loadTodos } = useTodoStore();

  useEffect(() => {
    const now = new Date();
    loadMonth(now.getFullYear(), now.getMonth() + 1);
    loadScheduleMonth(now.getFullYear(), now.getMonth() + 1);
    loadTodos();

    // 백그라운드→포그라운드 복귀 시 투두 재로드
    // 자정을 넘긴 채로 앱을 켜두면 전날 투두가 표시되는 문제 방지
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") loadTodos();
    });
    return () => sub.remove();
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
      keyboardShouldPersistTaps="handled"
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

      <Text style={[styles.sectionLabel, { color: colors.subtext }]}>이번 달</Text>
      <BudgetSummaryCard income={totalIncome} expense={totalExpense} balance={balance} colors={colors} />

      <Text style={[styles.sectionLabel, { color: colors.subtext }]}>오늘</Text>
      <TodayScheduleCard schedules={todaySchedules} colors={colors} />
      <TodoCard colors={colors} />
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
  emptyText: { fontSize: 14 },
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
  // ── 투두 ──────────────────────────────────────────────────
  todoBadge: { fontSize: 12 },
  todoItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 2,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 1.5,
    alignItems: "center",
    justifyContent: "center",
  },
  checkmark: { fontSize: 13, color: "#fff", fontWeight: "700" },
  todoTitle: { flex: 1, fontSize: 14 },
  todoTitleDone: { textDecorationLine: "line-through" },
  todoInputRow: {
    flexDirection: "row",
    alignItems: "center",
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: 12,
    marginTop: 2,
    gap: 8,
  },
  todoInput: { flex: 1, fontSize: 14, paddingVertical: 0 },
  todoAddBtn: { paddingHorizontal: 4 },
  todoAddText: { fontSize: 14, fontWeight: "600" },
});
