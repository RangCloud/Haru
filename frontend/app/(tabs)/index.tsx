/**
 * 홈 화면
 * 큰 날짜 제목 + 날씨 한 줄 → 오늘 일정 → 할 일 → 월별 가계부 요약(제목을 눌러 연·월 선택)
 * 오른쪽 위 조절 아이콘 → 설정 시트 (테마·시작 화면·계정·로그아웃)
 *
 * 2026-11 리디자인(시안 1): 묶음 제목을 카드 밖으로 꺼내고, 카드 안은 얇은 구분선으로 나눈 목록으로 바꿨다.
 * 예전의 인사말·날씨 칩(이모지)은 날짜 제목과 '14°, 맑음' 글자 한 줄로 대신한다.
 */

import { router } from "expo-router";
import { useEffect, useRef, useState } from "react";
import {
  Alert,
  AppState,
  Linking,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { IconSymbol } from "@/components/ui/icon-symbol";
import { PRIVACY_POLICY_URL, SUPPORT_URL } from "@/constants/links";
import { Colors } from "@/constants/theme";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { Text } from "@/src/components/AppText";
import { BottomSheet } from "@/src/components/BottomSheet";
import { CalendarImportSheet } from "@/src/components/CalendarImportSheet";
import { ConfirmDialog } from "@/src/components/ConfirmDialog";
import { BudgetPeriodSheet } from "@/src/components/BudgetPeriodSheet";
import { TodoAddSheet, type TodoEditTarget } from "@/src/components/TodoAddSheet";
import { TodoList } from "@/src/components/TodoList";
import { countImportedSchedules, deleteImportedSchedules, type ScheduleItem } from "@/src/db/schedule";
import { type Transaction } from "@/src/db/budget";
import { useAuthStore } from "@/src/store/authStore";
import { useBudgetStore } from "@/src/store/budgetStore";
import { useScheduleStore } from "@/src/store/scheduleStore";
import { FONT_SIZE_OPTIONS, START_TAB_OPTIONS, useSettingsStore } from "@/src/store/settingsStore";
import { useThemeStore, type ThemeMode } from "@/src/store/themeStore";
import { useTodoStore } from "@/src/store/todoStore";
import { useWeatherStore } from "@/src/store/weatherStore";
import { formatRange, formatStartDay, periodOfDate, rangeDays, type DateRange } from "@/src/utils/budgetPeriod";
import { requestNotificationPermission } from "@/src/utils/notifications";
import { isPastOn, timeLabelOn } from "@/src/utils/scheduleText";
import { writeWidgetData } from "@/src/utils/widgetData";

// ── 유틸 ─────────────────────────────────────────────────────

/** 홈 제목 — '11월 9일 월요일'. 연도는 늘 올해라 생략한다 */
function formatToday(): string {
  const now = new Date();
  const days = ["일", "월", "화", "수", "목", "금", "토"];
  return `${now.getMonth() + 1}월 ${now.getDate()}일 ${days[now.getDay()]}요일`;
}

function todayString(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function formatAmount(n: number): string {
  return n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",") + "원";
}

// 테마는 라이트·다크 두 가지만 고른다 (피드백: 시스템 모드 삭제)
const THEME_LABEL: Record<ThemeMode, string> = { light: "라이트", dark: "다크" };
const THEME_ORDER: ThemeMode[] = ["light", "dark"];

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

  // 확인 창 — 모양은 시스템 확인 창과 같지만, iPhone·Android 모두 바깥을 눌러 닫을 수 있다 (ConfirmDialog)
  const [confirm, setConfirm] = useState<"clear" | "logout" | null>(null);
  const handleClearImported = () => setConfirm("clear");
  const handleSignOut = () => setConfirm("logout");

  const clearImported = async () => {
    try {
      await deleteImportedSchedules();
      // 달력과 홈의 오늘 일정에서 바로 사라지도록 목록을 새로 읽는다
      await reloadSchedules();
      setImportedCount(0);
    } catch {
      Alert.alert("오류", "일정을 지우지 못했어요. 잠시 후 다시 시도해 주세요.");
    }
  };

  const logout = async () => {
    onClose();
    await signOut();
    router.replace("/(auth)/login");
  };

  // 개인정보처리방침·고객 지원 페이지를 폰의 기본 브라우저(Safari·Chrome)로 연다 (심사 지침 5.1.1(i): 앱 안에서 방침을 열 수 있어야 한다).
  // 앱 안 브라우저(expo-web-browser)를 쓰지 않는 이유: 설정 시트(Modal)를 닫으면서 띄우면, 시트가 닫히는 애니메이션이
  // 끝나기 전에는 iOS가 새 창 띄우기를 거부해 아무 반응이 없었다(빌드 테스트에서 실제로 발생). 기본 브라우저는 창을 겹쳐
  // 띄우지 않으므로 시트를 연 채로 바로 열 수 있고, 돌아오면 설정 시트가 그대로 남아 있다.
  // 실패를 조용히 넘기지 않는다 — 열리지 않으면 주소를 보여 줘서 직접 열 수 있게 한다.
  const openPage = (url: string) => {
    Linking.openURL(url).catch(() => {
      Alert.alert("페이지를 열지 못했어요", `브라우저에서 아래 주소로 접속해 주세요.\n\n${url}`);
    });
  };

  return (
    // 공용 바텀시트 — 항목이 늘어도 상태바를 넘지 않고 시트 안에서 스크롤된다 (피드백 1번)
    <BottomSheet visible={visible} onClose={onClose} title="설정" colors={colors}>
      {/* 화면 테마 */}
      <Text style={[settingStyles.sectionLabel, { color: colors.subtext }]}>화면 테마</Text>
      <View style={[settingStyles.segmentedControl, { backgroundColor: colors.segment }]}>
        {THEME_ORDER.map((m) => (
          <TouchableOpacity
            key={m}
            style={[
              settingStyles.segment,
              mode === m && [settingStyles.segmentOn, { backgroundColor: colors.card }],
            ]}
            onPress={() => setMode(m)}
            accessibilityRole="button"
            accessibilityState={{ selected: mode === m }}
          >
            <Text style={[settingStyles.segmentLabel, mode === m ? [settingStyles.segmentLabelOn, { color: colors.text }] : { color: colors.subtext }]}>
              {THEME_LABEL[m]}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* 시작 화면 (피드백 17번) — 앱을 새로 켤 때 먼저 보여줄 탭 */}
      <Text style={[settingStyles.sectionLabel, { color: colors.subtext }]}>시작 화면</Text>
      <View style={[settingStyles.segmentedControl, { backgroundColor: colors.segment }]}>
        {START_TAB_OPTIONS.map((opt) => (
          <TouchableOpacity
            key={opt.value}
            style={[
              settingStyles.segment,
              settingStyles.segmentCompact,
              startTab === opt.value && [settingStyles.segmentOn, { backgroundColor: colors.card }],
            ]}
            onPress={() => setStartTab(opt.value)}
            accessibilityState={{ selected: startTab === opt.value }}
          >
            <Text style={[settingStyles.segmentLabel, startTab === opt.value ? [settingStyles.segmentLabelOn, { color: colors.text }] : { color: colors.subtext }]}>
              {opt.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
      <Text style={[settingStyles.hint, { color: colors.subtext }]}>앱을 다시 실행할 때부터 적용됩니다.</Text>

      {/* 글자 크기 — 고르는 즉시 모든 화면에 적용된다. 아래 미리보기로 바로 확인할 수 있다 */}
      <Text style={[settingStyles.sectionLabel, { color: colors.subtext }]}>글자 크기</Text>
      <View style={[settingStyles.segmentedControl, { backgroundColor: colors.segment }]}>
        {FONT_SIZE_OPTIONS.map((opt) => (
          <TouchableOpacity
            key={opt.value}
            style={[
              settingStyles.segment,
              settingStyles.segmentCompact,
              fontSize === opt.value && [settingStyles.segmentOn, { backgroundColor: colors.card }],
            ]}
            onPress={() => setFontSize(opt.value)}
            accessibilityState={{ selected: fontSize === opt.value }}
          >
            {/* 네 칸으로 나뉘어 폭이 좁다 — '아주 크게'가 잘리지 않도록 칸에 맞춰 줄인다 */}
            <Text
              style={[settingStyles.segmentLabel, fontSize === opt.value ? [settingStyles.segmentLabelOn, { color: colors.text }] : { color: colors.subtext }]}
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
      {/* 개인정보처리방침 — 데이터 삭제 요청 방법도 이 페이지와 지원 페이지에 있다 */}
      <TouchableOpacity
        style={[settingStyles.listCard, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}
        onPress={() => openPage(PRIVACY_POLICY_URL)}
        accessibilityRole="link"
      >
        <View style={settingStyles.listRow}>
          <Text style={[settingStyles.listLabel, settingStyles.listContent, { color: colors.text }]}>개인정보처리방침</Text>
          <Text style={[settingStyles.listValue, { color: colors.subtext }]}>→</Text>
        </View>
      </TouchableOpacity>
      <TouchableOpacity
        style={[settingStyles.listCard, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}
        onPress={() => openPage(SUPPORT_URL)}
        accessibilityRole="link"
      >
        <View style={settingStyles.listRow}>
          <View style={settingStyles.listContent}>
            <Text style={[settingStyles.listLabel, { color: colors.text }]}>고객 지원</Text>
            <Text style={[settingStyles.listSub, { color: colors.subtext }]}>문의 · 데이터 삭제 요청</Text>
          </View>
          <Text style={[settingStyles.listValue, { color: colors.subtext }]}>→</Text>
        </View>
      </TouchableOpacity>

      {/* 로그아웃 */}
      <TouchableOpacity
        style={[settingStyles.logoutBtn, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}
        onPress={handleSignOut}
      >
        <Text style={[settingStyles.logoutText, { color: colors.expense }]}>로그아웃</Text>
      </TouchableOpacity>

      {/* 확인 창(가운데 작은 창) — 설정 창 안쪽에 둬야 iOS에서 설정 창 위에 겹쳐 뜬다 */}
      <ConfirmDialog
        visible={confirm === "clear"}
        onClose={() => setConfirm(null)}
        title="가져온 일정 지우기"
        message={`캘린더에서 가져온 일정 ${importedCount}개를 모두 지울까요?\n\n하루에서 직접 만든 일정과 폰의 캘린더 원본은 그대로 남아요. 가져온 뒤 하루에서 고친 내용은 함께 지워져요.`}
        confirmLabel="지우기"
        onConfirm={clearImported}
        destructive
        colors={colors}
      />
      <ConfirmDialog
        visible={confirm === "logout"}
        onClose={() => setConfirm(null)}
        title="로그아웃"
        message="로그아웃할까요?"
        confirmLabel="로그아웃"
        onConfirm={logout}
        destructive
        colors={colors}
      />
    </BottomSheet>
  );
}

// ── 날씨 한 줄 ────────────────────────────────────────────────
// 시안 1: 날짜 제목 아래 '14°, 맑음'을 보조 글자로 적는다(예전 이모지 칩 대신).
// 위치 권한을 거부해 서울 날씨를 보여 줄 때만 앞에 '서울'을 붙인다 — 격자 방식이라 그 밖의 지역 이름은 알 수 없다.

function WeatherLine({ colors }: { colors: typeof Colors.light }) {
  const { current, isLoading, error, usingFallback, loadWeather } = useWeatherStore();

  // 한 번 받은 날씨 데이터는 로컬에도 보관 — Zustand 상태가 어떤 이유로든 초기화돼도 줄이 사라지지 않도록
  const [pinned, setPinned] = useState<typeof current>(null);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { loadWeather(); }, []);

  useEffect(() => {
    if (current) setPinned(current);
  }, [current]);

  // 표시에 쓸 데이터: 스토어 최신값 우선, 없으면 로컬에 고정된 값
  const display = current ?? pinned;

  // 로딩 중이고 아직 표시할 데이터가 없을 때
  if (isLoading && !display) {
    return <Text style={[styles.weatherLine, { color: colors.subtext }]}>날씨 불러오는 중…</Text>;
  }

  // 에러 발생 시: 이전에 받은 데이터가 있으면 그대로 표시, 없으면 다시 시도할 수 있게 한다
  if (error && !display) {
    return (
      <TouchableOpacity
        onPress={() => loadWeather(true)}
        hitSlop={{ top: 12, bottom: 12, left: 0, right: 12 }}
        accessibilityRole="button"
        accessibilityLabel="날씨를 불러오지 못했어요. 눌러서 다시 시도"
      >
        <Text style={[styles.weatherLine, { color: colors.subtext }]}>
          날씨를 불러오지 못했어요 · <Text style={{ color: colors.tint }}>다시 시도</Text>
        </Text>
      </TouchableOpacity>
    );
  }

  if (!display) return null;

  const condition = display.rain_type !== "없음" ? display.rain_type : display.sky;
  return (
    <Text style={[styles.weatherLine, { color: colors.subtext }]}>
      {usingFallback ? "서울 " : ""}{display.temp}°, {condition}
    </Text>
  );
}

// ── 가계부 요약 카드 ──────────────────────────────────────────

// 수입 총액·지출 총액을 보여주고, 제목('9월 가계부 ▾')을 누르면 기간 선택 창(월 단위·한 달 시작일·직접 선택)이 열린다
// 홈 카드에 보여 줄 오늘 내역 최대 줄 수 — 넘치면 "외 N건"으로 줄이고 가계부 탭에서 보게 한다
const TODAY_TX_LIMIT = 4;

function BudgetSummaryCard({
  year, month, range, custom, monthStartDay, income, expense, todayTransactions, onResetPeriod, colors,
}: {
  year: number; month: number;
  /** 실제로 보고 있는 날짜 범위 — 한 달 시작일이 1일이 아니거나 직접 고른 기간일 때 제목 아래에 보여 준다 */
  range: DateRange;
  /** 기간 직접 선택으로 고른 일회성 기간인지 */
  custom: boolean;
  monthStartDay: number;
  income: number; expense: number;
  /** 오늘 수입·지출 — 카드에서 다른 달을 보고 있어도 항상 오늘 것 */
  todayTransactions: Transaction[];
  /** '이번 달로' — 직접 고른 기간에서 오늘이 든 한 달로 돌아간다 */
  onResetPeriod: () => void;
  colors: typeof Colors.light;
}) {
  const [pickerVisible, setPickerVisible] = useState(false);
  const now = new Date();
  // '이번 달' 표시는 달력의 달이 아니라 오늘이 들어 있는 기간 기준 (시작일 25일이면 10/15는 '9월')
  const current = periodOfDate(todayString(), monthStartDay);
  const isCurrent = !custom && year === current.year && month === current.month;
  // 제목 아래 실제 날짜 — 1일 시작 한 달은 제목만으로 충분하므로 생략한다
  const subtitle = custom
    ? `직접 고른 기간 · ${rangeDays(range)}일`
    : monthStartDay !== 1 ? `${formatRange(range)} · ${formatStartDay(monthStartDay)} 시작` : null;

  const todayIncome = todayTransactions.filter((t) => t.type === "income").reduce((s, t) => s + t.amount, 0);
  const todayExpense = todayTransactions.filter((t) => t.type === "expense").reduce((s, t) => s + t.amount, 0);
  const shownToday = todayTransactions.slice(0, TODAY_TX_LIMIT);

  // '자세히' → 가계부 탭. 가계부 탭은 홈 카드와 같은 달을 보므로 지금 고른 달의 내역이 바로 나온다
  const openDetail = () => router.push("/(tabs)/budget");

  return (
    <>
      {/* 묶음 제목은 카드 밖 — 제목을 누르면 기간 선택, 오른쪽 '자세히'는 가계부 탭 */}
      <View style={styles.sectionHeader}>
        <View style={styles.monthNav}>
          {/* 일정 탭 상단처럼 제목을 누르면 기간 선택 창 */}
          <TouchableOpacity
            onPress={() => setPickerVisible(true)}
            hitSlop={{ top: 10, bottom: 10, left: 6, right: 6 }}
            accessibilityLabel={custom
              ? `${formatRange(range)} 가계부, 눌러서 다른 기간 선택`
              : `${year}년 ${month}월 가계부, 눌러서 다른 기간 선택`}
          >
            <View style={styles.monthTitleRow}>
              <Text style={[styles.sectionTitle, { color: colors.text }]}>
                {custom ? formatRange(range) : `${year === now.getFullYear() ? "" : `${year}년 `}${month}월 가계부`}{" "}
                <Text style={[styles.monthCaret, { color: colors.subtext }]}>▾</Text>
              </Text>
              {isCurrent && (
                <View style={[styles.thisMonthPill, { backgroundColor: colors.tintLight }]}>
                  <Text style={[styles.thisMonthText, { color: colors.tintStrong }]}>이번 달</Text>
                </View>
              )}
            </View>
            {subtitle && <Text style={[styles.periodSub, { color: colors.tint }]}>{subtitle}</Text>}
          </TouchableOpacity>
        </View>
        {/* 직접 고른 기간이면 '자세히' 대신 '이번 달로' — 카드 나머지 부분을 누르면 여전히 가계부 탭으로 간다 */}
        {custom ? (
          <TouchableOpacity onPress={onResetPeriod} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }} accessibilityRole="button">
            <Text style={[styles.sectionLink, { color: colors.tint }]}>이번 달로</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity onPress={openDetail} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }} accessibilityRole="link">
            <Text style={[styles.sectionLink, { color: colors.tint }]}>자세히</Text>
          </TouchableOpacity>
        )}
      </View>
      <TouchableOpacity
        style={[styles.card, styles.cardPadded, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}
        onPress={openDetail}
        activeOpacity={0.75}
      >
      <View style={styles.budgetRow}>
        <View style={styles.budgetItem}>
          <Text style={[styles.budgetCaption, { color: colors.subtext }]}>수입 총액</Text>
          <Text style={[styles.budgetValue, { color: colors.income }]}>{formatAmount(income)}</Text>
        </View>
        <View style={styles.budgetItem}>
          <Text style={[styles.budgetCaption, { color: colors.subtext }]}>지출 총액</Text>
          <Text style={[styles.budgetValue, { color: colors.expense }]}>{formatAmount(expense)}</Text>
        </View>
      </View>

      {/* 오늘 수입·지출 (피드백 3번) — 가계부 탭에 들어가지 않아도 오늘 쓴 내역을 바로 본다 */}
      <View style={[styles.todayTx, { borderTopColor: colors.separator }]}>
        <View style={styles.todayTxHead}>
          <Text style={[styles.todayTxTitle, { color: colors.subtext }]}>오늘 내역</Text>
          <View style={styles.todayTxSums}>
            {todayIncome > 0 && <Text style={[styles.todayTxSum, { color: colors.income }]}>+{formatAmount(todayIncome)}</Text>}
            {todayExpense > 0 && <Text style={[styles.todayTxSum, { color: colors.expense }]}>-{formatAmount(todayExpense)}</Text>}
          </View>
        </View>
        {todayTransactions.length === 0 ? (
          <Text style={[styles.todayTxEmpty, { color: colors.subtext }]}>오늘 기록한 수입·지출이 없어요</Text>
        ) : (
          <>
            {shownToday.map((t) => {
              const isIncome = t.type === "income";
              return (
                <View key={t.id} style={styles.todayTxRow}>
                  <Text style={[styles.todayTxCategory, { color: colors.subtext }]} numberOfLines={1}>{t.category}</Text>
                  <Text style={[styles.todayTxNote, { color: colors.text }]} numberOfLines={1}>{t.note || t.category}</Text>
                  <Text style={[styles.todayTxAmount, { color: isIncome ? colors.income : colors.expense }]}>
                    {isIncome ? "+" : "-"}{formatAmount(t.amount)}
                  </Text>
                </View>
              );
            })}
            {todayTransactions.length > shownToday.length && (
              <Text style={[styles.todayTxMore, { color: colors.subtext }]}>
                외 {todayTransactions.length - shownToday.length}건 · 자세히에서 모두 보기
              </Text>
            )}
          </>
        )}
      </View>

      </TouchableOpacity>
      <BudgetPeriodSheet visible={pickerVisible} onClose={() => setPickerVisible(false)} colors={colors} />
    </>
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

  const openSchedule = () => router.push("/(tabs)/schedule");

  return (
    <>
      <View style={styles.sectionHeader}>
        <Text style={[styles.sectionTitle, { color: colors.text }]}>오늘 일정</Text>
        <TouchableOpacity onPress={openSchedule} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }} accessibilityRole="link">
          <Text style={[styles.sectionLink, { color: colors.tint }]}>전체 보기</Text>
        </TouchableOpacity>
      </View>
      <TouchableOpacity
        style={[styles.card, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}
        onPress={openSchedule}
        activeOpacity={0.75}
      >
        {preview.length === 0 ? (
          <Text style={[styles.emptyText, { color: colors.subtext }]}>오늘 일정이 없습니다.</Text>
        ) : (
          <>
            {preview.map((s, i) => {
              // 끝난 일정은 완료한 할 일과 똑같이 가운데 줄 + 흐린 글씨
              const past = isPastOn(s, today, now);
              return (
                <View
                  key={s.id}
                  style={[styles.scheduleItem, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.separator }]}
                >
                  {/* 왼쪽 색 막대 — 일정 색. 끝난 일정은 막대도 흐리게 */}
                  <View style={[styles.scheduleBar, { backgroundColor: s.color || colors.tint }, past && styles.pastBar]} />
                  <Text style={[styles.scheduleTime, { color: colors.subtext }]}>{timeLabelOn(s, today)}</Text>
                  <Text
                    style={[styles.scheduleTitle, { color: past ? colors.subtext : colors.text }, past && styles.pastTitle]}
                    numberOfLines={1}
                  >
                    {s.title}
                  </Text>
                </View>
              );
            })}
            {schedules.length > 3 && (
              <View style={[styles.scheduleItem, { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.separator }]}>
                <Text style={[styles.moreText, { color: colors.tint }]}>+{schedules.length - 3}개 더 보기</Text>
              </View>
            )}
          </>
        )}
      </TouchableOpacity>
    </>
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
    <>
      <View style={styles.sectionHeader}>
        <View style={styles.todoHeaderLeft}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>할 일</Text>
          {all.length > 0 && (
            <Text style={[styles.todoBadge, { color: colors.subtext }]}>
              {doneCount}/{all.length}
            </Text>
          )}
        </View>
        {/* 할 일·루틴·날짜 지정·중요 표시는 모두 추가 창에서. 연한 파랑 보조 버튼(시안 1) */}
        <TouchableOpacity
          onPress={() => setSheet({ open: true })}
          style={[styles.addBtn, { backgroundColor: colors.tintLight }]}
          accessibilityRole="button"
          accessibilityLabel="할 일 추가"
        >
          <Text style={[styles.addBtnText, { color: colors.tintStrong }]}>추가</Text>
        </TouchableOpacity>
      </View>

      <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
        {isLoaded && all.length === 0 ? (
          <Text style={[styles.emptyText, { color: colors.subtext }]}>추가를 눌러 할 일이나 루틴을 넣어 보세요.</Text>
        ) : (
          <TodoList
            todos={todos} routines={routines} date={todayString()} colors={colors}
            onEdit={(target) => setSheet({ open: true, target })}
          />
        )}
      </View>

      {all.length > 0 && (
        <Text style={[styles.todoHint, { color: colors.subtext }]}>길게 눌러 수정·중요 표시·삭제</Text>
      )}

      <TodoAddSheet
        visible={sheet.open}
        onClose={() => setSheet({ open: false })}
        editTarget={sheet.target}
        colors={colors}
      />
    </>
  );
}

// ── 메인 화면 ─────────────────────────────────────────────────

export default function HomeScreen() {
  const scheme = useColorScheme();
  const colors = Colors[scheme];

  const insets = useSafeAreaInsets();
  // 홈은 항상 "이번 달·오늘" 기준 — 일정 탭에서 다른 달로 넘겨도 영향받지 않는 전용 값을 쓴다
  const {
    homeYear, homeMonth, homeRange, homeCustom, homeIncome, homeExpense, todayTransactions,
    loadCurrentPeriod, loadTodayTransactions,
  } = useBudgetStore();
  // 한 달 시작일은 저장소에서 읽어 오므로, 다 읽은 뒤에(settingsLoaded) 이번 달 기간을 다시 계산한다
  const { monthStartDay, isLoaded: settingsLoaded } = useSettingsStore();
  const { todaySchedules, loadToday } = useScheduleStore();
  const { load: loadTodos } = useTodoStore();

  const [settingsVisible, setSettingsVisible] = useState(false);

  const lastActiveDateRef = useRef(todayString());

  useEffect(() => {
    loadTodayTransactions();
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
          // 날짜가 바뀌면(특히 새 기간이 시작되면) 가계부 카드를 이번 달로 되돌린다
          loadCurrentPeriod();
          // 자정이 지나면 '오늘 내역'도 새 날짜 기준으로 다시 읽는다
          loadTodayTransactions();
          loadToday();
          lastActiveDateRef.current = currentDate;
        }
      }
    });
    return () => sub.remove();
    // Zustand store 액션은 안정적 참조 — 의존성에 포함해도 무한 루프 없음
  }, [loadCurrentPeriod, loadToday, loadTodayTransactions, loadTodos]);

  // 처음 켤 때 이번 달 기간을 불러온다 — 설정(한 달 시작일)을 읽기 전에 계산하면 1일 기준이 되므로 기다린다
  useEffect(() => {
    if (settingsLoaded) loadCurrentPeriod();
  }, [settingsLoaded, loadCurrentPeriod]);

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
          {/* 시안 1: 큰 날짜 제목 + 날씨 한 줄 (예전 인사말·날씨 칩 대신) */}
          <Text style={[styles.title, { color: colors.text }]} accessibilityRole="header">{formatToday()}</Text>
          <WeatherLine colors={colors} />
        </View>
        {/* 설정 — 이모지(⚙️) 대신 선 아이콘. 터치 영역 44×44 */}
        <TouchableOpacity
          onPress={() => setSettingsVisible(true)}
          style={styles.iconBtn}
          accessibilityRole="button"
          accessibilityLabel="설정"
        >
          <IconSymbol name="slider.horizontal.3" size={22} color={colors.text} />
        </TouchableOpacity>
      </View>

      {/* 오늘 일정을 최상단에 배치 — 당일 할 일을 가장 먼저 확인 */}
      <TodayScheduleCard schedules={todaySchedules} today={today} colors={colors} />
      <TodoCard colors={colors} />

      {/* 가계부 요약 — 일정·할 일보다 부차적인 정보 */}
      <BudgetSummaryCard
        year={homeYear} month={homeMonth} range={homeRange} custom={homeCustom} monthStartDay={monthStartDay}
        income={homeIncome} expense={homeExpense} colors={colors}
        todayTransactions={todayTransactions}
        onResetPeriod={loadCurrentPeriod}
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
  // 좌우 여백 20, 묶음 사이 간격은 sectionHeader의 marginTop으로 준다 (4/8 단위)
  content: { paddingHorizontal: 20, paddingBottom: 32 },
  // ── 헤더 ──────────────────────────────────────────────────
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 4,
  },
  headerLeft: { gap: 6, flex: 1, marginRight: 12 },
  title: { fontSize: 26, fontWeight: "700", letterSpacing: -0.5 },
  weatherLine: { fontSize: 14 },
  // 아이콘 버튼 — 터치 영역 44×44 (iOS 최소 기준). 오른쪽 여백만큼 바깥으로 빼서 아이콘이 글자 끝선에 맞게
  iconBtn: { width: 44, height: 44, alignItems: "center", justifyContent: "center", marginRight: -10, marginTop: -6 },
  // ── 묶음 제목 (카드 밖) ───────────────────────────────────
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 28,
    marginBottom: 10,
    minHeight: 36,
  },
  sectionTitle: { fontSize: 17, fontWeight: "700", letterSpacing: -0.2 },
  sectionLink: { fontSize: 14, fontWeight: "500" },
  // ── 카드(묶음 목록) — 그림자 없이 얇은 테두리, 안쪽은 구분선으로 나눈 줄 ──
  card: {
    borderRadius: 16,
    borderWidth: 1,
    paddingHorizontal: 16,
  },
  // 줄 목록이 아닌 카드(가계부 요약)는 위아래 여백을 준다
  cardPadded: { paddingVertical: 16, gap: 14 },
  monthNav: { flexDirection: "row", alignItems: "center", gap: 8, flexShrink: 1 },
  monthCaret: { fontSize: 12 },
  monthTitleRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  periodSub: { fontSize: 12, fontWeight: "500", marginTop: 2 },
  thisMonthPill: { borderRadius: 8, paddingHorizontal: 6, paddingVertical: 2 },
  thisMonthText: { fontSize: 11, fontWeight: "700" },
  emptyText: { fontSize: 14, paddingVertical: 16 },
  // ── 가계부 ────────────────────────────────────────────────
  // 시안 1: 두 칸 모두 왼쪽 정렬, 큰 금액. 색은 수입 초록 / 지출 빨강(사용자 요청)
  budgetRow: { flexDirection: "row" },
  budgetItem: { flex: 1, gap: 4 },
  budgetCaption: { fontSize: 13 },
  budgetValue: { fontSize: 20, fontWeight: "700", letterSpacing: -0.3, fontVariant: ["tabular-nums"] },
  // 오늘 내역 — 월 합계 아래에 가는 선으로 나눠 붙인다
  todayTx: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 12, gap: 10 },
  todayTxHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  todayTxTitle: { fontSize: 13, fontWeight: "600" },
  todayTxSums: { flexDirection: "row", gap: 8 },
  todayTxSum: { fontSize: 13, fontWeight: "700", fontVariant: ["tabular-nums"] },
  todayTxEmpty: { fontSize: 14 },
  todayTxRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  todayTxCategory: { fontSize: 13, width: 44 },
  todayTxNote: { flex: 1, fontSize: 15 },
  todayTxAmount: { fontSize: 15, fontWeight: "700", fontVariant: ["tabular-nums"] },
  todayTxMore: { fontSize: 13 },
  // ── 일정 ──────────────────────────────────────────────────
  // 한 줄: 색 막대 · 시간 · 제목 (줄 높이 48 이상)
  scheduleItem: { flexDirection: "row", alignItems: "center", gap: 12, minHeight: 48, paddingVertical: 12 },
  scheduleBar: { width: 3, height: 18, borderRadius: 2 },
  scheduleTime: { fontSize: 14, fontVariant: ["tabular-nums"], minWidth: 44 },
  scheduleTitle: { flex: 1, fontSize: 15 },
  pastTitle: { textDecorationLine: "line-through" },
  pastBar: { opacity: 0.4 },
  moreText: { fontSize: 14, fontWeight: "500" },
  // ── 할 일 ─────────────────────────────────────────────────
  todoBadge: { fontSize: 15 },
  todoHint: { fontSize: 12, marginTop: 8, marginLeft: 4 },
  todoHeaderLeft: { flexDirection: "row", alignItems: "center", gap: 6 },
  // 연한 파랑 보조 버튼
  addBtn: { borderRadius: 12, paddingHorizontal: 16, minHeight: 36, justifyContent: "center" },
  addBtnText: { fontSize: 14, fontWeight: "700" },
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
  // 시안 1 구간 선택: 회색 바탕 안에서 고른 칸만 흰 바탕(card)으로 떠 보이게 — 색뿐 아니라 '떠 있는 칸'과 굵은 글자로도 구분
  segmentedControl: {
    flexDirection: "row",
    borderRadius: 12,
    padding: 3,
  },
  segment: {
    flex: 1,
    minHeight: 40,
    paddingVertical: 10,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
  },
  segmentOn: {
    shadowColor: "#000",
    shadowOpacity: 0.08,
    shadowRadius: 2,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  segmentLabelOn: { fontWeight: "700" },
  // 시작 화면 선택은 아이콘 없이 글자만 — 높이를 줄인다
  segmentCompact: { paddingVertical: 8 },
  hint: { fontSize: 11, marginLeft: 4, marginTop: -2 },
  segmentLabel: { fontSize: 13, fontWeight: "500" },
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
