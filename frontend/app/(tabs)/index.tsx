/**
 * 홈 화면
 * 날씨 위젯(우상단) + 오늘 일정 → 투두리스트 → 이달 가계부 요약
 * 톱니바퀴(⚙) 탭 → 설정 시트 (테마·시작 화면·계정·로그아웃)
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
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Colors, cardShadow } from "@/constants/theme";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { BottomSheet } from "@/src/components/BottomSheet";
import { TodoAddSheet } from "@/src/components/TodoAddSheet";
import { TodoList } from "@/src/components/TodoList";
import { type RoutineForDate } from "@/src/db/routine";
import { type ScheduleItem } from "@/src/db/schedule";
import { useAuthStore } from "@/src/store/authStore";
import { useBudgetStore } from "@/src/store/budgetStore";
import { useScheduleStore } from "@/src/store/scheduleStore";
import { START_TAB_OPTIONS, useSettingsStore } from "@/src/store/settingsStore";
import { useThemeStore, type ThemeMode } from "@/src/store/themeStore";
import { useTodoStore } from "@/src/store/todoStore";
import { useWeatherStore } from "@/src/store/weatherStore";
import { requestNotificationPermission } from "@/src/utils/notifications";
import { timeLabelOn } from "@/src/utils/scheduleText";
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

// ── 설정 모달 (바텀 시트 스타일) ──────────────────────────────

function SettingsModal({
  visible, onClose, colors,
}: {
  visible: boolean;
  onClose: () => void;
  colors: typeof Colors.light;
}) {
  const { mode, setMode } = useThemeStore();
  const { startTab, setStartTab } = useSettingsStore();
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
    // 공용 바텀시트 — 항목이 늘어도 상태바를 넘지 않고 시트 안에서 스크롤된다 (피드백 1번)
    <BottomSheet visible={visible} onClose={onClose} title="설정" colors={colors}>
      {/* 화면 테마 */}
      <Text style={[settingStyles.sectionLabel, { color: colors.subtext }]}>화면 테마</Text>
      <View style={[settingStyles.segmentedControl, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
        {THEME_ORDER.map((m, i) => (
          <TouchableOpacity
            key={m}
            style={[
              settingStyles.segment,
              mode === m && { backgroundColor: colors.tint },
              i < THEME_ORDER.length - 1 && settingStyles.segmentBorder,
              i < THEME_ORDER.length - 1 && { borderColor: colors.separator },
            ]}
            onPress={() => setMode(m)}
          >
            <Text style={settingStyles.segmentIcon}>{THEME_ICON[m]}</Text>
            <Text style={[settingStyles.segmentLabel, { color: mode === m ? "#fff" : colors.subtext }]}>
              {THEME_LABEL[m]}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* 시작 화면 (피드백 17번) — 앱을 새로 켤 때 먼저 보여줄 탭 */}
      <Text style={[settingStyles.sectionLabel, { color: colors.subtext }]}>시작 화면</Text>
      <View style={[settingStyles.segmentedControl, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
        {START_TAB_OPTIONS.map((opt, i) => (
          <TouchableOpacity
            key={opt.value}
            style={[
              settingStyles.segment,
              settingStyles.segmentCompact,
              startTab === opt.value && { backgroundColor: colors.tint },
              i < START_TAB_OPTIONS.length - 1 && settingStyles.segmentBorder,
              i < START_TAB_OPTIONS.length - 1 && { borderColor: colors.separator },
            ]}
            onPress={() => setStartTab(opt.value)}
            accessibilityState={{ selected: startTab === opt.value }}
          >
            <Text style={[settingStyles.segmentLabel, { color: startTab === opt.value ? "#fff" : colors.subtext }]}>
              {opt.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
      <Text style={[settingStyles.hint, { color: colors.subtext }]}>앱을 다시 실행할 때부터 적용됩니다.</Text>

      {/* 계정 */}
      <Text style={[settingStyles.sectionLabel, { color: colors.subtext }]}>계정</Text>
      <View style={[settingStyles.listCard, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
        <View style={settingStyles.listRow}>
          <Text style={settingStyles.listIcon}>👤</Text>
          <View style={settingStyles.listContent}>
            <Text style={[settingStyles.listLabel, { color: colors.text }]}>{user?.name ?? "게스트"}</Text>
            <Text style={[settingStyles.listSub, { color: colors.subtext }]}>
              {user?.email ?? "게스트 모드로 이용 중"}
            </Text>
          </View>
        </View>
      </View>

      {/* 앱 정보 */}
      <Text style={[settingStyles.sectionLabel, { color: colors.subtext }]}>앱 정보</Text>
      <View style={[settingStyles.listCard, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
        <View style={settingStyles.listRow}>
          <Text style={[settingStyles.listLabel, { color: colors.text }]}>버전</Text>
          <Text style={[settingStyles.listValue, { color: colors.subtext }]}>1.0.0</Text>
        </View>
      </View>

      {/* 로그아웃 */}
      <TouchableOpacity
        style={[settingStyles.logoutBtn, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}
        onPress={handleSignOut}
      >
        <Text style={[settingStyles.logoutText, { color: colors.expense }]}>로그아웃</Text>
      </TouchableOpacity>
    </BottomSheet>
  );
}

// ── 날씨 미니 위젯 ────────────────────────────────────────────

function WeatherChip({ colors }: { colors: typeof Colors.light }) {
  const { current, isLoading, error, loadWeather } = useWeatherStore();

  // 한 번 받은 날씨 데이터는 로컬에도 보관 — Zustand 상태가 어떤 이유로든 초기화돼도 칩이 사라지지 않도록
  const [pinned, setPinned] = useState<typeof current>(null);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { loadWeather(); }, []);

  useEffect(() => {
    if (current) setPinned(current);
  }, [current]);

  // 표시에 쓸 데이터: 스토어 최신값 우선, 없으면 로컬에 고정된 값
  const display = current ?? pinned;

  // 로딩 중이고 아직 표시할 데이터가 없을 때만 로딩 인디케이터
  if (isLoading && !display) {
    return (
      <View style={[weatherStyles.chipBox, { backgroundColor: colors.tintLight }]}>
        <Text style={weatherStyles.chipIcon}>🌤</Text>
        <Text style={[weatherStyles.chipTemp, { color: colors.tint }]}>…</Text>
      </View>
    );
  }

  // 에러 발생 시: 이전에 받은 데이터가 있으면 그대로 표시, 없으면 재시도 버튼
  if (error && !display) {
    return (
      <TouchableOpacity
        onPress={() => loadWeather(true)}
        style={[weatherStyles.chipBox, { backgroundColor: colors.tintLight }]}
        activeOpacity={0.7}
      >
        <Text style={weatherStyles.chipIcon}>⚠️</Text>
        <Text style={[weatherStyles.chipTemp, { color: colors.subtext }]}>재시도</Text>
      </TouchableOpacity>
    );
  }

  if (!display) return null;

  const icon = getWeatherIcon(display.sky, display.rain_type);
  const condition = display.rain_type !== "없음" ? display.rain_type : display.sky;

  return (
    <View style={[weatherStyles.chipBox, { backgroundColor: colors.tintLight }]}>
      <Text style={weatherStyles.chipIcon}>{icon}</Text>
      <View style={weatherStyles.chipInfo}>
        <Text style={[weatherStyles.chipTemp, { color: colors.tint }]}>{display.temp}°</Text>
        <Text style={[weatherStyles.chipCondition, { color: colors.subtext }]}>{condition}</Text>
      </View>
    </View>
  );
}

// ── 가계부 요약 카드 ──────────────────────────────────────────

// 피드백 11번: 잔액 대신 수입 총액·지출 총액 두 가지만 크게 보여준다
function BudgetSummaryCard({
  income, expense, colors,
}: {
  income: number; expense: number;
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
          <Text style={[styles.budgetCaption, { color: colors.subtext }]}>수입 총액</Text>
          <Text style={[styles.budgetValue, { color: colors.income }]}>{formatAmount(income)}</Text>
        </View>
        <View style={[styles.budgetDivider, { backgroundColor: colors.separator }]} />
        <View style={styles.budgetItem}>
          <Text style={[styles.budgetCaption, { color: colors.subtext }]}>지출 총액</Text>
          <Text style={[styles.budgetValue, { color: colors.expense }]}>{formatAmount(expense)}</Text>
        </View>
      </View>
    </TouchableOpacity>
  );
}

// ── 오늘 일정 카드 ────────────────────────────────────────────

function TodayScheduleCard({
  schedules, today, colors,
}: {
  schedules: ScheduleItem[];
  today: string;
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
                {timeLabelOn(s, today)}
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
  const { todos, routines, add, isLoaded } = useTodoStore();
  const [input, setInput] = useState("");
  const inputRef = useRef<TextInput>(null);
  // 날짜 지정·루틴 추가 시트 (피드백 2번·18번)
  const [sheet, setSheet] = useState<{ mode: "todo" | "routine"; editRoutine?: { id: number; title: string; weekdays: string } } | null>(null);

  const all = [...routines, ...todos];
  const doneCount = all.filter((t) => t.done).length;

  // 입력칸에 바로 쓰고 엔터 → 오늘 할 일로 빠르게 추가 (기존 사용 방식 유지)
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

  const handleEditRoutine = (r: RoutineForDate) =>
    setSheet({ mode: "routine", editRoutine: { id: r.id, title: r.title, weekdays: r.weekdays } });

  return (
    <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.cardBorder }, cardShadow]}>
      <View style={styles.cardHeader}>
        <Text style={[styles.cardLabel, { color: colors.subtext }]}>오늘 할 일</Text>
        {all.length > 0 && (
          <Text style={[styles.todoBadge, { color: colors.subtext }]}>
            {doneCount}/{all.length}
          </Text>
        )}
      </View>

      {isLoaded && all.length === 0 ? (
        <Text style={[styles.emptyText, { color: colors.subtext }]}>할 일을 추가해보세요.</Text>
      ) : (
        <TodoList todos={todos} routines={routines} date={todayString()} colors={colors} onEditRoutine={handleEditRoutine} />
      )}

      {all.length > 0 && (
        <Text style={[styles.todoHint, { color: colors.subtext }]}>길게 눌러 ★ 중요 표시·삭제</Text>
      )}

      {/* 입력창 + 날짜 지정·루틴 버튼 */}
      <View style={[styles.todoInputRow, { borderTopColor: colors.separator }]}>
        <TextInput
          ref={inputRef}
          style={[styles.todoInput, { color: colors.text }]}
          placeholder="+ 오늘 할 일 추가"
          placeholderTextColor={colors.subtext}
          value={input}
          onChangeText={setInput}
          onSubmitEditing={handleAdd}
          returnKeyType="done"
          blurOnSubmit={false}
        />
        {input.trim().length > 0 ? (
          <TouchableOpacity onPress={handleAdd} style={styles.todoAddBtn}>
            <Text style={[styles.todoAddText, { color: colors.tint }]}>추가</Text>
          </TouchableOpacity>
        ) : (
          <View style={styles.todoTools}>
            <TouchableOpacity
              onPress={() => setSheet({ mode: "todo" })}
              style={[styles.todoTool, { backgroundColor: colors.tintLight }]}
              accessibilityLabel="날짜를 정해서 할 일 추가"
            >
              <Text style={[styles.todoToolText, { color: colors.tint }]}>📅 날짜</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => setSheet({ mode: "routine" })}
              style={[styles.todoTool, { backgroundColor: colors.tintLight }]}
              accessibilityLabel="고정 루틴 추가"
            >
              <Text style={[styles.todoToolText, { color: colors.tint }]}>↻ 루틴</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>

      <TodoAddSheet
        visible={sheet !== null}
        onClose={() => setSheet(null)}
        initialMode={sheet?.mode}
        editRoutine={sheet?.editRoutine}
        colors={colors}
      />
    </View>
  );
}

// ── 메인 화면 ─────────────────────────────────────────────────

export default function HomeScreen() {
  const scheme = useColorScheme();
  const colors = Colors[scheme];

  const insets = useSafeAreaInsets();
  const { user } = useAuthStore();
  // 홈은 항상 "이번 달·오늘" 기준 — 일정 탭에서 다른 달로 넘겨도 영향받지 않는 전용 값을 쓴다
  const { thisMonthIncome, thisMonthExpense, loadThisMonth } = useBudgetStore();
  const { todaySchedules, loadToday } = useScheduleStore();
  const { load: loadTodos } = useTodoStore();

  const [settingsVisible, setSettingsVisible] = useState(false);

  const lastActiveDateRef = useRef(todayString());

  useEffect(() => {
    loadThisMonth();
    loadToday();
    loadTodos();

    // 알림 권한 요청 — 앱 최초 실행 시 권한 팝업이 표시된다
    requestNotificationPermission();

    // 백그라운드→포그라운드 복귀 시: 할 일은 항상 새로 읽고, 날짜가 바뀌었으면 오늘 일정·이번 달 합계도 갱신
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") {
        const currentDate = todayString();
        loadTodos();
        if (currentDate !== lastActiveDateRef.current) {
          loadThisMonth();
          loadToday();
          lastActiveDateRef.current = currentDate;
        }
      }
    });
    return () => sub.remove();
    // Zustand store 액션은 안정적 참조 — 의존성에 포함해도 무한 루프 없음
  }, [loadThisMonth, loadToday, loadTodos]);

  const today = todayString();

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
      // 상단 여백을 기기별 상태바·노치 높이에 맞춘다 (고정 64 → 안전 영역 + 16, 피드백 1번)
      contentContainerStyle={[styles.content, { paddingTop: insets.top + 16 }]}
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
      <TodayScheduleCard schedules={todaySchedules} today={today} colors={colors} />
      <TodoCard colors={colors} />

      {/* 가계부 요약 — 일정·할 일보다 부차적인 정보 */}
      <Text style={[styles.sectionLabel, { color: colors.subtext }]}>이번 달</Text>
      <BudgetSummaryCard income={thisMonthIncome} expense={thisMonthExpense} colors={colors} />

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
  greeting: { fontSize: 17, fontWeight: "700", letterSpacing: -0.3 },
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
  todoHint: { fontSize: 11, marginTop: -4 },
  todoTools: { flexDirection: "row", gap: 6 },
  todoTool: { borderRadius: 12, paddingHorizontal: 9, paddingVertical: 5 },
  todoToolText: { fontSize: 12, fontWeight: "600" },
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

// ── 설정 모달 스타일 (바텀 시트) ─────────────────────────────

const settingStyles = StyleSheet.create({
  sectionLabel: {
    fontSize: 11,
    fontWeight: "600",
    letterSpacing: 0.8,
    textTransform: "uppercase",
    marginTop: 10,
    marginBottom: 4,
    marginLeft: 4,
  },
  // 테마 세그먼트
  segmentedControl: {
    flexDirection: "row",
    borderRadius: 14,
    borderWidth: 1,
    overflow: "hidden",
  },
  segment: {
    flex: 1,
    paddingVertical: 12,
    alignItems: "center",
    gap: 4,
  },
  segmentBorder: {
    borderRightWidth: 1,
  },
  // 시작 화면 선택은 아이콘 없이 글자만 — 높이를 줄인다
  segmentCompact: { paddingVertical: 10 },
  hint: { fontSize: 11, marginLeft: 4, marginTop: -2 },
  segmentIcon: { fontSize: 18 },
  segmentLabel: { fontSize: 12, fontWeight: "500" },
  // 리스트 카드 공통
  listCard: {
    borderRadius: 14,
    borderWidth: 1,
    overflow: "hidden",
  },
  listRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 12,
  },
  listIcon: { fontSize: 20 },
  listContent: { flex: 1, gap: 2 },
  listLabel: { fontSize: 15, fontWeight: "500" },
  listSub: { fontSize: 13 },
  listValue: { fontSize: 14 },
  // 로그아웃
  logoutBtn: {
    marginTop: 6,
    borderWidth: 1,
    borderRadius: 14,
    paddingVertical: 15,
    alignItems: "center",
  },
  logoutText: { fontSize: 15, fontWeight: "600" },
});

// ── 날씨 칩 스타일 ─────────────────────────────────────────────

const weatherStyles = StyleSheet.create({
  chipBox: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 20,
    gap: 6,
  },
  chipIcon: { fontSize: 20 },
  chipInfo: { gap: 0 },
  chipTemp: { fontSize: 15, fontWeight: "700", lineHeight: 18 },
  chipCondition: { fontSize: 10, lineHeight: 13 },
});
