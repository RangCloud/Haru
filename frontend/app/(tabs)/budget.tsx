/**
 * 가계부 탭
 *
 * 한 달의 수입·지출 내역만 모아 보는 화면.
 * - 홈 가계부 카드와 같은 달을 본다 (홈에서 8월을 고르고 '자세히'를 누르면 8월 내역이 나온다)
 * - 상단 '2026년 9월 ▾'를 누르면 연·월 선택, '이번 달'로 바로 복귀
 * - 수입 총액·지출 총액 요약, 전체/수입/지출 필터, 날짜별 묶음 + 그날 합계
 * - 거래 추가(지출·수입), 길게 눌러 수정·삭제
 * - 날짜별 지출 달력: 많이 쓴 날일수록 칸이 진해지고, 날짜를 누르면 아래 내역이 그날로 좁혀진다
 * - 달력 카드의 '소비 분석'을 누르면 주·달·년 단위 분석 화면으로 이동
 * 모든 데이터는 기기 로컬 SQLite에만 저장 (외부 전송 없음, CLAUDE.md §4).
 */

import { router } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { ScrollView, StyleSheet, TouchableOpacity, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Colors, cardShadow } from "@/constants/theme";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { Text } from "@/src/components/AppText";
import { BudgetModal, formatAmount, TransactionRow } from "@/src/components/BudgetModal";
import { DateJumpSheet } from "@/src/components/DateJumpSheet";
import { SpendingHeatCalendar } from "@/src/components/SpendingHeatCalendar";
import { type Transaction } from "@/src/db/budget";
import { useBudgetStore } from "@/src/store/budgetStore";
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
    homeYear: year, homeMonth: month, homeIncome, homeExpense, homeTransactions,
    loadHomeMonth, add, update, remove,
  } = useBudgetStore();

  const [filter, setFilter] = useState<Filter>("all");
  const [pickerVisible, setPickerVisible] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [modalType, setModalType] = useState<"income" | "expense">("expense");
  const [editing, setEditing] = useState<Transaction | undefined>();
  // 지출 달력에서 고른 날짜 — null이면 한 달 전체 내역을 보여 준다
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  // 탭에 들어올 때 지금 보고 있는 달을 새로 읽는다 (다른 탭에서 거래가 바뀌었을 수 있음)
  useEffect(() => {
    loadHomeMonth(year, month);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 다른 달로 넘어가면 고른 날짜는 의미가 없어지므로 푼다
  useEffect(() => {
    setSelectedDate(null);
  }, [year, month]);

  const now = new Date();
  const isCurrent = year === now.getFullYear() && month === now.getMonth() + 1;
  const today = todayString();

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

  // 새 거래 기본 날짜: 달력에서 고른 날 → 이번 달이면 오늘 → 다른 달이면 그 달 1일
  const defaultDate = selectedDate ?? (isCurrent ? today : `${year}-${String(month).padStart(2, "0")}-01`);

  const openAdd = (type: "income" | "expense") => {
    setEditing(undefined);
    setModalType(type);
    setModalVisible(true);
  };

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      {/* 월 헤더 — 일정 탭과 같은 위치·모양. 누르면 연·월 선택 */}
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <TouchableOpacity onPress={() => setPickerVisible(true)} accessibilityLabel={`${year}년 ${month}월, 눌러서 다른 달 선택`}>
          <Text style={[styles.monthLabel, { color: colors.text }]}>
            {year}년 {month}월 <Text style={[styles.caret, { color: colors.subtext }]}>▾</Text>
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => loadHomeMonth(now.getFullYear(), now.getMonth() + 1)}
          disabled={isCurrent}
          style={[styles.thisMonthBtn, { borderColor: colors.tint, opacity: isCurrent ? 0.4 : 1 }]}
          accessibilityLabel="이번 달로 이동"
        >
          <Text style={[styles.thisMonthText, { color: colors.tint }]}>이번 달</Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {/* 요약 — 홈 카드와 같은 구성 */}
        <View style={[styles.summary, { backgroundColor: colors.card, borderColor: colors.cardBorder }, cardShadow]}>
          <View style={styles.summaryItem}>
            <Text style={[styles.summaryCaption, { color: colors.subtext }]}>수입 총액</Text>
            <Text style={[styles.summaryValue, { color: colors.income }]}>{formatAmount(homeIncome)}</Text>
          </View>
          <View style={[styles.divider, { backgroundColor: colors.separator }]} />
          <View style={styles.summaryItem}>
            <Text style={[styles.summaryCaption, { color: colors.subtext }]}>지출 총액</Text>
            <Text style={[styles.summaryValue, { color: colors.expense }]}>{formatAmount(homeExpense)}</Text>
          </View>
        </View>

        {/* 날짜별 지출 달력 — 많이 쓴 날이 진하게 보인다. 소비 분석 진입도 이 카드에 둔다 */}
        <View style={[styles.calendarCard, { backgroundColor: colors.card, borderColor: colors.cardBorder }, cardShadow]}>
          <View style={styles.calendarHeader}>
            <Text style={[styles.calendarTitle, { color: colors.subtext }]}>날짜별 지출</Text>
            <TouchableOpacity
              onPress={() => router.push("/budget-insight")}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              accessibilityRole="button"
              accessibilityLabel="소비 분석 보기"
            >
              <Text style={[styles.calendarLink, { color: colors.tint }]}>소비 분석 →</Text>
            </TouchableOpacity>
          </View>
          <SpendingHeatCalendar
            year={year}
            month={month}
            expenseByDate={expenseByDate}
            selectedDate={selectedDate}
            today={today}
            onSelectDate={setSelectedDate}
            colors={colors}
          />
          {selectedDate && (
            <TouchableOpacity onPress={() => setSelectedDate(null)} accessibilityRole="button">
              <Text style={[styles.calendarReset, { color: colors.tint }]}>
                {formatMonthDay(selectedDate)} 내역만 보는 중 · 한 달 전체 보기
              </Text>
            </TouchableOpacity>
          )}
        </View>

        {/* 필터 + 추가 버튼 */}
        <View style={styles.toolbar}>
          <View style={[styles.segment, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
            {FILTERS.map((f) => {
              const on = f.value === filter;
              return (
                <TouchableOpacity
                  key={f.value}
                  onPress={() => setFilter(f.value)}
                  style={[styles.segmentBtn, on && { backgroundColor: colors.tint }]}
                  accessibilityState={{ selected: on }}
                >
                  <Text style={[styles.segmentText, { color: on ? "#fff" : colors.subtext }]}>{f.label}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
          <View style={styles.addGroup}>
            <TouchableOpacity onPress={() => openAdd("expense")} style={[styles.addBtn, { backgroundColor: colors.expense }]}>
              <Text style={styles.addText}>+ 지출</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => openAdd("income")} style={[styles.addBtn, { backgroundColor: colors.income }]}>
              <Text style={styles.addText}>+ 수입</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* 날짜별 내역 */}
        {groups.length === 0 ? (
          <View style={styles.empty}>
            <Text style={[styles.emptyText, { color: colors.subtext }]}>
              {/* 달력에서 날짜를 골랐으면 "10월 9일 (금)", 아니면 "10월" 기준으로 안내한다 */}
              {selectedDate ? formatMonthDay(selectedDate) : `${month}월`}
              {filter === "all" ? " 내역이 없습니다." : ` ${filter === "income" ? "수입" : "지출"} 내역이 없습니다.`}
            </Text>
            <Text style={[styles.emptyHint, { color: colors.subtext }]}>+ 지출 · + 수입 버튼으로 추가하세요</Text>
          </View>
        ) : (
          groups.map(([date, items]) => {
            const dayIncome = items.filter((t) => t.type === "income").reduce((s, t) => s + t.amount, 0);
            const dayExpense = items.filter((t) => t.type === "expense").reduce((s, t) => s + t.amount, 0);
            return (
              <View key={date} style={styles.group}>
                <View style={styles.groupHeader}>
                  <Text style={[styles.groupDate, { color: colors.subtext }]}>
                    {formatMonthDay(date)}{date === today ? " · 오늘" : ""}
                  </Text>
                  <View style={styles.groupSum}>
                    {dayIncome > 0 && <Text style={[styles.groupSumText, { color: colors.income }]}>+{formatAmount(dayIncome)}</Text>}
                    {dayExpense > 0 && <Text style={[styles.groupSumText, { color: colors.expense }]}>-{formatAmount(dayExpense)}</Text>}
                  </View>
                </View>
                {items.map((t) => (
                  <TransactionRow
                    key={t.id}
                    item={t}
                    colors={colors}
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

      <DateJumpSheet
        visible={pickerVisible}
        onClose={() => setPickerVisible(false)}
        mode="month"
        selectedDate={`${year}-${String(month).padStart(2, "0")}-01`}
        onPickMonth={loadHomeMonth}
        colors={colors}
      />

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
  monthLabel: { fontSize: 20, fontWeight: "700", paddingVertical: 8 },
  caret: { fontSize: 14 },
  thisMonthBtn: { position: "absolute", right: 20, bottom: 20, borderWidth: 1, borderRadius: 14, paddingHorizontal: 10, paddingVertical: 4 },
  thisMonthText: { fontSize: 12, fontWeight: "600" },
  content: { paddingHorizontal: 24, paddingBottom: 32, gap: 12 },
  summary: { flexDirection: "row", alignItems: "center", borderRadius: 16, borderWidth: 1, paddingVertical: 18 },
  summaryItem: { flex: 1, alignItems: "center", gap: 5 },
  summaryCaption: { fontSize: 11 },
  summaryValue: { fontSize: 17, fontWeight: "700", fontVariant: ["tabular-nums"] },
  divider: { width: 1, height: 34 },
  calendarCard: { borderRadius: 16, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 14, gap: 8 },
  calendarHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 4 },
  calendarTitle: { fontSize: 13, fontWeight: "600" },
  calendarLink: { fontSize: 13 },
  calendarReset: { fontSize: 12, fontWeight: "600", textAlign: "center", paddingTop: 2 },
  toolbar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  segment: { flexDirection: "row", borderRadius: 12, borderWidth: 1, overflow: "hidden" },
  segmentBtn: { paddingHorizontal: 14, paddingVertical: 8 },
  segmentText: { fontSize: 13, fontWeight: "600" },
  addGroup: { flexDirection: "row", gap: 6 },
  addBtn: { borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8 },
  addText: { color: "#fff", fontSize: 13, fontWeight: "700" },
  group: { gap: 0 },
  groupHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingTop: 8, paddingBottom: 2 },
  groupDate: { fontSize: 12, fontWeight: "700", letterSpacing: 0.3 },
  groupSum: { flexDirection: "row", gap: 8 },
  groupSumText: { fontSize: 12, fontWeight: "700", fontVariant: ["tabular-nums"] },
  empty: { alignItems: "center", paddingVertical: 48, gap: 6 },
  emptyText: { fontSize: 15 },
  emptyHint: { fontSize: 13 },
  hint: { fontSize: 11, textAlign: "center", paddingTop: 4 },
});
