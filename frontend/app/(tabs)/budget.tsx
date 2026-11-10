/**
 * 가계부 탭
 *
 * 한 달(또는 직접 고른 기간)의 수입·지출 내역만 모아 보는 화면.
 * - 홈 가계부 카드와 같은 기간을 본다 (홈에서 8월을 고르고 '자세히'를 누르면 8월 내역이 나온다)
 * - 한 달은 설정한 '한 달 시작일'을 따른다 (10일 시작 → 10월 = 10월 10일 ~ 11월 9일)
 * - 상단 '2026년 9월 ▾'를 누르면 기간 선택 창, '이번 달'로 바로 복귀
 * - 수입 총액·지출 총액 요약, 전체/수입/지출 필터, 날짜별 묶음 + 그날 합계
 * - 거래 추가(지출·수입), 길게 눌러 수정·삭제
 * - 날짜별 지출 달력: 많이 쓴 날일수록 칸이 진해지고, 날짜를 누르면 아래 내역이 그날로 좁혀진다
 * - 달력 카드의 '소비 분석'을 누르면 주·달·년 단위 분석 화면으로 이동
 * 모든 데이터는 기기 로컬 SQLite에만 저장 (외부 전송 없음, CLAUDE.md §4).
 *
 * 2026-11 리디자인(시안 1): 그림자 없는 묶음 카드, 회색 바탕 구간 선택, 날짜마다 카드 하나.
 * 수입·지출은 금액·추가 버튼 모두 초록/빨강으로 맞춰 한눈에 구분한다(사용자 요청).
 */

import { router } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { ScrollView, StyleSheet, TouchableOpacity, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Colors } from "@/constants/theme";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { Text } from "@/src/components/AppText";
import { BudgetModal, formatAmount, TransactionRow } from "@/src/components/BudgetModal";
import { BudgetPeriodSheet } from "@/src/components/BudgetPeriodSheet";
import { SpendingHeatCalendar } from "@/src/components/SpendingHeatCalendar";
import { type Transaction } from "@/src/db/budget";
import { useBudgetStore } from "@/src/store/budgetStore";
import { useSettingsStore } from "@/src/store/settingsStore";
import { formatRange, periodOfDate } from "@/src/utils/budgetPeriod";
import { formatMonthDay, todayString } from "@/src/utils/date";

type Filter = "all" | "income" | "expense";
const FILTERS: { value: Filter; label: string }[] = [
  { value: "all", label: "전체" },
  { value: "income", label: "수입" },
  { value: "expense", label: "지출" },
];

export default function BudgetScreen() {
  const colors = Colors[useColorScheme() ?? "light"];
  const insets = useSafeAreaInsets();
  const {
    homeYear: year, homeMonth: month, homeRange, homeCustom, homeIncome, homeExpense, homeTransactions,
    loadHomeMonth, loadHomeRange, loadCurrentPeriod, add, update, remove,
  } = useBudgetStore();
  const monthStartDay = useSettingsStore((s) => s.monthStartDay);

  const [filter, setFilter] = useState<Filter>("all");
  const [pickerVisible, setPickerVisible] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [modalType, setModalType] = useState<"income" | "expense">("expense");
  const [editing, setEditing] = useState<Transaction | undefined>();
  // 지출 달력에서 고른 날짜 — null이면 한 달 전체 내역을 보여 준다
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  // 탭에 들어올 때 지금 보고 있는 기간을 새로 읽는다 (다른 탭에서 거래가 바뀌었을 수 있음)
  useEffect(() => {
    if (homeCustom) loadHomeRange(homeRange);
    else loadHomeMonth(year, month);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 다른 기간으로 넘어가면 고른 날짜는 의미가 없어지므로 푼다
  useEffect(() => {
    setSelectedDate(null);
  }, [homeRange]);

  const today = todayString();
  // '이번 달'은 오늘이 들어 있는 기간 (시작일 25일이면 10월 15일은 '9월' 기간)
  const current = periodOfDate(today, monthStartDay);
  const isCurrent = !homeCustom && year === current.year && month === current.month;
  const todayInRange = today >= homeRange.start && today <= homeRange.end;
  // 헤더 아래 실제 날짜 — 1일 시작 한 달은 제목만으로 충분하므로 생략한다
  const rangeText = homeCustom || monthStartDay !== 1 ? formatRange(homeRange) : null;

  // 달력 색칠용 날짜별 지출 합계 — 수입/지출 필터와 상관없이 항상 지출만 센다
  const expenseByDate = useMemo(() => {
    const map: Record<string, number> = {};
    for (const t of homeTransactions) {
      if (t.type === "expense") map[t.date] = (map[t.date] ?? 0) + t.amount;
    }
    return map;
  }, [homeTransactions]);

  // 필터(전체/수입/지출)와 달력에서 고른 날짜를 적용한 뒤 날짜별로 묶는다
  // — DB가 최신 날짜순으로 주므로 순서는 그대로 유지된다
  const groups = useMemo(() => {
    const list = homeTransactions.filter(
      (t) => (filter === "all" || t.type === filter) && (selectedDate === null || t.date === selectedDate),
    );
    const map = new Map<string, Transaction[]>();
    for (const t of list) {
      const arr = map.get(t.date) ?? [];
      arr.push(t);
      map.set(t.date, arr);
    }
    return [...map.entries()];
  }, [homeTransactions, filter, selectedDate]);

  // 새 거래 기본 날짜: 달력에서 고른 날 → 오늘이 기간 안이면 오늘 → 아니면 기간 첫날
  const defaultDate = selectedDate ?? (todayInRange ? today : homeRange.start);

  const openAdd = (type: "income" | "expense") => {
    setEditing(undefined);
    setModalType(type);
    setModalVisible(true);
  };

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      {/* 월 헤더 — 일정 탭과 같은 위치·모양. 누르면 기간 선택 */}
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <TouchableOpacity
          onPress={() => setPickerVisible(true)}
          style={styles.headerTitle}
          accessibilityLabel={`${homeCustom ? "직접 고른 기간" : `${year}년 ${month}월`}${rangeText ? `, ${rangeText}` : ""}, 눌러서 다른 기간 선택`}
        >
          <Text style={[styles.monthLabel, { color: colors.text }]}>
            {homeCustom ? "직접 고른 기간" : `${year}년 ${month}월`} <Text style={[styles.caret, { color: colors.subtext }]}>▾</Text>
          </Text>
          {rangeText && <Text style={[styles.rangeLabel, { color: colors.tint }]}>{rangeText}</Text>}
        </TouchableOpacity>
        {/* 이번 달 — 시안 1처럼 테두리 없는 글자 버튼. 이미 이번 달이면 흐리게 */}
        <TouchableOpacity
          onPress={loadCurrentPeriod}
          disabled={isCurrent}
          style={[styles.thisMonthBtn, { opacity: isCurrent ? 0.4 : 1 }]}
          accessibilityRole="button"
          accessibilityLabel="이번 달로 이동"
        >
          <Text style={[styles.thisMonthText, { color: colors.tint }]}>이번 달</Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {/* 요약 — 홈 카드와 같은 구성 */}
        <View style={[styles.summary, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
          <View style={styles.summaryItem}>
            <Text style={[styles.summaryCaption, { color: colors.subtext }]}>수입 총액</Text>
            <Text style={[styles.summaryValue, { color: colors.income }]}>{formatAmount(homeIncome)}</Text>
          </View>
          <View style={styles.summaryItem}>
            <Text style={[styles.summaryCaption, { color: colors.subtext }]}>지출 총액</Text>
            <Text style={[styles.summaryValue, { color: colors.expense }]}>{formatAmount(homeExpense)}</Text>
          </View>
        </View>

        {/* 날짜별 지출 달력 — 많이 쓴 날이 진하게 보인다. 소비 분석 진입도 이 카드에 둔다 */}
        <View style={[styles.calendarCard, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
          <View style={styles.calendarHeader}>
            <Text style={[styles.calendarTitle, { color: colors.text }]}>날짜별 지출</Text>
            <TouchableOpacity
              onPress={() => router.push("/budget-insight")}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              accessibilityRole="button"
              accessibilityLabel="소비 분석 보기"
            >
              <Text style={[styles.calendarLink, { color: colors.tint }]}>소비 분석</Text>
            </TouchableOpacity>
          </View>
          <SpendingHeatCalendar
            range={homeRange}
            expenseByDate={expenseByDate}
            selectedDate={selectedDate}
            today={today}
            onSelectDate={setSelectedDate}
            colors={colors}
          />
          {selectedDate && (
            <TouchableOpacity onPress={() => setSelectedDate(null)} accessibilityRole="button">
              <Text style={[styles.calendarReset, { color: colors.tint }]}>
                {formatMonthDay(selectedDate)} 내역만 보는 중 · {homeCustom ? "기간 전체 보기" : "한 달 전체 보기"}
              </Text>
            </TouchableOpacity>
          )}
        </View>

        {/* 필터 + 추가 버튼 */}
        <View style={styles.toolbar}>
          {/* 구간 선택(시안 1): 회색 바탕 안에서 고른 칸만 흰 바탕 + 굵은 글자 — 색만으로 구분하지 않는다 */}
          <View style={[styles.segment, { backgroundColor: colors.segment }]}>
            {FILTERS.map((f) => {
              const on = f.value === filter;
              return (
                <TouchableOpacity
                  key={f.value}
                  onPress={() => setFilter(f.value)}
                  style={[styles.segmentBtn, on && [styles.segmentBtnOn, { backgroundColor: colors.card }]]}
                  accessibilityRole="button"
                  accessibilityState={{ selected: on }}
                >
                  <Text style={[styles.segmentText, on ? { color: colors.text, fontWeight: "700" } : { color: colors.subtext }]}>{f.label}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
          {/* 추가 버튼 — 지출 빨강 / 수입 초록으로 한눈에 구분(사용자 요청). 글자는 onTint(라이트 흰색·다크 진한색) */}
          <View style={styles.addGroup}>
            <TouchableOpacity onPress={() => openAdd("expense")} style={[styles.addBtn, { backgroundColor: colors.expense }]} accessibilityRole="button">
              <Text style={[styles.addText, { color: colors.onTint }]}>지출 추가</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => openAdd("income")} style={[styles.addBtn, { backgroundColor: colors.income }]} accessibilityRole="button">
              <Text style={[styles.addText, { color: colors.onTint }]}>수입 추가</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* 날짜별 내역 */}
        {groups.length === 0 ? (
          <View style={styles.empty}>
            <Text style={[styles.emptyText, { color: colors.subtext }]}>
              {/* 달력에서 날짜를 골랐으면 "10월 9일 (금)", 아니면 "10월"·"이 기간" 기준으로 안내한다 */}
              {selectedDate ? formatMonthDay(selectedDate) : homeCustom ? "이 기간" : `${month}월`}
              {filter === "all" ? " 내역이 없습니다." : ` ${filter === "income" ? "수입" : "지출"} 내역이 없습니다.`}
            </Text>
            <Text style={[styles.emptyHint, { color: colors.subtext }]}>지출 추가 · 수입 추가 버튼으로 넣을 수 있어요</Text>
          </View>
        ) : (
          groups.map(([date, items]) => {
            const dayIncome = items.filter((t) => t.type === "income").reduce((s, t) => s + t.amount, 0);
            const dayExpense = items.filter((t) => t.type === "expense").reduce((s, t) => s + t.amount, 0);
            return (
              // 날짜마다 묶음 카드 하나 — 맨 위 줄에 날짜와 그날 합계, 아래로 거래 줄
              <View key={date} style={[styles.group, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
                <View style={[styles.groupHeader, { borderBottomColor: colors.separator }]}>
                  <Text style={[styles.groupDate, { color: colors.subtext }]}>
                    {formatMonthDay(date)}{date === today ? " · 오늘" : ""}
                  </Text>
                  <View style={styles.groupSum}>
                    {dayIncome > 0 && <Text style={[styles.groupSumText, { color: colors.income }]}>+{formatAmount(dayIncome)}</Text>}
                    {dayExpense > 0 && <Text style={[styles.groupSumText, { color: colors.expense }]}>-{formatAmount(dayExpense)}</Text>}
                  </View>
                </View>
                {items.map((t, i) => (
                  <TransactionRow
                    key={t.id}
                    item={t}
                    colors={colors}
                    first={i === 0}
                    onDelete={() => remove(t.id)}
                    onEdit={() => { setEditing(t); setModalVisible(true); }}
                  />
                ))}
              </View>
            );
          })
        )}
        {groups.length > 0 && (
          <Text style={[styles.hint, { color: colors.subtext }]}>항목을 길게 눌러 수정·삭제</Text>
        )}
      </ScrollView>

      <BudgetPeriodSheet visible={pickerVisible} onClose={() => setPickerVisible(false)} colors={colors} />

      <BudgetModal
        visible={modalVisible}
        initialDate={defaultDate}
        initialType={modalType}
        onClose={() => { setModalVisible(false); setEditing(undefined); }}
        onSubmit={async (t) => {
          setModalVisible(false);
          if (editing) await update(editing.id, t);
          else await add(t);
          setEditing(undefined);
        }}
        colors={colors}
        initialData={editing}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  header: { alignItems: "center", justifyContent: "center", paddingHorizontal: 24, paddingBottom: 12 },
  headerTitle: { alignItems: "center", paddingVertical: 8 },
  monthLabel: { fontSize: 20, fontWeight: "700" },
  rangeLabel: { fontSize: 12.5, fontWeight: "600", marginTop: 1 },
  caret: { fontSize: 14 },
  // 이번 달 — 글자 버튼, 높이 44로 터치 영역 확보
  thisMonthBtn: { position: "absolute", right: 12, bottom: 12, height: 44, paddingHorizontal: 8, justifyContent: "center" },
  thisMonthText: { fontSize: 15, fontWeight: "600" },
  content: { paddingHorizontal: 20, paddingBottom: 32, gap: 12 },
  // 요약 — 시안 1: 두 칸 모두 왼쪽 정렬, 큰 금액
  summary: { flexDirection: "row", borderRadius: 16, borderWidth: 1, paddingHorizontal: 16, paddingVertical: 16 },
  summaryItem: { flex: 1, gap: 4 },
  summaryCaption: { fontSize: 13 },
  summaryValue: { fontSize: 20, fontWeight: "700", letterSpacing: -0.3, fontVariant: ["tabular-nums"] },
  calendarCard: { borderRadius: 16, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 14, gap: 8 },
  calendarHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 4 },
  calendarTitle: { fontSize: 15, fontWeight: "700" },
  calendarLink: { fontSize: 14, fontWeight: "500" },
  calendarReset: { fontSize: 13, fontWeight: "600", textAlign: "center", paddingTop: 2 },
  toolbar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  segment: { flexDirection: "row", borderRadius: 12, padding: 3 },
  segmentBtn: { paddingHorizontal: 14, minHeight: 38, borderRadius: 9, justifyContent: "center" },
  segmentBtnOn: {
    shadowColor: "#000", shadowOpacity: 0.08, shadowRadius: 2, shadowOffset: { width: 0, height: 1 }, elevation: 1,
  },
  segmentText: { fontSize: 14, fontWeight: "500" },
  addGroup: { flexDirection: "row", gap: 6 },
  addBtn: { borderRadius: 12, paddingHorizontal: 14, minHeight: 44, justifyContent: "center" },
  addText: { fontSize: 14, fontWeight: "700" },
  // 날짜 묶음 카드
  group: { borderRadius: 16, borderWidth: 1, paddingHorizontal: 16 },
  groupHeader: {
    flexDirection: "row", justifyContent: "space-between", alignItems: "center",
    paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth,
  },
  groupDate: { fontSize: 13, fontWeight: "600" },
  groupSum: { flexDirection: "row", gap: 8 },
  groupSumText: { fontSize: 13, fontWeight: "700", fontVariant: ["tabular-nums"] },
  empty: { alignItems: "center", paddingVertical: 48, gap: 6 },
  emptyText: { fontSize: 15 },
  emptyHint: { fontSize: 13 },
  hint: { fontSize: 12, textAlign: "center", paddingTop: 4 },
});
