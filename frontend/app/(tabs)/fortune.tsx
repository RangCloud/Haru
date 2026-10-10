/**
 * 운세 탭 — 생년월일 설정 후 오늘의 개인화 운세 표시
 *
 * 흐름:
 * 1. 생년월일 미설정 → 입력 폼 표시
 * 2. 생년월일 설정됨 → 오늘의 운세 표시 (하루 1회, 클라이언트+서버 이중 캐시)
 * 3. "다시 설정" 버튼으로 생년월일 초기화 가능
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

import { Colors, cardShadow } from "@/constants/theme";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { ActionSheet } from "@/src/components/ActionSheet";
import { Text, TextInput } from "@/src/components/AppText";
import { HourMinuteInput } from "@/src/components/TimeField";
import { type BirthInfo, useFortuneStore } from "@/src/store/fortuneStore";

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
      <Text style={styles.formEmoji}>🔮</Text>
      <Text style={[styles.formTitle, { color: colors.text }]}>생년월일 설정</Text>
      <Text style={[styles.formSubtitle, { color: colors.subtext }]}>
        정확한 운세를 위해 생년월일을 입력해 주세요.{"\n"}한 번 설정하면 매일 자동으로 운세를 확인할 수 있어요.
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
          <View style={[styles.toggleRow, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
            {(["solar", "lunar"] as const).map((type) => (
              <TouchableOpacity
                key={type}
                style={[
                  styles.toggleBtn,
                  monthType === type && { backgroundColor: colors.tint },
                ]}
                onPress={() => setMonthType(type)}
              >
                <Text style={[
                  styles.toggleText,
                  { color: monthType === type ? "#fff" : colors.subtext },
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
      >
        <Text style={styles.saveBtnText}>운세 보기</Text>
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
}: {
  content: string;
  date: string;
  birthInfo: BirthInfo;
  colors: typeof Colors.light;
  onReset: () => void;
}) {
  const insets = useSafeAreaInsets();
  const monthTypeLabel = birthInfo.monthType === "solar" ? "양력" : "음력";
  const hourLabel = birthInfo.hour === null
    ? ""
    : birthInfo.minute != null
      ? `${birthInfo.hour}시 ${String(birthInfo.minute).padStart(2, "0")}분생`
      : `${birthInfo.hour}시생`;
  const birthLabel = `${birthInfo.year}년 ${birthInfo.month}월(${monthTypeLabel}) ${birthInfo.day}일${hourLabel ? " " + hourLabel : ""}`;

  return (
    <ScrollView
      style={{ backgroundColor: colors.background }}
      contentContainerStyle={[styles.fortuneContainer, { paddingTop: insets.top + 24 }]}
    >
      <Text style={[styles.fortuneScreenTitle, { color: colors.text }]}>오늘의 운세 🔮</Text>
      <Text style={[styles.fortuneBirthLabel, { color: colors.subtext }]}>{birthLabel}</Text>

      <View style={[styles.fortuneCard, { backgroundColor: colors.tintLight, borderColor: colors.cardBorder }, cardShadow]}>
        <Text style={[styles.fortuneContent, { color: colors.text }]}>{content}</Text>
        <Text style={[styles.fortuneMeta, { color: colors.subtext }]}>{date} 기준</Text>
      </View>

      <Text style={[styles.fortuneHint, { color: colors.subtext }]}>
        오늘의 운세는 하루에 한 번만 생성됩니다.{"\n"}내일 다시 방문하면 새로운 운세를 볼 수 있어요.
      </Text>

      <TouchableOpacity
        style={[styles.resetBtn, { borderColor: colors.cardBorder }]}
        onPress={onReset}
      >
        <Text style={[styles.resetBtnText, { color: colors.subtext }]}>생년월일 다시 설정</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

// ── 메인 화면 ─────────────────────────────────────────────────

export default function FortuneScreen() {
  const scheme = useColorScheme();
  const colors = Colors[scheme];

  const { birthInfo, todayFortune, isLoading, error, loadBirthInfo, saveBirthInfo, clearBirthInfo, fetchTodayFortune } =
    useFortuneStore();

  // 앱 시작 / 탭 진입 시 SecureStore에서 저장된 생년월일 + 캐시 불러오기
  useEffect(() => {
    loadBirthInfo().then(() => {
      // 생년월일이 있고 오늘 운세가 없으면 fetch
      const { birthInfo: bi, todayFortune: tf } = useFortuneStore.getState();
      if (bi && !tf) fetchTodayFortune();
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 생년월일 초기화 확인 창 — iPhone·Android 모두 바깥을 눌러 닫을 수 있도록 선택 창을 쓴다
  const [resetVisible, setResetVisible] = useState(false);
  const handleReset = () => setResetVisible(true);
  const resetSheet = (
    <ActionSheet
      visible={resetVisible}
      onClose={() => setResetVisible(false)}
      title="생년월일 초기화"
      message="생년월일을 다시 설정하면 기존 운세가 초기화됩니다. 계속할까요?"
      actions={[{ label: "초기화", onPress: clearBirthInfo, destructive: true }]}
      colors={colors}
    />
  );

  // 생년월일 미설정 → 입력 폼
  if (!birthInfo) {
    return <BirthInfoForm colors={colors} onSave={saveBirthInfo} />;
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
        <Text style={{ fontSize: 40 }}>⚠️</Text>
        <Text style={[styles.errorText, { color: colors.text }]}>{error}</Text>
        <TouchableOpacity
          style={[styles.saveBtn, { backgroundColor: colors.tint, marginTop: 16 }]}
          onPress={fetchTodayFortune}
        >
          <Text style={styles.saveBtnText}>다시 시도</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.resetBtn} onPress={handleReset}>
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
        />
        {resetSheet}
      </>
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
  // ── 입력 폼 ──────────────────────────────────────────────────
  formContainer: {
    padding: 24,
    alignItems: "center",
    gap: 4,
  },
  formEmoji: { fontSize: 64, marginBottom: 8 },
  formTitle: { fontSize: 24, fontWeight: "700", letterSpacing: -0.5 },
  formSubtitle: { fontSize: 14, textAlign: "center", lineHeight: 22, marginBottom: 16 },
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
  toggleRow: {
    flexDirection: "row",
    borderWidth: 1,
    borderRadius: 10,
    overflow: "hidden",
  },
  toggleBtn: { paddingHorizontal: 14, paddingVertical: 14 },
  toggleText: { fontSize: 14, fontWeight: "600" },
  timeHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  timeClear: { fontSize: 12, fontWeight: "600" },
  timeHint: { fontSize: 11 },
  saveBtn: {
    width: "100%",
    paddingVertical: 16,
    borderRadius: 14,
    alignItems: "center",
    marginTop: 20,
  },
  saveBtnText: { color: "#fff", fontSize: 16, fontWeight: "700" },
  // ── 운세 카드 ─────────────────────────────────────────────────
  fortuneContainer: { padding: 24, gap: 12 },
  fortuneScreenTitle: { fontSize: 28, fontWeight: "700", letterSpacing: -0.5 },
  fortuneBirthLabel: { fontSize: 13, marginBottom: 4 },
  fortuneCard: {
    borderRadius: 20,
    borderWidth: 1,
    padding: 24,
    gap: 12,
  },
  fortuneContent: { fontSize: 16, lineHeight: 28 },
  fortuneMeta: { fontSize: 12 },
  fortuneHint: {
    fontSize: 13,
    textAlign: "center",
    lineHeight: 20,
    marginTop: 8,
  },
  resetBtn: {
    marginTop: 8,
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderWidth: 1,
    borderRadius: 12,
    alignItems: "center",
  },
  resetBtnText: { fontSize: 14 },
});
