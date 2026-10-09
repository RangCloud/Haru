/**
 * 홈 화면
 * 날씨 위젯(우상단) + 오늘 일정 → 투두리스트 → 월별 가계부 요약(제목을 눌러 연·월 선택)
 * 톱니바퀴(⚙) 탭 → 설정 시트 (테마·시작 화면·계정·로그아웃)
 */

import { router } from "expo-router";
import { useEffect, useRef, useState } from "react";
import {
  Alert,
  AppState,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Colors, cardShadow } from "@/constants/theme";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { Text } from "@/src/components/AppText";
import { BottomSheet } from "@/src/components/BottomSheet";
import { CalendarImportSheet } from "@/src/components/CalendarImportSheet";
import { DateJumpSheet } from "@/src/components/DateJumpSheet";
import { TodoAddSheet, type TodoEditTarget } from "@/src/components/TodoAddSheet";
import { TodoList } from "@/src/components/TodoList";
import { countImportedSchedules, deleteImportedSchedules, type ScheduleItem } from "@/src/db/schedule";
import { useAuthStore } from "@/src/store/authStore";
import { useBudgetStore } from "@/src/store/budgetStore";
import { useScheduleStore } from "@/src/store/scheduleStore";
import { FONT_SIZE_OPTIONS, START_TAB_OPTIONS, useSettingsStore } from "@/src/store/settingsStore";
import { useThemeStore, type ThemeMode } from "@/src/store/themeStore";
import { useTodoStore } from "@/src/store/todoStore";
import { useWeatherStore } from "@/src/store/weatherStore";
import { requestNotificationPermission } from "@/src/utils/notifications";
import { isPastOn, timeLabelOn } from "@/src/utils/scheduleText";
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
  const { startTab, setStartTab, fontSize, setFontSize } = useSettingsStore();
  const { user, signOut } = useAuthStore();
  const [importVisible, setImportVisible] = useState(false);
  const reloadSchedules = useScheduleStore((s) => s.reload);
  // 기기 캘린더에서 가져온 일정 수 — 0이면 '지우기' 줄을 숨긴다
  const [importedCount, setImportedCount] = useState(0);

  // 설정 창을 열 때와 가져오기 창을 닫은 직후에 다시 센다 (방금 가져온 일정이 반영되도록)
  useEffect(() => {
    if (!visible || importVisible) return;
    countImportedSchedules().then(setImportedCount).catch(() => setImportedCount(0));
  }, [visible, importVisible]);

  const handleClearImported = () => {
    Alert.alert(
      "가져온 일정 지우기",
      `캘린더에서 가져온 일정 ${importedCount}개를 모두 지울까요?

하루에서 직접 만든 일정과 폰의 캘린더 원본은 그대로 남아요. 가져온 뒤 하루에서 고친 내용은 함께 지워져요.`,
      [
        { text: "취소", style: "cancel" },
        {
          text: "지우기", style: "destructive",
          onPress: async () => {
            try {
              await deleteImportedSchedules();
              // 달력과 홈의 오늘 일정에서 바로 사라지도록 목록을 새로 읽는다
              await reloadSchedules();
              setImportedCount(0);
            } catch {
              Alert.alert("오류", "일정을 지우지 못했어요. 잠시 후 다시 시도해 주세요.");
            }
          },
        },
      ],
    );
  };

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

      {/* 글자 크기 — 고르는 즉시 모든 화면에 적용된다. 아래 미리보기로 바로 확인할 수 있다 */}
      <Text style={[settingStyles.sectionLabel, { color: colors.subtext }]}>글자 크기</Text>
      <View style={[settingStyles.segmentedControl, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
        {FONT_SIZE_OPTIONS.map((opt, i) => (
          <TouchableOpacity
            key={opt.value}
            style={[
              settingStyles.segment,
              settingStyles.segmentCompact,
              fontSize === opt.value && { backgroundColor: colors.tint },
              i < FONT_SIZE_OPTIONS.length - 1 && settingStyles.segmentBorder,
              i < FONT_SIZE_OPTIONS.length - 1 && { borderColor: colors.separator },
            ]}
            onPress={() => setFontSize(opt.value)}
            accessibilityState={{ selected: fontSize === opt.value }}
          >
            {/* 네 칸으로 나뉘어 폭이 좁다 — '아주 크게'가 잘리지 않도록 칸에 맞춰 줄인다 */}
            <Text
              style={[settingStyles.segmentLabel, { color: fontSize === opt.value ? "#fff" : colors.subtext }]}
              numberOfLines={1}
              adjustsFontSizeToFit
            >
              {opt.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
      <View style={[settingStyles.preview, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
        <Text style={[settingStyles.previewTitle, { color: colors.text }]}>점심 약속 · 12:30</Text>
        <Text style={[settingStyles.previewSub, { color: colors.subtext }]}>지출 12,000원 — 이 크기로 보여요</Text>
      </View>

      {/* 기기 캘린더에서 일정 가져오기 — 삼성 캘린더·Google 캘린더 등에 적어 둔 일정을 하루로 복사한다 */}
      <Text style={[settingStyles.sectionLabel, { color: colors.subtext }]}>일정</Text>
      <TouchableOpacity
        style={[settingStyles.listCard, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}
        onPress={() => setImportVisible(true)}
        accessibilityRole="button"
      >
        <View style={settingStyles.listRow}>
          <View style={settingStyles.listContent}>
            <Text style={[settingStyles.listLabel, { color: colors.text }]}>캘린더에서 일정 가져오기</Text>
            <Text style={[settingStyles.listSub, { color: colors.subtext }]}>폰의 캘린더 일정을 하루로 복사해요</Text>
          </View>
          <Text style={[settingStyles.listValue, { color: colors.subtext }]}>→</Text>
        </View>
      </TouchableOpacity>
      {/* 가져온 일정이 있을 때만 보인다 — 잘못 가져왔거나 처음 상태로 되돌리고 싶을 때 쓴다 */}
      {importedCount > 0 && (
        <TouchableOpacity
          style={[settingStyles.listCard, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}
          onPress={handleClearImported}
          accessibilityRole="button"
        >
          <View style={settingStyles.listRow}>
            <View style={settingStyles.listContent}>
              <Text style={[settingStyles.listLabel, { color: colors.expense }]}>가져온 일정 모두 지우기</Text>
              <Text style={[settingStyles.listSub, { color: colors.subtext }]}>
                가져온 일정 {importedCount}개 · 직접 만든 일정은 남아요
              </Text>
            </View>
          </View>
        </TouchableOpacity>
      )}
      {/* 설정 시트 안쪽에 둔다 — iOS는 나란히 놓인 두 창을 동시에 띄우지 못하고, 안쪽에 놓인 창만 위에 겹쳐 띄울 수 있다 */}
      <CalendarImportSheet visible={importVisible} onClose={() => setImportVisible(false)} colors={colors} />

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

// 수입 총액·지출 총액을 보여주고, 제목('9월 가계부 ▾')을 누르면 연·월을 골라 다른 달을 본다
function BudgetSummaryCard({
  year, month, income, expense, onPickMonth, colors,
}: {
  year: number; month: number;
  income: number; expense: number;
  onPickMonth: (year: number, month: number) => void;
  colors: typeof Colors.light;
}) {
  const [pickerVisible, setPickerVisible] = useState(false);
  const now = new Date();
  const isCurrent = year === now.getFullYear() && month === now.getMonth() + 1;

  // '자세히' → 가계부 탭. 가계부 탭은 홈 카드와 같은 달을 보므로 지금 고른 달의 내역이 바로 나온다
  const openDetail = () => router.push("/(tabs)/budget");

  return (
    <TouchableOpacity
      style={[styles.card, { backgroundColor: colors.card, borderColor: colors.cardBorder }, cardShadow]}
      onPress={openDetail}
      activeOpacity={0.75}
    >
      <View style={styles.cardHeader}>
        <View style={styles.monthNav}>
          {/* 일정 탭 상단처럼 제목을 누르면 연·월 선택 창 */}
          <TouchableOpacity
            onPress={() => setPickerVisible(true)}
            hitSlop={{ top: 10, bottom: 10, left: 6, right: 6 }}
            accessibilityLabel={`${year}년 ${month}월 가계부, 눌러서 다른 달 선택`}
          >
            <Text style={[styles.cardLabel, { color: colors.text }]}>
              {year === now.getFullYear() ? "" : `${year}년 `}{month}월 가계부{" "}
              <Text style={[styles.monthCaret, { color: colors.subtext }]}>▾</Text>
            </Text>
          </TouchableOpacity>
          {isCurrent && (
            <View style={[styles.thisMonthPill, { backgroundColor: colors.tintLight }]}>
              <Text style={[styles.thisMonthText, { color: colors.tint }]}>이번 달</Text>
            </View>
          )}
        </View>
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

      <DateJumpSheet
        visible={pickerVisible}
        onClose={() => setPickerVisible(false)}
        mode="month"
        selectedDate={`${year}-${String(month).padStart(2, "0")}-01`}
        onPickMonth={onPickMonth}
        colors={colors}
      />
    </TouchableOpacity>
  );
}

// ── 오늘 일정 카드 ────────────────────────────────────────────

/** 현재 시각 'HH:MM' — 30초마다 갱신해 일정이 끝나는 순간 화면에 반영되게 한다 */
function useNowHHMM(): string {
  const read = () => {
    const d = new Date();
    return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  };
  const [now, setNow] = useState(read);
  useEffect(() => {
    const id = setInterval(() => setNow(read()), 30_000);
    return () => clearInterval(id);
  }, []);
  return now;
}

function TodayScheduleCard({
  schedules, today, colors,
}: {
  schedules: ScheduleItem[];
  today: string;
  colors: typeof Colors.light;
}) {
  const preview = schedules.slice(0, 3);
  const now = useNowHHMM();

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
          {preview.map((s) => {
            // 끝난 일정은 완료한 할 일과 똑같이 가운데 줄 + 흐린 글씨
            const past = isPastOn(s, today, now);
            return (
            <View key={s.id} style={styles.scheduleItem}>
              <View style={[styles.scheduleDot, { backgroundColor: s.color || colors.tint }, past && styles.pastDot]} />
              <Text
                style={[styles.scheduleTitle, { color: past ? colors.subtext : colors.text }, past && styles.pastTitle]}
                numberOfLines={1}
              >
                {s.title}
              </Text>
              <Text style={[styles.scheduleTime, { color: colors.subtext }]}>
                {timeLabelOn(s, today)}
              </Text>
            </View>
            );
          })}
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
  const { todos, routines, isLoaded } = useTodoStore();
  // 추가·수정 시트 — open: 열림 여부, target: 수정할 항목 (없으면 새로 추가)
  const [sheet, setSheet] = useState<{ open: boolean; target?: TodoEditTarget }>({ open: false });

  const all = [...routines, ...todos];
  const doneCount = all.filter((t) => t.done).length;

  return (
    <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.cardBorder }, cardShadow]}>
      <View style={styles.cardHeader}>
        <View style={styles.todoHeaderLeft}>
          <Text style={[styles.cardLabel, { color: colors.subtext }]}>오늘 할 일</Text>
          {all.length > 0 && (
            <Text style={[styles.todoBadge, { color: colors.subtext }]}>
              {doneCount}/{all.length}
            </Text>
          )}
        </View>
        {/* 할 일·루틴·날짜 지정·중요 표시는 모두 추가 창에서 */}
        <TouchableOpacity
          onPress={() => setSheet({ open: true })}
          style={[styles.todoAddBtn, { backgroundColor: colors.tint }]}
          accessibilityLabel="할 일 추가"
        >
          <Text style={styles.todoAddText}>+ 추가</Text>
        </TouchableOpacity>
      </View>

      {isLoaded && all.length === 0 ? (
        <Text style={[styles.emptyText, { color: colors.subtext }]}>+ 추가로 할 일이나 루틴을 넣어 보세요.</Text>
      ) : (
        <TodoList
          todos={todos} routines={routines} date={todayString()} colors={colors}
          onEdit={(target) => setSheet({ open: true, target })}
        />
      )}

      {all.length > 0 && (
        <Text style={[styles.todoHint, { color: colors.subtext }]}>길게 눌러 수정·★ 중요 표시·삭제</Text>
      )}

      <TodoAddSheet
        visible={sheet.open}
        onClose={() => setSheet({ open: false })}
        editTarget={sheet.target}
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
  const { homeYear, homeMonth, homeIncome, homeExpense, loadHomeMonth } = useBudgetStore();
  const { todaySchedules, loadToday } = useScheduleStore();
  const { load: loadTodos } = useTodoStore();

  const [settingsVisible, setSettingsVisible] = useState(false);

  const lastActiveDateRef = useRef(todayString());

  useEffect(() => {
    const now = new Date();
    loadHomeMonth(now.getFullYear(), now.getMonth() + 1);
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
          // 날짜가 바뀌면(특히 새 달이 되면) 가계부 카드를 이번 달로 되돌린다
          const d = new Date();
          loadHomeMonth(d.getFullYear(), d.getMonth() + 1);
          loadToday();
          lastActiveDateRef.current = currentDate;
        }
      }
    });
    return () => sub.remove();
    // Zustand store 액션은 안정적 참조 — 의존성에 포함해도 무한 루프 없음
  }, [loadHomeMonth, loadToday, loadTodos]);

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
      <Text style={[styles.sectionLabel, { color: colors.subtext }]}>가계부</Text>
      <BudgetSummaryCard
        year={homeYear} month={homeMonth} income={homeIncome} expense={homeExpense} colors={colors}
        onPickMonth={loadHomeMonth}
      />

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
  monthNav: { flexDirection: "row", alignItems: "center", gap: 8 },
  monthCaret: { fontSize: 11 },
  thisMonthPill: { borderRadius: 8, paddingHorizontal: 6, paddingVertical: 2 },
  thisMonthText: { fontSize: 10, fontWeight: "700" },
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
  pastTitle: { textDecorationLine: "line-through" },
  pastDot: { opacity: 0.4 },
  moreText: { fontSize: 13, fontWeight: "500" },
  // ── 투두 ──────────────────────────────────────────────────
  todoBadge: { fontSize: 12 },
  todoHint: { fontSize: 11, marginTop: -4 },
  todoHeaderLeft: { flexDirection: "row", alignItems: "center", gap: 8 },
  todoAddBtn: { borderRadius: 14, paddingHorizontal: 12, paddingVertical: 5 },
  todoAddText: { color: "#fff", fontSize: 12, fontWeight: "700" },
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
  // 글자 크기 미리보기
  preview: { borderRadius: 12, borderWidth: 1, paddingHorizontal: 16, paddingVertical: 12, gap: 4 },
  previewTitle: { fontSize: 15, fontWeight: "600" },
  previewSub: { fontSize: 12 },
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
