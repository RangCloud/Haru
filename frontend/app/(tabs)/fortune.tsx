/**
 * 운세 탭 — 생년월일 설정 후 오늘의 개인화 운세 표시
 *
 * 흐름:
 * 1. 생년월일 미설정 → 입력 폼 표시
 * 2. 생년월일 설정됨 → 오늘의 운세 표시 (하루 1회, 클라이언트+서버 이중 캐시)
 * 3. "다시 설정" 버튼으로 생년월일 초기화 가능 (AI 전송 동의도 함께 취소)
 *
 * AI 전송 동의 (App Store 심사 지침 5.1.2(i)):
 * - 생년월일을 Anthropic(Claude)로 보내기 전에 무엇을 어디로 보내는지 알리고 '동의'를 받는다
 * - 처음 입력할 때는 '운세 보기'를 누르면 동의 창이 뜨고, 동의해야 생년월일이 저장·전송된다
 * - 예전 빌드에서 생년월일을 저장해 둔 사용자는 동의 안내 화면을 거친다
 *
 * 신고 (Google Play AI 생성 콘텐츠 정책): 운세 결과 아래 '부적절한 내용 신고'로 앱을 나가지 않고 신고한다.
 *
 * 2026-11 리디자인(시안 1, 디자인만): 제목 + 날짜 → 생년월일 카드(오른쪽 '변경') → '총운' 카드.
 * 시안의 금전운·애정운·행운 항목은 서버가 운세를 한 덩어리 글로 보내므로 넣지 않았다(사용자 결정: 디자인만 변경).
 * 장식용 이모지(🔮·⚠️)는 빼고 글자로만 구성한다.
 */

import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Colors } from "@/constants/theme";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { reportFortune } from "@/src/api/fortune";
import { Text, TextInput } from "@/src/components/AppText";
import { ConfirmDialog } from "@/src/components/ConfirmDialog";
import { HourMinuteInput } from "@/src/components/TimeField";
import { type BirthInfo, useFortuneStore } from "@/src/store/fortuneStore";

// 동의 창 문구 — 무엇을(생년월일·태어난 시간), 어디로(하루 서버 → Anthropic, 미국), 왜(운세 생성) 보내는지,
// 보내지 않는 것과 거절했을 때 어떻게 되는지까지 한 번에 알린다. 개인정보처리방침의 국외 이전 항목과 내용을 맞춘다.
const AI_CONSENT_MESSAGE =
  "오늘의 운세는 AI가 만들어요.\n\n" +
  "입력한 생년월일과 태어난 시간을 하루 서버를 거쳐 Anthropic(미국)의 AI 'Claude'로 보내 운세를 생성해요. " +
  "이름·연락처 같은 다른 정보는 보내지 않아요.\n\n" +
  "동의하지 않아도 운세 외의 기능은 그대로 쓸 수 있어요. 생년월일을 다시 설정하면 동의도 취소돼요.";

/** '2026-11-09' → '11월 9일 월요일' (운세 화면 제목 아래 날짜) */
function formatFortuneDate(date: string): string {
  const [y, m, d] = date.split("-").map(Number);
  const days = ["일", "월", "화", "수", "목", "금", "토"];
  return `${m}월 ${d}일 ${days[new Date(y, m - 1, d).getDay()]}요일`;
}

/** 생년월일 한 줄 — '1995년 5월 20일 양력, 오전 7시 30분' (시를 모르면 날짜까지만) */
function formatBirth(info: BirthInfo): string {
  const base = `${info.year}년 ${info.month}월 ${info.day}일 ${info.monthType === "solar" ? "양력" : "음력"}`;
  if (info.hour === null) return base;
  const ampm = info.hour < 12 ? "오전" : "오후";
  const h12 = info.hour % 12 === 0 ? 12 : info.hour % 12;
  const minute = info.minute != null ? ` ${String(info.minute).padStart(2, "0")}분` : "";
  return `${base}, ${ampm} ${h12}시${minute}`;
}

// ── 생년월일 입력 폼 ───────────────────────────────────────────

function BirthInfoForm({
  colors,
  onSave,
}: {
  colors: typeof Colors.light;
  onSave: (info: BirthInfo) => void;
}) {
  const insets = useSafeAreaInsets();
  const [year, setYear] = useState("");
  const [month, setMonth] = useState("");
  const [monthType, setMonthType] = useState<"solar" | "lunar">("solar");
  const [day, setDay] = useState("");
  // 태어난 시·분 — 모르면 null. 분은 시를 정한 경우에만 의미가 있다
  const [hour, setHour] = useState<number | null>(null);
  const [minute, setMinute] = useState<number | null>(null);

  const handleSave = () => {
    const y = parseInt(year, 10);
    const m = parseInt(month, 10);
    const d = parseInt(day, 10);

    if (!year || isNaN(y) || y < 1900 || y > new Date().getFullYear()) {
      Alert.alert("입력 오류", "올바른 출생 연도를 입력해 주세요.");
      return;
    }
    if (!month || isNaN(m) || m < 1 || m > 12) {
      Alert.alert("입력 오류", "월은 1~12 사이로 입력해 주세요.");
      return;
    }
    if (!day || isNaN(d) || d < 1 || d > 31) {
      Alert.alert("입력 오류", "일은 1~31 사이로 입력해 주세요.");
      return;
    }

    // 시를 모르면 분도 보내지 않는다
    onSave({ year: y, month: m, monthType, day: d, hour, minute: hour === null ? null : minute });
  };

  return (
    <ScrollView
      style={{ backgroundColor: colors.background }}
      // 고정 72 대신 기기별 상태바·노치 높이 + 24 (피드백 1번)
      contentContainerStyle={[styles.formContainer, { paddingTop: insets.top + 24 }]}
      keyboardShouldPersistTaps="handled"
    >
      <Text style={[styles.formTitle, { color: colors.text }]} accessibilityRole="header">생년월일 설정</Text>
      <Text style={[styles.formSubtitle, { color: colors.subtext }]}>
        정확한 운세를 위해 생년월일을 입력해 주세요.{"\n"}한 번 설정하면 매일 자동으로 운세를 확인할 수 있어요.{"\n"}
        운세는 AI(Anthropic Claude)가 생성해요.
      </Text>

      {/* 연도 */}
      <View style={styles.fieldGroup}>
        <Text style={[styles.fieldLabel, { color: colors.subtext }]}>태어난 연도</Text>
        <TextInput
          style={[styles.input, { color: colors.text, backgroundColor: colors.card, borderColor: colors.cardBorder }]}
          placeholder="예) 1990"
          placeholderTextColor={colors.subtext}
          keyboardType="number-pad"
          maxLength={4}
          value={year}
          onChangeText={setYear}
        />
      </View>

      {/* 월 + 양력/음력 */}
      <View style={styles.fieldGroup}>
        <Text style={[styles.fieldLabel, { color: colors.subtext }]}>태어난 월</Text>
        <View style={styles.monthRow}>
          <TextInput
            style={[styles.input, styles.inputFlex, { color: colors.text, backgroundColor: colors.card, borderColor: colors.cardBorder }]}
            placeholder="예) 5"
            placeholderTextColor={colors.subtext}
            keyboardType="number-pad"
            maxLength={2}
            value={month}
            onChangeText={setMonth}
          />
          {/* 양력/음력 토글 */}
          {/* 양력/음력 — 회색 바탕 안에서 고른 칸만 흰 바탕 + 굵은 글자 (시안 1 구간 선택) */}
          <View style={[styles.toggleRow, { backgroundColor: colors.segment }]}>
            {(["solar", "lunar"] as const).map((type) => (
              <TouchableOpacity
                key={type}
                style={[
                  styles.toggleBtn,
                  monthType === type && [styles.toggleBtnOn, { backgroundColor: colors.card }],
                ]}
                onPress={() => setMonthType(type)}
                accessibilityRole="button"
                accessibilityState={{ selected: monthType === type }}
              >
                <Text style={[
                  styles.toggleText,
                  monthType === type ? { color: colors.text, fontWeight: "700" } : { color: colors.subtext },
                ]}>
                  {type === "solar" ? "양력" : "음력"}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      </View>

      {/* 일 */}
      <View style={styles.fieldGroup}>
        <Text style={[styles.fieldLabel, { color: colors.subtext }]}>태어난 일</Text>
        <TextInput
          style={[styles.input, { color: colors.text, backgroundColor: colors.card, borderColor: colors.cardBorder }]}
          placeholder="예) 15"
          placeholderTextColor={colors.subtext}
          keyboardType="number-pad"
          maxLength={2}
          value={day}
          onChangeText={setDay}
        />
      </View>

      {/* 태어난 시간 — 직접 입력하거나 ▾ 목록에서 고른다 (피드백 4번). 모르면 비워 둔다 */}
      <View style={styles.fieldGroup}>
        <View style={styles.timeHead}>
          <Text style={[styles.fieldLabel, { color: colors.subtext }]}>
            태어난 시간 (선택){hour === null ? " · 모름" : ""}
          </Text>
          {hour !== null && (
            <TouchableOpacity
              onPress={() => { setHour(null); setMinute(null); }}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              accessibilityRole="button"
            >
              <Text style={[styles.timeClear, { color: colors.tint }]}>모름으로</Text>
            </TouchableOpacity>
          )}
        </View>
        <HourMinuteInput
          hour={hour}
          minute={minute}
          minuteDisabled={hour === null}
          onChange={(h, m) => {
            // 분만 먼저 입력하면 시가 비어 있어 저장되지 않으므로, 분은 시를 정한 뒤에만 받는다
            setHour(h);
            setMinute(h === null ? null : m);
          }}
          colors={colors}
        />
        <Text style={[styles.timeHint, { color: colors.subtext }]}>시만 알면 분은 비워 두세요.</Text>
      </View>

      <TouchableOpacity
        style={[styles.saveBtn, { backgroundColor: colors.tint }]}
        onPress={handleSave}
        accessibilityRole="button"
      >
        <Text style={[styles.saveBtnText, { color: colors.onTint }]}>운세 보기</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

// ── 운세 카드 ────────────────────────────────────────────────

function FortuneCard({
  content,
  date,
  birthInfo,
  colors,
  onReset,
  onReport,
  reported,
}: {
  content: string;
  date: string;
  birthInfo: BirthInfo;
  colors: typeof Colors.light;
  onReset: () => void;
  onReport: () => void;
  reported: boolean; // 오늘 운세를 이미 신고했으면 버튼을 '신고 완료'로 바꾸고 막는다
}) {
  const insets = useSafeAreaInsets();

  return (
    <ScrollView
      style={{ backgroundColor: colors.background }}
      contentContainerStyle={[styles.fortuneContainer, { paddingTop: insets.top + 24 }]}
    >
      <View style={styles.fortuneHead}>
        <Text style={[styles.fortuneScreenTitle, { color: colors.text }]} accessibilityRole="header">오늘의 운세</Text>
        <Text style={[styles.fortuneDate, { color: colors.subtext }]}>{formatFortuneDate(date)}</Text>
      </View>

      {/* 생년월일 — 오른쪽 '변경'은 예전 '생년월일 다시 설정' 버튼과 같은 동작(확인 창 → 초기화) */}
      <View style={[styles.card, styles.birthCard, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
        <View style={styles.birthText}>
          <Text style={[styles.birthCaption, { color: colors.subtext }]}>생년월일</Text>
          <Text style={[styles.birthValue, { color: colors.text }]}>{formatBirth(birthInfo)}</Text>
        </View>
        <TouchableOpacity
          onPress={onReset}
          style={styles.changeBtn}
          accessibilityRole="button"
          accessibilityLabel="생년월일 변경"
        >
          <Text style={[styles.changeText, { color: colors.tint }]}>변경</Text>
        </TouchableOpacity>
      </View>

      {/* 총운 — 서버가 보낸 운세 글 전체 */}
      <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
        <Text style={[styles.fortuneSection, { color: colors.text }]}>총운</Text>
        <Text style={[styles.fortuneContent, { color: colors.text }]}>{content}</Text>
      </View>

      <Text style={[styles.fortuneHint, { color: colors.subtext }]}>
        재미로 보는 운세예요. 하루에 한 번 새로 나와요.
      </Text>

      {/* AI 결과 신고 — 자주 누를 버튼이 아니므로 테두리 없는 글자 버튼으로 맨 아래에 둔다.
          글자만 있어 작아 보이지만 minHeight로 누르는 영역은 48 이상을 지킨다 */}
      <TouchableOpacity
        style={styles.reportBtn}
        onPress={onReport}
        disabled={reported}
        accessibilityRole="button"
        accessibilityState={{ disabled: reported }}
      >
        <Text style={[styles.reportBtnText, { color: colors.subtext }]}>
          {reported ? "신고가 접수됐어요" : "부적절한 내용 신고"}
        </Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

// ── 메인 화면 ─────────────────────────────────────────────────

export default function FortuneScreen() {
  const scheme = useColorScheme();
  const colors = Colors[scheme];

  const {
    birthInfo, todayFortune, isLoading, error, aiConsent,
    loadBirthInfo, saveBirthInfo, clearBirthInfo, fetchTodayFortune, giveAiConsent,
  } = useFortuneStore();

  // AI 전송 동의 창 — pendingInfo: 입력 폼에서 '운세 보기'를 눌렀지만 아직 동의 전이라 저장하지 않은 생년월일.
  // 동의하기 전에는 생년월일을 기기에 저장하지도 않는다 (취소하면 입력 폼에 그대로 남아 있다).
  const [consentVisible, setConsentVisible] = useState(false);
  const [pendingInfo, setPendingInfo] = useState<BirthInfo | null>(null);

  const handleSaveBirth = (info: BirthInfo) => {
    if (aiConsent) {
      saveBirthInfo(info);
      return;
    }
    setPendingInfo(info);
    setConsentVisible(true);
  };

  const handleConsent = async () => {
    await giveAiConsent();
    if (pendingInfo) {
      // 처음 입력한 경우 — 저장과 동시에 운세를 받는다
      const info = pendingInfo;
      setPendingInfo(null);
      await saveBirthInfo(info);
    } else {
      // 예전 빌드에서 생년월일을 이미 저장한 경우 — 바로 운세를 받는다
      await fetchTodayFortune();
    }
  };

  const consentDialog = (
    <ConfirmDialog
      visible={consentVisible}
      onClose={() => setConsentVisible(false)}
      title="AI 운세 생성 안내"
      message={AI_CONSENT_MESSAGE}
      confirmLabel="동의"
      onConfirm={handleConsent}
      colors={colors}
    />
  );

  // 운세 신고 — 하루에 운세가 하나뿐이므로 '오늘 운세를 신고했는지'만 기억하면 된다 (날짜로 구분)
  const [reportVisible, setReportVisible] = useState(false);
  const [reportedDate, setReportedDate] = useState<string | null>(null);

  const handleReport = async () => {
    if (!todayFortune) return;
    try {
      await reportFortune(todayFortune.date, todayFortune.content);
      setReportedDate(todayFortune.date);
      Alert.alert("신고 완료", "알려 주셔서 고마워요. 신고 내용은 AI 운세를 다듬는 데 쓰여요.");
    } catch (e) {
      Alert.alert("신고 실패", e instanceof Error ? e.message : "잠시 후 다시 시도해 주세요.");
    }
  };

  const reportDialog = (
    <ConfirmDialog
      visible={reportVisible}
      onClose={() => setReportVisible(false)}
      title="이 운세 신고하기"
      message={"불쾌하거나 부적절한 내용이 있었나요?\n\n신고하면 이 운세 글이 하루 서버에 기록되어 AI 답변을 고치는 데 쓰여요. 생년월일은 함께 보내지 않아요."}
      confirmLabel="신고"
      onConfirm={handleReport}
      destructive
      colors={colors}
    />
  );

  // 앱 시작 / 탭 진입 시 SecureStore에서 저장된 생년월일 + 캐시 불러오기
  useEffect(() => {
    loadBirthInfo().then(() => {
      // 생년월일이 있고 오늘 운세가 없으면 fetch
      const { birthInfo: bi, todayFortune: tf } = useFortuneStore.getState();
      if (bi && !tf) fetchTodayFortune();
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 생년월일 초기화 확인 창 — 모양은 시스템 확인 창과 같지만, iPhone·Android 모두 바깥을 눌러 닫을 수 있다
  const [resetVisible, setResetVisible] = useState(false);
  const handleReset = () => setResetVisible(true);
  const resetSheet = (
    <ConfirmDialog
      visible={resetVisible}
      onClose={() => setResetVisible(false)}
      title="생년월일 초기화"
      message={"생년월일을 다시 설정하면 기존 운세가 초기화됩니다.\n계속할까요?"}
      confirmLabel="초기화"
      onConfirm={clearBirthInfo}
      destructive
      colors={colors}
    />
  );

  // 생년월일 미설정 → 입력 폼 (동의 창은 폼 위에 겹쳐 뜬다)
  if (!birthInfo) {
    return (
      <>
        <BirthInfoForm colors={colors} onSave={handleSaveBirth} />
        {consentDialog}
      </>
    );
  }

  // 로딩 중
  if (isLoading) {
    return (
      <View style={[styles.centered, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.tint} />
        <Text style={[styles.statusText, { color: colors.subtext }]}>운세를 불러오는 중...</Text>
      </View>
    );
  }

  // 오류
  if (error && !todayFortune) {
    return (
      <View style={[styles.centered, { backgroundColor: colors.background }]}>
        <Text style={[styles.errorText, { color: colors.text }]}>{error}</Text>
        <TouchableOpacity
          style={[styles.saveBtn, { backgroundColor: colors.tint, marginTop: 16 }]}
          onPress={fetchTodayFortune}
          accessibilityRole="button"
        >
          <Text style={[styles.saveBtnText, { color: colors.onTint }]}>다시 시도</Text>
        </TouchableOpacity>
        {/* 테두리 색을 꼭 준다 — 예전에는 색이 빠져 기본 검정 테두리로 보였다 */}
        <TouchableOpacity style={[styles.resetBtn, { borderColor: colors.cardBorder }]} onPress={handleReset} accessibilityRole="button">
          <Text style={[styles.resetBtnText, { color: colors.subtext }]}>생년월일 다시 설정</Text>
        </TouchableOpacity>
        {resetSheet}
      </View>
    );
  }

  // 운세 표시
  if (todayFortune) {
    return (
      <>
        <FortuneCard
          content={todayFortune.content}
          date={todayFortune.date}
          birthInfo={birthInfo}
          colors={colors}
          onReset={handleReset}
          onReport={() => setReportVisible(true)}
          reported={reportedDate === todayFortune.date}
        />
        {resetSheet}
        {reportDialog}
      </>
    );
  }

  // 생년월일은 저장돼 있지만 AI 전송 동의가 없는 경우 — 동의 기능이 생기기 전 빌드에서 입력한 사용자
  if (!aiConsent) {
    return (
      <View style={[styles.centered, { backgroundColor: colors.background }]}>
        <Text style={[styles.formTitle, { color: colors.text, textAlign: "center" }]}>운세를 받기 전에 확인해 주세요</Text>
        <Text style={[styles.formSubtitle, styles.centerText, { color: colors.subtext }]}>
          운세는 AI가 생성해요.{"\n"}생년월일을 어디로 보내는지 안내를 확인하고 동의하면{"\n"}오늘의 운세를 볼 수 있어요.
        </Text>
        <TouchableOpacity
          style={[styles.saveBtn, { backgroundColor: colors.tint }]}
          onPress={() => setConsentVisible(true)}
          accessibilityRole="button"
        >
          <Text style={[styles.saveBtnText, { color: colors.onTint }]}>안내 보기</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.resetBtn, { borderColor: colors.cardBorder }]} onPress={handleReset} accessibilityRole="button">
          <Text style={[styles.resetBtnText, { color: colors.subtext }]}>생년월일 다시 설정</Text>
        </TouchableOpacity>
        {consentDialog}
        {resetSheet}
      </View>
    );
  }

  // 생년월일은 있지만 운세가 없는 경우 (최초 fetch 트리거)
  return (
    <View style={[styles.centered, { backgroundColor: colors.background }]}>
      <ActivityIndicator size="large" color={colors.tint} />
    </View>
  );
}

const styles = StyleSheet.create({
  centered: { flex: 1, justifyContent: "center", alignItems: "center", gap: 12, padding: 24 },
  statusText: { fontSize: 14, textAlign: "center" },
  errorText: { fontSize: 15, textAlign: "center", lineHeight: 24 },
  // ── 입력 폼 ── (시안 1: 다른 화면처럼 왼쪽 정렬 제목)
  formContainer: {
    paddingHorizontal: 20,
    paddingBottom: 32,
    gap: 4,
  },
  formTitle: { fontSize: 26, fontWeight: "700", letterSpacing: -0.5 },
  formSubtitle: { fontSize: 14, lineHeight: 22, marginTop: 4, marginBottom: 12 },
  centerText: { textAlign: "center" },
  fieldGroup: { width: "100%", gap: 6, marginTop: 12 },
  fieldLabel: { fontSize: 13, fontWeight: "600" },
  input: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    width: "100%",
  },
  inputFlex: { flex: 1, width: undefined },
  monthRow: { flexDirection: "row", gap: 10, alignItems: "center" },
  // 양력/음력 구간 선택 — 회색 바탕 + 고른 칸만 흰 바탕
  toggleRow: {
    flexDirection: "row",
    borderRadius: 12,
    padding: 3,
  },
  toggleBtn: { paddingHorizontal: 16, minHeight: 44, borderRadius: 9, justifyContent: "center" },
  toggleBtnOn: {
    shadowColor: "#000", shadowOpacity: 0.08, shadowRadius: 2, shadowOffset: { width: 0, height: 1 }, elevation: 1,
  },
  toggleText: { fontSize: 14, fontWeight: "500" },
  timeHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  timeClear: { fontSize: 13, fontWeight: "600" },
  timeHint: { fontSize: 12 },
  saveBtn: {
    width: "100%",
    minHeight: 52,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 20,
  },
  saveBtnText: { fontSize: 16, fontWeight: "700" },
  // ── 운세 화면 ─────────────────────────────────────────────────
  fortuneContainer: { paddingHorizontal: 20, paddingBottom: 32, gap: 12 },
  fortuneHead: { gap: 6, marginBottom: 8 },
  fortuneScreenTitle: { fontSize: 26, fontWeight: "700", letterSpacing: -0.5 },
  fortuneDate: { fontSize: 14 },
  // 묶음 카드 — 그림자 없이 얇은 테두리
  card: { borderRadius: 16, borderWidth: 1, padding: 16, gap: 8 },
  birthCard: { flexDirection: "row", alignItems: "center", paddingVertical: 12 },
  birthText: { flex: 1, gap: 3 },
  birthCaption: { fontSize: 13 },
  birthValue: { fontSize: 15, fontWeight: "500" },
  // '변경' 글자 버튼 — 터치 영역 44
  changeBtn: { minWidth: 44, minHeight: 44, alignItems: "flex-end", justifyContent: "center" },
  changeText: { fontSize: 15, fontWeight: "600" },
  fortuneSection: { fontSize: 17, fontWeight: "700" },
  fortuneContent: { fontSize: 16, lineHeight: 27 },
  fortuneHint: {
    fontSize: 13,
    textAlign: "center",
    lineHeight: 20,
    marginTop: 4,
  },
  resetBtn: {
    marginTop: 8,
    minHeight: 44,
    paddingHorizontal: 24,
    borderWidth: 1,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  resetBtnText: { fontSize: 14 },
  reportBtn: { minHeight: 48, alignItems: "center", justifyContent: "center" },
  reportBtnText: { fontSize: 13, textDecorationLine: "underline" },
});
