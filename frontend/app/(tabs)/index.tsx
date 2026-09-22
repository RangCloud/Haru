/**
 * 홈 화면
 * 날씨 위젯(우상단) + 오늘 일정 → 투두리스트 → 이달 가계부 요약
 * 톱니바퀴(⚙) 탭 → 설정 모달 (테마·계정·로그아웃)
 */

import { router } from "expo-router";
import { useEffect, useRef, useState } from "react";
import {
  Alert,
  AppState,
  Modal,
  Pressable,
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
import { useWeatherStore } from "@/src/store/weatherStore";
import { requestNotificationPermission } from "@/src/utils/notifications";
import { writeWidgetData } from "@/src/utils/widgetData";

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

// 하늘 상태·강수 형태를 이모지로 변환
const SKY_ICON: Record<string, string> = { 맑음: "☀️", 구름조금: "🌤️", 구름많음: "⛅", 흐림: "☁️" };
const RAIN_ICON: Record<string, string> = { 없음: "", 비: "🌧️", "비/눈": "🌨️", 눈: "❄️", 소나기: "⛈️" };

function getWeatherIcon(sky: string, rainType: string): string {
  if (rainType !== "없음") return RAIN_ICON[rainType] ?? "🌧️";
  return SKY_ICON[sky] ?? "🌤️";
}

const THEME_LABEL: Record<ThemeMode, string> = { system: "시스템", light: "라이트", dark: "다크" };
const THEME_ICON: Record<ThemeMode, string> = { system: "⚙️", light: "☀️", dark: "🌙" };
const THEME_ORDER: ThemeMode[] = ["system", "light", "dark"];

// ── 설정 모달 ─────────────────────────────────────────────────

function SettingsModal({
  visible, onClose, colors,
}: {
  visible: boolean;
  onClose: () => void;
  colors: typeof Colors.light;
}) {
  const { mode, setMode } = useThemeStore();
  const { user, signOut } = useAuthStore();

  const handleSignOut = () => {
    Alert.alert("로그아웃", "로그아웃할까요?", [
      { text: "취소", style: "cancel" },
      {
        text: "로그아웃", style: "destructive",
        onPress: async () => {
          onClose();
          await signOut();
          router.replace("/(auth)/login");
        },
      },
    ]);
  };

  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={onClose}>
      <Pressable style={settingStyles.overlay} onPress={onClose}>
        <Pressable onPress={(e) => e.stopPropagation()}>
          <View style={[settingStyles.sheet, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
            {/* 헤더 */}
            <View style={settingStyles.sheetHeader}>
              <Text style={[settingStyles.sheetTitle, { color: colors.text }]}>설정</Text>
              <TouchableOpacity onPress={onClose} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
                <Text style={[settingStyles.closeBtn, { color: colors.icon }]}>✕</Text>
              </TouchableOpacity>
            </View>

            {/* 테마 */}
            <Text style={[settingStyles.sectionLabel, { color: colors.subtext }]}>화면 테마</Text>
            <View style={[settingStyles.themeRow, { backgroundColor: colors.background, borderRadius: 12 }]}>
              {THEME_ORDER.map((m) => (
                <TouchableOpacity
                  key={m}
                  style={[
                    settingStyles.themeBtn,
                    mode === m && { backgroundColor: colors.tint },
                  ]}
                  onPress={() => setMode(m)}
                >
                  <Text style={settingStyles.themeBtnIcon}>{THEME_ICON[m]}</Text>
                  <Text style={[settingStyles.themeBtnText, { color: mode === m ? "#fff" : colors.subtext }]}>
                    {THEME_LABEL[m]}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* 계정 정보 */}
            <Text style={[settingStyles.sectionLabel, { color: colors.subtext }]}>계정</Text>
            <View style={[settingStyles.accountBox, { backgroundColor: colors.background }]}>
              <Text style={[settingStyles.accountName, { color: colors.text }]}>{user?.name ?? "사용자"}</Text>
              <Text style={[settingStyles.accountEmail, { color: colors.subtext }]}>{user?.email ?? ""}</Text>
            </View>

            {/* 로그아웃 */}
            <TouchableOpacity
              style={[settingStyles.logoutBtn, { borderColor: colors.expense + "60" }]}
              onPress={handleSignOut}
            >
              <Text style={[settingStyles.logoutText, { color: colors.expense }]}>로그아웃</Text>
            </TouchableOpacity>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

// ── 날씨 미니 위젯 ────────────────────────────────────────────

function WeatherChip({ colors }: { colors: typeof Colors.light }) {
  const { current, isLoading, usingFallback, loadWeather } = useWeatherStore();

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { loadWeather(); }, []);

  if (isLoading) return <Text style={[weatherStyles.chip, { color: colors.subtext }]}>🌤 …</Text>;
  if (!current) return null;

  const icon = getWeatherIcon(current.sky, current.rain_type);
  return (
    <TouchableOpacity onPress={() => loadWeather(true)} activeOpacity={0.7}>
      <View style={[weatherStyles.chipBox, { backgroundColor: colors.tintLight }]}>
        <Text style={weatherStyles.chipIcon}>{icon}</Text>
        <Text style={[weatherStyles.chipTemp, { color: colors.tint }]}>{current.temp}°</Text>
        {usingFallback && <Text style={[weatherStyles.chipCity, { color: colors.subtext }]}>서울</Text>}
      </View>
    </TouchableOpacity>
  );
}

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
      onPress={() => router.push("/(tabs)/schedule")}
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
  schedules: { id: number; title: string; time: string; color?: string }[];
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
              <View style={[styles.scheduleDot, { backgroundColor: s.color || colors.tint }]} />
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
  const { todos, add, toggle, remove, isLoaded } = useTodoStore();
  const [input, setInput] = useState("");
  const inputRef = useRef<TextInput>(null);

  const doneCount = todos.filter((t) => t.done).length;

  const handleAdd = async () => {
    const trimmed = input.trim();
    if (!trimmed) return;
    try {
      await add(trimmed);
      setInput("");
    } catch {
      Alert.alert("오류", "할 일 추가에 실패했습니다. 다시 시도해 주세요.");
    }
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
      {isLoaded && todos.length === 0 ? (
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

  const { user } = useAuthStore();
  const { totalIncome, totalExpense, balance, loadMonth } = useBudgetStore();
  const { monthSchedules, loadMonth: loadScheduleMonth } = useScheduleStore();
  const { load: loadTodos } = useTodoStore();

  const [settingsVisible, setSettingsVisible] = useState(false);

  const lastActiveDateRef = useRef(todayString());

  useEffect(() => {
    const now = new Date();
    loadMonth(now.getFullYear(), now.getMonth() + 1);
    loadScheduleMonth(now.getFullYear(), now.getMonth() + 1);
    loadTodos();

    // 알림 권한 요청 — 앱 최초 실행 시 권한 팝업이 표시된다
    requestNotificationPermission();

    // 백그라운드→포그라운드 복귀 시 날짜 변경 감지 후 데이터 갱신
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") {
        const current = new Date();
        const currentDate = `${current.getFullYear()}-${String(current.getMonth() + 1).padStart(2, "0")}-${String(current.getDate()).padStart(2, "0")}`;
        loadTodos();
        if (currentDate !== lastActiveDateRef.current) {
          loadMonth(current.getFullYear(), current.getMonth() + 1);
          loadScheduleMonth(current.getFullYear(), current.getMonth() + 1);
          lastActiveDateRef.current = currentDate;
        }
      }
    });
    return () => sub.remove();
    // Zustand store 액션은 안정적 참조 — 의존성에 포함해도 무한 루프 없음
  }, [loadMonth, loadScheduleMonth, loadTodos]);

  const today = todayString();
  const todaySchedules = monthSchedules.filter((s) => s.date === today);

  // 위젯 데이터 갱신 — 일정이나 날씨가 바뀔 때마다 파일에 기록
  const { current: weatherCurrent, usingFallback } = useWeatherStore();
  useEffect(() => {
    const SKY: Record<string, string> = { 맑음: "☀️", 구름조금: "🌤️", 구름많음: "⛅", 흐림: "☁️" };
    const RAIN: Record<string, string> = { 없음: "", 비: "🌧️", "비/눈": "🌨️", 눈: "❄️", 소나기: "⛈️" };
    writeWidgetData({
      date: today,
      schedules: todaySchedules.map((s) => ({ id: s.id, title: s.title, time: s.time, color: s.color ?? "#6B6EE7" })),
      weather: weatherCurrent
        ? {
            icon: weatherCurrent.rain_type !== "없음" ? (RAIN[weatherCurrent.rain_type] ?? "🌧️") : (SKY[weatherCurrent.sky] ?? "🌤️"),
            temp: weatherCurrent.temp,
            city: usingFallback ? "서울" : "현재위치",
          }
        : null,
      updatedAt: new Date().toISOString(),
    });
  }, [today, todaySchedules, weatherCurrent, usingFallback]);

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
        {/* 오른쪽: 날씨 위젯 + 설정 버튼 */}
        <View style={styles.headerActions}>
          <WeatherChip colors={colors} />
          <TouchableOpacity
            onPress={() => setSettingsVisible(true)}
            style={styles.iconBtn}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Text style={styles.settingsIcon}>⚙️</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* 오늘 일정을 최상단에 배치 — 당일 할 일을 가장 먼저 확인 */}
      <Text style={[styles.sectionLabel, { color: colors.subtext }]}>오늘</Text>
      <TodayScheduleCard schedules={todaySchedules} colors={colors} />
      <TodoCard colors={colors} />

      {/* 가계부 요약 — 일정·할 일보다 부차적인 정보 */}
      <Text style={[styles.sectionLabel, { color: colors.subtext }]}>이번 달</Text>
      <BudgetSummaryCard income={totalIncome} expense={totalExpense} balance={balance} colors={colors} />

      {/* 설정 모달 */}
      <SettingsModal
        visible={settingsVisible}
        onClose={() => setSettingsVisible(false)}
        colors={colors}
      />
    </ScrollView>
  );
}

// ── 스타일 ───────────────────────────────────────────────────

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
  headerLeft: { gap: 4, flex: 1, marginRight: 12 },
  headerActions: { flexDirection: "row", alignItems: "center", gap: 8, paddingTop: 2 },
  greeting: { fontSize: 22, fontWeight: "700", letterSpacing: -0.3 },
  date: { fontSize: 13 },
  iconBtn: { padding: 4 },
  settingsIcon: { fontSize: 20 },
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

// ── 설정 모달 스타일 ───────────────────────────────────────────

const settingStyles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "#00000055",
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  sheet: {
    width: "100%",
    borderRadius: 20,
    borderWidth: 1,
    padding: 24,
    gap: 8,
  },
  sheetHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  sheetTitle: { fontSize: 20, fontWeight: "700" },
  closeBtn: { fontSize: 18 },
  sectionLabel: { fontSize: 11, fontWeight: "600", letterSpacing: 0.8, textTransform: "uppercase", marginTop: 8 },
  // 테마 선택 행
  themeRow: {
    flexDirection: "row",
    overflow: "hidden",
    padding: 4,
    gap: 4,
  },
  themeBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    alignItems: "center",
    gap: 2,
  },
  themeBtnIcon: { fontSize: 18 },
  themeBtnText: { fontSize: 12, fontWeight: "500" },
  // 계정 박스
  accountBox: {
    borderRadius: 12,
    padding: 14,
    gap: 4,
  },
  accountName: { fontSize: 15, fontWeight: "600" },
  accountEmail: { fontSize: 13 },
  // 로그아웃
  logoutBtn: {
    marginTop: 8,
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
  },
  logoutText: { fontSize: 15, fontWeight: "600" },
});

// ── 날씨 칩 스타일 ─────────────────────────────────────────────

const weatherStyles = StyleSheet.create({
  chip: { fontSize: 13 },
  chipBox: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
    gap: 3,
  },
  chipIcon: { fontSize: 16 },
  chipTemp: { fontSize: 14, fontWeight: "600" },
  chipCity: { fontSize: 11 },
});
