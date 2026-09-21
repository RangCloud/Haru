/**
 * 일정 + 가계부 통합 화면
 *
 * 구조:
 * 1. 월 선택 헤더 (< 2025년 6월 >)
 * 2. 달력 그리드 (일정·거래 있는 날짜에 dot 표시)
 * 3. 선택된 날짜의 일정 목록 + 거래 내역
 * 4. "+ 추가" FAB → "일정 추가 / 지출 추가 / 수입 추가" 선택
 *
 * 모든 데이터는 기기 로컬 SQLite에만 저장 (외부 전송 없음, CLAUDE.md §4).
 */

import { useCallback, useEffect, useState } from "react";
import {
  Alert,
  Dimensions,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

import { Colors, cardShadow } from "@/constants/theme";
import { useColorScheme } from "@/hooks/use-color-scheme";
import {
  EXPENSE_CATEGORIES,
  INCOME_CATEGORIES,
  type NewTransaction,
  type Transaction,
} from "@/src/db/budget";
import { type ScheduleItem } from "@/src/db/schedule";
import { useBudgetStore } from "@/src/store/budgetStore";
import { useScheduleStore } from "@/src/store/scheduleStore";

// ── 유틸 ─────────────────────────────────────────────────────

function todayString(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function isValidDate(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const [y, m, d] = s.split("-").map(Number);
  if (m < 1 || m > 12 || d < 1) return false;
  const date = new Date(y, m - 1, d);
  return date.getMonth() === m - 1 && date.getDate() === d;
}

function autoFormatDate(input: string): string {
  const digits = input.replace(/\D/g, "").slice(0, 8);
  if (digits.length <= 4) return digits;
  if (digits.length <= 6) return `${digits.slice(0, 4)}-${digits.slice(4)}`;
  return `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6)}`;
}

function autoFormatTime(input: string): string {
  const digits = input.replace(/\D/g, "").slice(0, 4);
  if (digits.length <= 2) return digits;
  return `${digits.slice(0, 2)}:${digits.slice(2)}`;
}

function parseDate(s: string): Date {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function formatAmount(n: number): string {
  return n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",") + "원";
}

function buildCalendarDays(year: number, month: number): (number | null)[] {
  const firstDay = new Date(year, month - 1, 1).getDay();
  const daysInMonth = new Date(year, month, 0).getDate();
  const cells: (number | null)[] = [];
  for (let i = 0; i < firstDay; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];

// ── 달력 그리드 ───────────────────────────────────────────────

interface CalendarProps {
  year: number;
  month: number;
  selectedDate: string;
  markedDates: Set<string>;   // 일정 또는 거래가 있는 날짜
  colors: (typeof Colors)["light"];
  onSelectDate: (date: string) => void;
}

function Calendar({ year, month, selectedDate, markedDates, colors, onSelectDate }: CalendarProps) {
  const today = todayString();
  const days = buildCalendarDays(year, month);

  return (
    <View style={styles.calendar}>
      <View style={styles.weekdayRow}>
        {WEEKDAYS.map((w, i) => (
          <Text
            key={w}
            style={[
              styles.weekdayText,
              { color: i === 0 ? "#e74c3c" : i === 6 ? "#3498db" : colors.icon },
            ]}
          >
            {w}
          </Text>
        ))}
      </View>
      <View style={styles.daysGrid}>
        {days.map((day, idx) => {
          if (day === null) return <View key={`empty-${idx}`} style={styles.dayCell} />;
          const dateStr = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
          const isSelected = dateStr === selectedDate;
          const isToday = dateStr === today;
          const hasEvent = markedDates.has(dateStr);
          const dayOfWeek = idx % 7;
          return (
            <TouchableOpacity
              key={dateStr}
              style={[styles.dayCell, isSelected && { backgroundColor: colors.tint, borderRadius: 22 }]}
              onPress={() => onSelectDate(dateStr)}
              activeOpacity={0.7}
            >
              <Text style={[
                styles.dayText,
                {
                  color: isSelected ? "#fff" : dayOfWeek === 0 ? "#e74c3c" : dayOfWeek === 6 ? "#3498db" : colors.text,
                  fontWeight: isToday ? "700" : "400",
                },
              ]}>
                {day}
              </Text>
              {hasEvent && (
                <View style={[styles.eventDot, { backgroundColor: isSelected ? "#fff" : colors.tint }]} />
              )}
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

// ── 일정 행 ───────────────────────────────────────────────────

function ScheduleRow({ item, colors, onDelete, onEdit }: {
  item: ScheduleItem;
  colors: (typeof Colors)["light"];
  onDelete: () => void;
  onEdit: () => void;
}) {
  return (
    <TouchableOpacity
      style={[styles.scheduleRow, { borderLeftColor: colors.tint }]}
      onLongPress={() =>
        Alert.alert("일정 관리", item.title, [
          { text: "취소", style: "cancel" },
          { text: "수정", onPress: onEdit },
          { text: "삭제", style: "destructive", onPress: onDelete },
        ])
      }
      activeOpacity={0.7}
    >
      <View style={styles.scheduleMain}>
        <Text style={[styles.scheduleTitle, { color: colors.text }]}>{item.title}</Text>
        {item.note ? (
          <Text style={[styles.scheduleNote, { color: colors.icon }]} numberOfLines={1}>{item.note}</Text>
        ) : null}
      </View>
      <Text style={[styles.scheduleTime, { color: item.time ? colors.tint : colors.icon }]}>
        {item.time || "종일"}
      </Text>
    </TouchableOpacity>
  );
}

// ── 거래 행 ───────────────────────────────────────────────────

function TransactionRow({ item, colors, onDelete, onEdit }: {
  item: Transaction;
  colors: (typeof Colors)["light"];
  onDelete: () => void;
  onEdit: () => void;
}) {
  const isIncome = item.type === "income";
  return (
    <TouchableOpacity
      style={[styles.txRow, { borderBottomColor: colors.separator }]}
      onLongPress={() =>
        Alert.alert(
          "거래 관리",
          `${item.category}  ${isIncome ? "+" : "-"}${formatAmount(item.amount)}`,
          [
            { text: "취소", style: "cancel" },
            { text: "수정", onPress: onEdit },
            { text: "삭제", style: "destructive", onPress: onDelete },
          ],
        )
      }
      activeOpacity={0.7}
    >
      <View style={[styles.txBadge, { backgroundColor: colors.tintLight }]}>
        <Text style={[styles.txBadgeText, { color: colors.tint }]}>{item.category}</Text>
      </View>
      <Text style={[styles.txNote, { color: colors.text }]} numberOfLines={1}>
        {item.note || item.category}
      </Text>
      <Text style={[styles.txAmount, { color: isIncome ? colors.income : colors.expense }]}>
        {isIncome ? "+" : "-"}{formatAmount(item.amount)}
      </Text>
    </TouchableOpacity>
  );
}

// ── 일정 추가·수정 모달 ───────────────────────────────────────

interface ScheduleModalProps {
  visible: boolean;
  initialDate: string;
  onClose: () => void;
  onAdd: (s: { title: string; date: string; time: string; note: string }) => void;
  onUpdate: (s: { title: string; date: string; time: string; note: string }) => void;
  colors: (typeof Colors)["light"];
  initialData?: ScheduleItem;
}

function ScheduleModal({ visible, initialDate, onClose, onAdd, onUpdate, colors, initialData }: ScheduleModalProps) {
  const [title, setTitle] = useState("");
  const [date, setDate] = useState(initialDate);
  const [time, setTime] = useState("");
  const [note, setNote] = useState("");
  const isEdit = !!initialData;

  useEffect(() => {
    if (!visible) return;
    if (initialData) {
      setTitle(initialData.title); setDate(initialData.date);
      setTime(initialData.time); setNote(initialData.note);
    } else {
      setTitle(""); setDate(initialDate); setTime(""); setNote("");
    }
  }, [visible, initialDate, initialData]);

  const handleSubmit = () => {
    if (!title.trim()) { Alert.alert("입력 오류", "제목을 입력해 주세요."); return; }
    if (!isValidDate(date)) { Alert.alert("입력 오류", "올바른 날짜를 입력해 주세요.\n예) 2025-06-15"); return; }
    if (time) {
      if (!/^\d{2}:\d{2}$/.test(time)) { Alert.alert("입력 오류", "시간을 HH:MM 형식으로 입력하거나 비워두세요."); return; }
      const [h, m] = time.split(":").map(Number);
      if (h > 23 || m > 59) { Alert.alert("입력 오류", "올바른 시간을 입력해 주세요.\n시(0-23), 분(0-59)"); return; }
    }
    const data = { title: title.trim(), date, time, note: note.trim() };
    if (isEdit) onUpdate(data); else onAdd(data);
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <KeyboardAvoidingView style={styles.modalOverlay} behavior={Platform.OS === "ios" ? "padding" : "height"}>
        <View style={[styles.modalSheet, { backgroundColor: colors.background }]}>
          <View style={styles.modalHeader}>
            <Text style={[styles.modalTitle, { color: colors.text }]}>{isEdit ? "일정 수정" : "일정 추가"}</Text>
            <TouchableOpacity onPress={onClose}><Text style={[styles.modalClose, { color: colors.icon }]}>✕</Text></TouchableOpacity>
          </View>
          <Text style={[styles.fieldLabel, { color: colors.icon }]}>제목 *</Text>
          <TextInput style={[styles.input, { color: colors.text, borderColor: colors.icon + "40" }]}
            placeholder="일정 제목" placeholderTextColor={colors.icon}
            value={title} onChangeText={setTitle} autoFocus={!isEdit} />
          <Text style={[styles.fieldLabel, { color: colors.icon }]}>날짜</Text>
          <TextInput style={[styles.input, { color: colors.text, borderColor: colors.icon + "40" }]}
            placeholder="YYYY-MM-DD" placeholderTextColor={colors.icon}
            keyboardType="number-pad" value={date} onChangeText={(t) => setDate(autoFormatDate(t))} />
          <Text style={[styles.fieldLabel, { color: colors.icon }]}>시간 (선택 — 비우면 종일)</Text>
          <TextInput style={[styles.input, { color: colors.text, borderColor: colors.icon + "40" }]}
            placeholder="HH:MM  예) 14:30" placeholderTextColor={colors.icon}
            keyboardType="number-pad" value={time} onChangeText={(t) => setTime(autoFormatTime(t))} />
          <Text style={[styles.fieldLabel, { color: colors.icon }]}>메모 (선택)</Text>
          <TextInput style={[styles.input, { color: colors.text, borderColor: colors.icon + "40" }]}
            placeholder="메모" placeholderTextColor={colors.icon}
            value={note} onChangeText={setNote} />
          <TouchableOpacity style={[styles.submitBtn, { backgroundColor: colors.tint }]} onPress={handleSubmit}>
            <Text style={styles.submitBtnText}>{isEdit ? "수정하기" : "추가하기"}</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ── 거래 추가·수정 모달 ───────────────────────────────────────

interface BudgetModalProps {
  visible: boolean;
  initialDate: string;
  initialType?: "income" | "expense";
  onClose: () => void;
  onAdd: (t: NewTransaction) => void;
  onUpdate: (t: NewTransaction) => void;
  colors: (typeof Colors)["light"];
  initialData?: Transaction;
}

function BudgetModal({ visible, initialDate, initialType = "expense", onClose, onAdd, onUpdate, colors, initialData }: BudgetModalProps) {
  const [type, setType] = useState<"income" | "expense">(initialData?.type ?? initialType);
  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState<string>(EXPENSE_CATEGORIES[0]);
  const [note, setNote] = useState("");
  const [date, setDate] = useState(initialDate);
  const isEdit = !!initialData;

  useEffect(() => {
    if (!visible) return;
    if (initialData) {
      setType(initialData.type);
      setAmount(initialData.amount.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ","));
      setCategory(initialData.category); setNote(initialData.note); setDate(initialData.date);
    } else {
      setType(initialType); setAmount("");
      setCategory(initialType === "expense" ? EXPENSE_CATEGORIES[0] : INCOME_CATEGORIES[0]);
      setNote(""); setDate(initialDate);
    }
  }, [visible, initialDate, initialType, initialData]);

  const categories = type === "expense" ? EXPENSE_CATEGORIES : INCOME_CATEGORIES;

  const switchType = (t: "income" | "expense") => {
    setType(t);
    setCategory(t === "expense" ? EXPENSE_CATEGORIES[0] : INCOME_CATEGORIES[0]);
  };

  const handleAmountChange = (text: string) => {
    const raw = text.replace(/[^0-9]/g, "");
    if (!raw) { setAmount(""); return; }
    setAmount(parseInt(raw, 10).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ","));
  };

  const handleSubmit = () => {
    const num = parseInt(amount.replace(/,/g, ""), 10);
    if (!num || num <= 0) { Alert.alert("입력 오류", "금액을 올바르게 입력해 주세요."); return; }
    if (!isValidDate(date)) { Alert.alert("입력 오류", "올바른 날짜를 입력해 주세요.\n예) 2025-06-15"); return; }
    const data = { type, amount: num, category, note: note.trim(), date };
    if (isEdit) onUpdate(data); else onAdd(data);
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <KeyboardAvoidingView style={styles.modalOverlay} behavior={Platform.OS === "ios" ? "padding" : "height"}>
        <ScrollView contentContainerStyle={[styles.modalSheet, { backgroundColor: colors.card }]} keyboardShouldPersistTaps="handled">
          <View style={styles.modalHandle} />
          <View style={styles.modalHeader}>
            <Text style={[styles.modalTitle, { color: colors.text }]}>{isEdit ? "거래 수정" : "거래 추가"}</Text>
            <TouchableOpacity onPress={onClose}><Text style={[styles.modalClose, { color: colors.subtext }]}>✕</Text></TouchableOpacity>
          </View>

          {/* 수입/지출 토글 */}
          <View style={[styles.typeToggle, { backgroundColor: colors.background }]}>
            {(["expense", "income"] as const).map((t) => (
              <TouchableOpacity
                key={t}
                style={[styles.typeBtn, type === t && { backgroundColor: t === "expense" ? colors.expense : colors.income }]}
                onPress={() => switchType(t)}
              >
                <Text style={[styles.typeBtnText, { color: type === t ? "#fff" : colors.subtext }]}>
                  {t === "expense" ? "지출" : "수입"}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={[styles.fieldLabel, { color: colors.subtext }]}>금액</Text>
          <TextInput
            style={[styles.input, { color: colors.text, backgroundColor: colors.background, borderColor: colors.separator }]}
            placeholder="금액 입력 (원)" placeholderTextColor={colors.subtext}
            keyboardType="number-pad" value={amount} onChangeText={handleAmountChange} autoFocus={!isEdit}
          />

          <Text style={[styles.fieldLabel, { color: colors.subtext }]}>카테고리</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.categoryList}>
            {categories.map((c) => (
              <TouchableOpacity
                key={c}
                style={[styles.categoryChip, { borderColor: colors.separator, backgroundColor: colors.background },
                  category === c && { backgroundColor: colors.tint, borderColor: colors.tint }]}
                onPress={() => setCategory(c)}
              >
                <Text style={[styles.categoryText, { color: category === c ? "#fff" : colors.subtext }]}>{c}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          <Text style={[styles.fieldLabel, { color: colors.subtext }]}>날짜</Text>
          <TextInput
            style={[styles.input, { color: colors.text, backgroundColor: colors.background, borderColor: colors.separator }]}
            placeholder="YYYY-MM-DD" placeholderTextColor={colors.subtext}
            keyboardType="number-pad" value={date} onChangeText={(t) => setDate(autoFormatDate(t))}
          />

          <Text style={[styles.fieldLabel, { color: colors.subtext }]}>메모 (선택)</Text>
          <TextInput
            style={[styles.input, { color: colors.text, backgroundColor: colors.background, borderColor: colors.separator }]}
            placeholder="메모" placeholderTextColor={colors.subtext}
            value={note} onChangeText={setNote}
          />

          <TouchableOpacity style={[styles.submitBtn, { backgroundColor: colors.tint }]} onPress={handleSubmit}>
            <Text style={styles.submitBtnText}>{isEdit ? "수정하기" : "추가하기"}</Text>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ── 메인 화면 ─────────────────────────────────────────────────

export default function ScheduleScreen() {
  const colors = Colors[useColorScheme() ?? "light"];

  // 일정 store
  const {
    monthSchedules, selectedDate, selectedDateSchedules,
    year, month, isLoaded,
    loadMonth, selectDate, add: addSchedule, update: updateSchedule, remove: removeSchedule,
  } = useScheduleStore();

  // 가계부 store — 선택된 월의 거래를 함께 불러온다
  const {
    transactions, loadMonth: loadBudgetMonth,
    add: addTransaction, update: updateTransaction, remove: removeTransaction,
  } = useBudgetStore();

  // 일정 모달 상태
  const [scheduleModalVisible, setScheduleModalVisible] = useState(false);
  const [editSchedule, setEditSchedule] = useState<ScheduleItem | undefined>();

  // 가계부 모달 상태
  const [budgetModalVisible, setBudgetModalVisible] = useState(false);
  const [budgetInitialType, setBudgetInitialType] = useState<"income" | "expense">("expense");
  const [editTransaction, setEditTransaction] = useState<Transaction | undefined>();

  // 초기 로드 + 월 변경 시 일정·가계부 함께 로드
  useEffect(() => {
    loadMonth(year, month);
    loadBudgetMonth(year, month);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const prevMonth = useCallback(() => {
    const nm = month === 1 ? 12 : month - 1;
    const ny = month === 1 ? year - 1 : year;
    loadMonth(ny, nm);
    loadBudgetMonth(ny, nm);
  }, [year, month, loadMonth, loadBudgetMonth]);

  const nextMonth = useCallback(() => {
    const nm = month === 12 ? 1 : month + 1;
    const ny = month === 12 ? year + 1 : year;
    loadMonth(ny, nm);
    loadBudgetMonth(ny, nm);
  }, [year, month, loadMonth, loadBudgetMonth]);

  // 선택된 날짜의 거래 내역
  const selectedDateTransactions = transactions.filter((t) => t.date === selectedDate);

  // 달력 dot: 일정 또는 거래가 있는 날짜
  const scheduleDates = new Set(monthSchedules.map((s) => s.date));
  const txDates = new Set(transactions.map((t) => t.date));
  const markedDates = new Set([...scheduleDates, ...txDates]);

  // "+ 추가" FAB 탭 → 종류 선택
  const handleFabPress = () => {
    Alert.alert("추가하기", undefined, [
      { text: "📅 일정 추가", onPress: () => { setEditSchedule(undefined); setScheduleModalVisible(true); } },
      { text: "💸 지출 추가", onPress: () => { setEditTransaction(undefined); setBudgetInitialType("expense"); setBudgetModalVisible(true); } },
      { text: "💰 수입 추가", onPress: () => { setEditTransaction(undefined); setBudgetInitialType("income"); setBudgetModalVisible(true); } },
      { text: "취소", style: "cancel" },
    ]);
  };

  const selectedDateLabel = (() => {
    const d = parseDate(selectedDate);
    const weekday = ["일", "월", "화", "수", "목", "금", "토"][d.getDay()];
    return `${d.getMonth() + 1}월 ${d.getDate()}일 ${weekday}요일`;
  })();

  const totalCount = selectedDateSchedules.length + selectedDateTransactions.length;

  // 선택된 날짜 일정·거래 합산 요약
  const dayIncome = selectedDateTransactions.filter((t) => t.type === "income").reduce((s, t) => s + t.amount, 0);
  const dayExpense = selectedDateTransactions.filter((t) => t.type === "expense").reduce((s, t) => s + t.amount, 0);

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      {/* 월 선택 헤더 */}
      <View style={styles.monthHeader}>
        <TouchableOpacity onPress={prevMonth} style={styles.monthArrow}>
          <Text style={[styles.monthArrowText, { color: colors.tint }]}>‹</Text>
        </TouchableOpacity>
        <Text style={[styles.monthLabel, { color: colors.text }]}>{year}년 {month}월</Text>
        <TouchableOpacity onPress={nextMonth} style={styles.monthArrow}>
          <Text style={[styles.monthArrowText, { color: colors.tint }]}>›</Text>
        </TouchableOpacity>
      </View>

      {/* 달력 */}
      <Calendar
        year={year} month={month} selectedDate={selectedDate}
        markedDates={markedDates} colors={colors} onSelectDate={selectDate}
      />

      {/* 선택된 날짜 헤더 */}
      <View style={[styles.selectedDateBar, { borderTopColor: colors.icon + "20" }]}>
        <Text style={[styles.selectedDateText, { color: colors.text }]}>{selectedDateLabel}</Text>
        <Text style={[styles.selectedDateCount, { color: colors.icon }]}>{totalCount}개</Text>
      </View>

      {/* 일정 + 거래 목록 */}
      {isLoaded && totalCount === 0 ? (
        <View style={styles.empty}>
          <Text style={[styles.emptyText, { color: colors.icon }]}>일정과 거래 내역이 없습니다.</Text>
          <Text style={[styles.emptyHint, { color: colors.icon }]}>아래 + 버튼으로 추가하세요</Text>
        </View>
      ) : (
        <FlatList
          data={[...selectedDateSchedules.map((s) => ({ type: "schedule" as const, data: s })),
                 ...selectedDateTransactions.map((t) => ({ type: "transaction" as const, data: t }))]}
          keyExtractor={(item) => `${item.type}-${item.data.id}`}
          contentContainerStyle={styles.listContent}
          ListHeaderComponent={
            selectedDateTransactions.length > 0 ? (
              <View style={[styles.daySummary, { backgroundColor: colors.card, borderColor: colors.cardBorder }, cardShadow]}>
                {dayIncome > 0 && <Text style={[styles.daySummaryText, { color: colors.income }]}>수입 +{formatAmount(dayIncome)}</Text>}
                {dayExpense > 0 && <Text style={[styles.daySummaryText, { color: colors.expense }]}>지출 -{formatAmount(dayExpense)}</Text>}
              </View>
            ) : null
          }
          renderItem={({ item }) => {
            if (item.type === "schedule") {
              const s = item.data as ScheduleItem;
              return (
                <ScheduleRow
                  item={s} colors={colors}
                  onDelete={() => removeSchedule(s.id)}
                  onEdit={() => { setEditSchedule(s); setScheduleModalVisible(true); }}
                />
              );
            }
            const t = item.data as Transaction;
            return (
              <TransactionRow
                item={t} colors={colors}
                onDelete={() => removeTransaction(t.id)}
                onEdit={() => { setEditTransaction(t); setBudgetModalVisible(true); }}
              />
            );
          }}
          ListFooterComponent={() =>
            totalCount > 0
              ? <Text style={[styles.hintText, { color: colors.icon }]}>항목을 길게 눌러 수정·삭제</Text>
              : null
          }
        />
      )}

      {/* "+ 추가" FAB */}
      <TouchableOpacity style={[styles.fab, { backgroundColor: colors.tint }]} onPress={handleFabPress}>
        <Text style={styles.fabText}>+ 추가</Text>
      </TouchableOpacity>

      {/* 일정 모달 */}
      <ScheduleModal
        visible={scheduleModalVisible}
        initialDate={selectedDate}
        onClose={() => { setScheduleModalVisible(false); setEditSchedule(undefined); }}
        onAdd={async (s) => { setScheduleModalVisible(false); await addSchedule(s); }}
        onUpdate={async (s) => { setScheduleModalVisible(false); if (editSchedule) await updateSchedule(editSchedule.id, s); setEditSchedule(undefined); }}
        colors={colors}
        initialData={editSchedule}
      />

      {/* 가계부 모달 */}
      <BudgetModal
        visible={budgetModalVisible}
        initialDate={selectedDate}
        initialType={budgetInitialType}
        onClose={() => { setBudgetModalVisible(false); setEditTransaction(undefined); }}
        onAdd={async (t) => { setBudgetModalVisible(false); await addTransaction(t); }}
        onUpdate={async (t) => { setBudgetModalVisible(false); if (editTransaction) await updateTransaction(editTransaction.id, t); setEditTransaction(undefined); }}
        colors={colors}
        initialData={editTransaction}
      />
    </View>
  );
}

// ── 스타일 ───────────────────────────────────────────────────

const { width: SCREEN_WIDTH } = Dimensions.get("window");
const CELL_SIZE = Math.floor((SCREEN_WIDTH - 24) / 7);

const styles = StyleSheet.create({
  screen: { flex: 1 },
  monthHeader: {
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    paddingTop: 64, paddingHorizontal: 24, paddingBottom: 8, gap: 16,
  },
  monthArrow: { padding: 8 },
  monthArrowText: { fontSize: 28, fontWeight: "300" },
  monthLabel: { fontSize: 20, fontWeight: "700", minWidth: 110, textAlign: "center" },
  // ── 달력 ──────────────────────────────────────────────────
  calendar: { paddingHorizontal: 12, marginBottom: 4 },
  weekdayRow: { flexDirection: "row", marginBottom: 4 },
  weekdayText: { width: CELL_SIZE, textAlign: "center", fontSize: 12, fontWeight: "600" },
  daysGrid: { flexDirection: "row", flexWrap: "wrap" },
  dayCell: { width: CELL_SIZE, height: CELL_SIZE, alignItems: "center", justifyContent: "center" },
  dayText: { fontSize: 14 },
  eventDot: { width: 4, height: 4, borderRadius: 2, marginTop: 2 },
  // ── 선택일 헤더 ───────────────────────────────────────────
  selectedDateBar: {
    flexDirection: "row", justifyContent: "space-between", alignItems: "center",
    paddingHorizontal: 24, paddingVertical: 10, borderTopWidth: StyleSheet.hairlineWidth,
  },
  selectedDateText: { fontSize: 15, fontWeight: "600" },
  selectedDateCount: { fontSize: 13 },
  // ── 일당 요약 ─────────────────────────────────────────────
  daySummary: {
    flexDirection: "row", gap: 12, padding: 12,
    borderRadius: 12, borderWidth: 1, marginBottom: 8,
  },
  daySummaryText: { fontSize: 13, fontWeight: "600" },
  // ── 일정 행 ───────────────────────────────────────────────
  listContent: { paddingHorizontal: 24, paddingBottom: 100 },
  scheduleRow: {
    flexDirection: "row", alignItems: "center",
    paddingVertical: 12, paddingLeft: 12,
    borderLeftWidth: 3, marginBottom: 8, gap: 8,
  },
  scheduleMain: { flex: 1, gap: 3 },
  scheduleTitle: { fontSize: 15, fontWeight: "500" },
  scheduleNote: { fontSize: 12 },
  scheduleTime: { fontSize: 13, fontWeight: "500" },
  // ── 거래 행 ───────────────────────────────────────────────
  txRow: {
    flexDirection: "row", alignItems: "center",
    paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, gap: 10, marginBottom: 2,
  },
  txBadge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
  txBadgeText: { fontSize: 11, fontWeight: "600" },
  txNote: { flex: 1, fontSize: 14 },
  txAmount: { fontSize: 14, fontWeight: "700" },
  // ── 빈 상태 ───────────────────────────────────────────────
  empty: { flex: 1, justifyContent: "center", alignItems: "center", paddingBottom: 100, gap: 6 },
  emptyText: { fontSize: 15 },
  emptyHint: { fontSize: 13 },
  // ── FAB ───────────────────────────────────────────────────
  fab: {
    position: "absolute", bottom: 32, left: 24, right: 24,
    paddingVertical: 16, borderRadius: 14, alignItems: "center",
  },
  fabText: { color: "#fff", fontSize: 16, fontWeight: "600" },
  hintText: { fontSize: 11, textAlign: "center", paddingTop: 8, paddingBottom: 90 },
  // ── 모달 공통 ─────────────────────────────────────────────
  modalOverlay: { flex: 1, justifyContent: "flex-end", backgroundColor: "#00000060" },
  modalSheet: {
    borderTopLeftRadius: 20, borderTopRightRadius: 20,
    padding: 24, paddingBottom: 40, gap: 8,
  },
  modalHandle: { width: 36, height: 4, borderRadius: 2, backgroundColor: "#ccc", alignSelf: "center", marginBottom: 8 },
  modalHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 8 },
  modalTitle: { fontSize: 18, fontWeight: "700" },
  modalClose: { fontSize: 18, padding: 4 },
  fieldLabel: { fontSize: 12, fontWeight: "500", marginTop: 8, marginBottom: 4 },
  input: {
    borderWidth: 1, borderRadius: 10,
    paddingHorizontal: 14, paddingVertical: 12, fontSize: 15,
  },
  submitBtn: { marginTop: 16, paddingVertical: 16, borderRadius: 14, alignItems: "center" },
  submitBtnText: { color: "#fff", fontSize: 16, fontWeight: "600" },
  // ── 가계부 모달 전용 ──────────────────────────────────────
  typeToggle: { flexDirection: "row", borderRadius: 10, overflow: "hidden", marginBottom: 4 },
  typeBtn: { flex: 1, paddingVertical: 12, alignItems: "center" },
  typeBtnText: { fontSize: 15, fontWeight: "600" },
  categoryList: { gap: 8, paddingVertical: 4 },
  categoryChip: { borderWidth: 1, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 8 },
  categoryText: { fontSize: 13 },
});
