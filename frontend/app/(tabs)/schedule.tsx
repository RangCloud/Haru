/**
 * 일정 + 가계부 + 할 일 통합 화면
 *
 * 구조:
 * 1. 월 헤더 (‹ 2026년 9월 › · 오늘 버튼)
 * 2. 달력 (좌우 스와이프로 달 이동, 날짜 아래 일정 색 점·수입/지출 막대)
 * 3. 선택한 날짜 바 (한눈에 보기 버튼)
 * 4. 그날의 일정 → 할 일·루틴 → 수입·지출 목록
 * 5. 날짜 바의 "+ 추가" → 일정 / 지출 / 수입
 *
 * 모든 데이터는 기기 로컬 SQLite에만 저장 (외부 전송 없음, CLAUDE.md §4).
 */

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
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
import { DateJumpSheet } from "@/src/components/DateJumpSheet";
import { DateField, ScheduleWhenField, type ScheduleWhen } from "@/src/components/DateTimeFields";
import { MonthCalendar, type DayMark } from "@/src/components/MonthCalendar";
import { TodoAddSheet } from "@/src/components/TodoAddSheet";
import { TodoList } from "@/src/components/TodoList";
import {
  EXPENSE_CATEGORIES,
  INCOME_CATEGORIES,
  type NewTransaction,
  type Transaction,
} from "@/src/db/budget";
import { type ColorLabels } from "@/src/db/colorLabel";
import { type RoutineForDate } from "@/src/db/routine";
import { type NewScheduleItem, type ScheduleItem } from "@/src/db/schedule";
import { useBudgetStore } from "@/src/store/budgetStore";
import { useScheduleStore } from "@/src/store/scheduleStore";
import { useTodoStore } from "@/src/store/todoStore";
import { formatMonthDay, parseDate, shiftMonth, toDateStr, todayString } from "@/src/utils/date";
import { scheduleEventNotification } from "@/src/utils/notifications";
import { lastDayOf, periodLabel, timeLabelOn } from "@/src/utils/scheduleText";

type ThemeColors = (typeof Colors)["light"];

// ── 색상 팔레트 ───────────────────────────────────────────────
// 일정별 색상 선택 시 제공할 색상 목록 — 각 색에 사용자가 이름(카테고리)을 붙일 수 있다
const SCHEDULE_COLORS = [
  "#6B6EE7", // 인디고 (기본)
  "#3B82F6", // 파랑
  "#0EA5E9", // 하늘
  "#10B981", // 초록
  "#F59E0B", // 노랑
  "#F97316", // 주황
  "#EF4444", // 빨강
  "#EC4899", // 분홍
];

// ── 유틸 ─────────────────────────────────────────────────────

function formatAmount(n: number): string {
  return n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",") + "원";
}

/** '#RRGGBB' + 투명도 → 연한 배경색 (라벨 칩용) */
function withAlpha(hex: string, alpha: string): string {
  return `${hex}${alpha}`;
}

/**
 * 달력 표시용 날짜별 표식을 만든다.
 * 기간 일정은 기간 안의 모든 날짜에 색 점을 찍되, 보고 있는 달 범위 안에서만 계산한다.
 */
function buildMarks(year: number, month: number, schedules: ScheduleItem[], txs: Transaction[]): Record<string, DayMark> {
  const marks: Record<string, DayMark> = {};
  const get = (d: string) => (marks[d] ??= { scheduleColors: [], income: false, expense: false });
  const monthStart = toDateStr(year, month, 1);
  const monthEnd = toDateStr(year, month, new Date(year, month, 0).getDate());

  for (const s of schedules) {
    const from = s.date > monthStart ? s.date : monthStart;
    const to = lastDayOf(s) < monthEnd ? lastDayOf(s) : monthEnd;
    for (let d = parseDate(from); ; d.setDate(d.getDate() + 1)) {
      const ds = toDateStr(d.getFullYear(), d.getMonth() + 1, d.getDate());
      if (ds > to) break;
      const m = get(ds);
      const color = s.color || SCHEDULE_COLORS[0];
      if (!m.scheduleColors.includes(color)) m.scheduleColors.push(color);
    }
  }
  for (const t of txs) {
    const m = get(t.date);
    if (t.type === "income") m.income = true;
    else m.expense = true;
  }
  return marks;
}

// ── 색상 선택 + 색상 이름 (피드백 9번) ─────────────────────────

function ColorPicker({
  value, onChange, labels, onSaveLabel, colors,
}: {
  value: string;
  onChange: (c: string) => void;
  labels: ColorLabels;
  onSaveLabel: (color: string, label: string) => void;
  colors: ThemeColors;
}) {
  const [editing, setEditing] = useState(false);
  // 입력 중인 이름 — 입력칸을 벗어날 때(onEndEditing) 저장한다
  const [drafts, setDrafts] = useState<ColorLabels>({});

  const startEdit = () => { setDrafts(labels); setEditing(true); };

  return (
    <View style={styles.colorSection}>
      <View style={styles.colorPicker}>
        {SCHEDULE_COLORS.map((c) => (
          <TouchableOpacity
            key={c}
            style={styles.colorItem}
            onPress={() => onChange(c)}
            onLongPress={startEdit}
            activeOpacity={0.8}
            accessibilityLabel={`${labels[c] ?? "이름 없는"} 색상${value === c ? ", 선택됨" : ""}`}
          >
            <View style={[styles.colorChip, { backgroundColor: c }, value === c && styles.colorChipSelected]}>
              {value === c && <Text style={styles.colorCheckmark}>✓</Text>}
            </View>
            <Text style={[styles.colorLabel, { color: value === c ? colors.text : colors.subtext }]} numberOfLines={1}>
              {labels[c] ?? ""}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
      <TouchableOpacity onPress={() => (editing ? setEditing(false) : startEdit())}>
        <Text style={[styles.colorEditLink, { color: colors.tint }]}>
          색상 별 편집 {editing ? "▲" : "▼"}
        </Text>
      </TouchableOpacity>
      {editing && (
        <View style={[styles.labelEditor, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
          {SCHEDULE_COLORS.map((c) => (
            <View key={c} style={styles.labelRow}>
              <View style={[styles.labelDot, { backgroundColor: c }]} />
              <TextInput
                style={[styles.labelInput, { color: colors.text, borderColor: colors.separator }]}
                placeholder="이름 없음"
                placeholderTextColor={colors.subtext}
                value={drafts[c] ?? ""}
                maxLength={8}
                onChangeText={(t) => setDrafts((d) => ({ ...d, [c]: t }))}
                onEndEditing={() => onSaveLabel(c, drafts[c] ?? "")}
                returnKeyType="done"
              />
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

// ── 일정 행 ───────────────────────────────────────────────────

function ScheduleRow({ item, date, label, colors, onDelete, onEdit }: {
  item: ScheduleItem;
  date: string;
  label?: string;
  colors: ThemeColors;
  onDelete: () => void;
  onEdit: () => void;
}) {
  const barColor = item.color || colors.tint;
  const period = periodLabel(item);
  const timeLabel = timeLabelOn(item, date);

  return (
    <TouchableOpacity
      style={[styles.scheduleRow, { borderLeftColor: barColor }]}
      onLongPress={() =>
        Alert.alert("일정 관리", item.title, [
          { text: "수정", onPress: onEdit },
          { text: "삭제", style: "destructive", onPress: onDelete },
          { text: "취소", style: "cancel" },
        ])
      }
      activeOpacity={0.7}
    >
      <View style={styles.scheduleMain}>
        <View style={styles.scheduleTitleRow}>
          {label ? (
            <View style={[styles.labelPill, { backgroundColor: withAlpha(barColor, "22") }]}>
              <Text style={[styles.labelPillText, { color: barColor }]}>{label}</Text>
            </View>
          ) : null}
          <Text style={[styles.scheduleTitle, { color: colors.text }]} numberOfLines={1}>{item.title}</Text>
        </View>
        {period || item.note ? (
          <Text style={[styles.scheduleNote, { color: colors.subtext }]} numberOfLines={1}>
            {[period, item.note].filter(Boolean).join(" · ")}
          </Text>
        ) : null}
      </View>
      <Text style={[styles.scheduleTime, { color: timeLabel === "종일" ? colors.subtext : barColor }]}>{timeLabel}</Text>
    </TouchableOpacity>
  );
}

// ── 거래 행 (피드백 6번: 수입·지출 태그 색 구분) ─────────────────

function TransactionRow({ item, colors, onDelete, onEdit }: {
  item: Transaction;
  colors: ThemeColors;
  onDelete: () => void;
  onEdit: () => void;
}) {
  const isIncome = item.type === "income";
  const tone = isIncome ? colors.income : colors.expense;
  return (
    <TouchableOpacity
      style={[styles.txRow, { borderBottomColor: colors.separator }]}
      onLongPress={() =>
        Alert.alert(
          "거래 관리",
          `${item.category}  ${isIncome ? "+" : "-"}${formatAmount(item.amount)}`,
          [
            { text: "수정", onPress: onEdit },
            { text: "삭제", style: "destructive", onPress: onDelete },
            { text: "취소", style: "cancel" },
          ],
        )
      }
      activeOpacity={0.7}
    >
      <View style={[styles.txBadge, { backgroundColor: withAlpha(tone, "1F") }]}>
        <Text style={[styles.txBadgeText, { color: tone }]}>{isIncome ? "수입" : "지출"} · {item.category}</Text>
      </View>
      <Text style={[styles.txNote, { color: colors.text }]} numberOfLines={1}>
        {item.note || item.category}
      </Text>
      <Text style={[styles.txAmount, { color: tone }]}>
        {isIncome ? "+" : "-"}{formatAmount(item.amount)}
      </Text>
    </TouchableOpacity>
  );
}

// ── 일정 추가·수정 시트 (피드백 8·12·14번) ──────────────────────

interface ScheduleModalProps {
  visible: boolean;
  initialDate: string;
  onClose: () => void;
  onSubmit: (s: NewScheduleItem) => void;
  colors: ThemeColors;
  initialData?: ScheduleItem;
  labels: ColorLabels;
  onSaveLabel: (color: string, label: string) => void;
}

function ScheduleModal({ visible, initialDate, onClose, onSubmit, colors, initialData, labels, onSaveLabel }: ScheduleModalProps) {
  const [title, setTitle] = useState("");
  // 시작일·종료일·시작 시간·종료 시간은 한 필드(ScheduleWhenField)에서 함께 고른다 (수정 6번)
  const [when, setWhen] = useState<ScheduleWhen>({ date: initialDate, endDate: "", time: "", endTime: "" });
  const [note, setNote] = useState("");
  const [color, setColor] = useState(SCHEDULE_COLORS[0]);
  const isEdit = !!initialData;

  useEffect(() => {
    if (!visible) return;
    setTitle(initialData?.title ?? "");
    setWhen({
      date: initialData?.date ?? initialDate,
      endDate: initialData?.end_date ?? "",
      time: initialData?.time ?? "",
      endTime: initialData?.end_time ?? "",
    });
    setNote(initialData?.note ?? "");
    setColor(initialData?.color || SCHEDULE_COLORS[0]);
  }, [visible, initialDate, initialData]);

  const { date, endDate, time, endTime } = when;
  const multiDay = !!endDate && endDate > date;

  const handleSubmit = () => {
    if (!title.trim()) { Alert.alert("입력 오류", "제목을 입력해 주세요."); return; }
    if (endTime && !time) { Alert.alert("입력 오류", "끝나는 시간을 정하려면 시작 시간도 골라 주세요."); return; }
    // 하루짜리 일정은 끝 시각이 시작 시각보다 뒤여야 한다 (기간 일정은 마지막 날 기준이라 비교하지 않음)
    if (!multiDay && time && endTime && endTime <= time) {
      Alert.alert("입력 오류", "끝나는 시간은 시작 시간보다 늦어야 합니다.");
      return;
    }
    onSubmit({
      title: title.trim(),
      date,
      end_date: multiDay ? endDate : "",
      time,
      end_time: time ? endTime : "",
      note: note.trim(),
      color,
    });
  };

  return (
    <BottomSheet
      visible={visible}
      onClose={onClose}
      title={isEdit ? "일정 수정" : "일정 추가"}
      colors={colors}
      footer={
        <TouchableOpacity style={[styles.submitBtn, { backgroundColor: color }]} onPress={handleSubmit}>
          <Text style={styles.submitBtnText}>{isEdit ? "수정하기" : "추가하기"}</Text>
        </TouchableOpacity>
      }
    >
      <Text style={[styles.fieldLabel, { color: colors.subtext }]}>제목 *</Text>
      <TextInput
        style={[styles.input, { color: colors.text, borderColor: colors.separator, backgroundColor: colors.card }]}
        placeholder="일정 제목" placeholderTextColor={colors.subtext}
        value={title} onChangeText={setTitle} autoFocus={!isEdit}
      />

      <ScheduleWhenField value={when} onChange={setWhen} colors={colors} initiallyOpen={!isEdit} />

      <Text style={[styles.fieldLabel, { color: colors.subtext }]}>메모 (선택)</Text>
      <TextInput
        style={[styles.input, { color: colors.text, borderColor: colors.separator, backgroundColor: colors.card }]}
        placeholder="메모" placeholderTextColor={colors.subtext}
        value={note} onChangeText={setNote}
      />

      <Text style={[styles.fieldLabel, { color: colors.subtext }]}>색상</Text>
      <ColorPicker value={color} onChange={setColor} labels={labels} onSaveLabel={onSaveLabel} colors={colors} />
    </BottomSheet>
  );
}

// ── 거래 추가·수정 시트 ───────────────────────────────────────

interface BudgetModalProps {
  visible: boolean;
  initialDate: string;
  initialType?: "income" | "expense";
  onClose: () => void;
  onSubmit: (t: NewTransaction) => void;
  colors: ThemeColors;
  initialData?: Transaction;
}

function BudgetModal({ visible, initialDate, initialType = "expense", onClose, onSubmit, colors, initialData }: BudgetModalProps) {
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
  const tone = type === "expense" ? colors.expense : colors.income;

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
    onSubmit({ type, amount: num, category, note: note.trim(), date });
  };

  return (
    <BottomSheet
      visible={visible}
      onClose={onClose}
      title={isEdit ? "거래 수정" : "거래 추가"}
      colors={colors}
      footer={
        <TouchableOpacity style={[styles.submitBtn, { backgroundColor: tone }]} onPress={handleSubmit}>
          <Text style={styles.submitBtnText}>{isEdit ? "수정하기" : "추가하기"}</Text>
        </TouchableOpacity>
      }
    >
      {/* 수입/지출 토글 */}
      <View style={[styles.typeToggle, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
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
        style={[styles.input, { color: colors.text, backgroundColor: colors.card, borderColor: colors.separator }]}
        placeholder="금액 입력 (원)" placeholderTextColor={colors.subtext}
        keyboardType="number-pad" value={amount} onChangeText={handleAmountChange} autoFocus={!isEdit}
      />

      <Text style={[styles.fieldLabel, { color: colors.subtext }]}>카테고리</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.categoryList}>
        {categories.map((c) => (
          <TouchableOpacity
            key={c}
            style={[styles.categoryChip, { borderColor: colors.separator, backgroundColor: colors.card },
              category === c && { backgroundColor: tone, borderColor: tone }]}
            onPress={() => setCategory(c)}
          >
            <Text style={[styles.categoryText, { color: category === c ? "#fff" : colors.subtext }]}>{c}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <DateField label="날짜" value={date} onChange={setDate} colors={colors} />

      <Text style={[styles.fieldLabel, { color: colors.subtext }]}>메모 (선택)</Text>
      <TextInput
        style={[styles.input, { color: colors.text, backgroundColor: colors.card, borderColor: colors.separator }]}
        placeholder="메모" placeholderTextColor={colors.subtext}
        value={note} onChangeText={setNote}
      />
    </BottomSheet>
  );
}

// ── 하루 한눈에 보기 (피드백 15번) ─────────────────────────────

function DetailSection({ title, right, children, colors }: { title: string; right?: string; children: ReactNode; colors: ThemeColors }) {
  return (
    <View style={[styles.detailCard, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
      <View style={styles.detailHeader}>
        <Text style={[styles.detailTitle, { color: colors.subtext }]}>{title}</Text>
        {right ? <Text style={[styles.detailRight, { color: colors.subtext }]}>{right}</Text> : null}
      </View>
      {children}
    </View>
  );
}

function DayDetailSheet({
  visible, onClose, date, schedules, todoCount, doneCount, txs, labels, colors,
}: {
  visible: boolean;
  onClose: () => void;
  date: string;
  schedules: ScheduleItem[];
  todoCount: number;
  doneCount: number;
  txs: Transaction[];
  labels: ColorLabels;
  colors: ThemeColors;
}) {
  const incomes = txs.filter((t) => t.type === "income");
  const expenses = txs.filter((t) => t.type === "expense");
  const sum = (list: Transaction[]) => list.reduce((s, t) => s + t.amount, 0);

  return (
    <BottomSheet visible={visible} onClose={onClose} title={formatMonthDay(date)} colors={colors}>
      <DetailSection colors={colors} title="일정" right={`${schedules.length}개`}>
        {schedules.length === 0 ? (
          <Text style={[styles.detailEmpty, { color: colors.subtext }]}>일정이 없습니다.</Text>
        ) : schedules.map((s) => (
          <View key={s.id} style={styles.detailLine}>
            <View style={[styles.detailDot, { backgroundColor: s.color || colors.tint }]} />
            <Text style={[styles.detailText, { color: colors.text }]} numberOfLines={1}>
              {labels[s.color] ? `[${labels[s.color]}] ` : ""}{s.title}
            </Text>
            <Text style={[styles.detailMeta, { color: colors.subtext }]}>{timeLabelOn(s, date)}</Text>
          </View>
        ))}
      </DetailSection>

      <DetailSection colors={colors} title="할 일" right={todoCount ? `${doneCount}/${todoCount} 완료` : undefined}>
        <Text style={[styles.detailEmpty, { color: colors.subtext }]}>
          {todoCount ? `할 일 ${todoCount}개 중 ${doneCount}개를 끝냈어요.` : "할 일이 없습니다."}
        </Text>
      </DetailSection>

      <DetailSection colors={colors} title="지출" right={expenses.length ? `-${formatAmount(sum(expenses))}` : undefined}>
        {expenses.length === 0 ? (
          <Text style={[styles.detailEmpty, { color: colors.subtext }]}>지출이 없습니다.</Text>
        ) : expenses.map((t) => (
          <View key={t.id} style={styles.detailLine}>
            <Text style={[styles.detailText, { color: colors.text }]} numberOfLines={1}>{t.category}{t.note ? ` · ${t.note}` : ""}</Text>
            <Text style={[styles.detailAmount, { color: colors.expense }]}>-{formatAmount(t.amount)}</Text>
          </View>
        ))}
      </DetailSection>

      <DetailSection colors={colors} title="수입" right={incomes.length ? `+${formatAmount(sum(incomes))}` : undefined}>
        {incomes.length === 0 ? (
          <Text style={[styles.detailEmpty, { color: colors.subtext }]}>수입이 없습니다.</Text>
        ) : incomes.map((t) => (
          <View key={t.id} style={styles.detailLine}>
            <Text style={[styles.detailText, { color: colors.text }]} numberOfLines={1}>{t.category}{t.note ? ` · ${t.note}` : ""}</Text>
            <Text style={[styles.detailAmount, { color: colors.income }]}>+{formatAmount(t.amount)}</Text>
          </View>
        ))}
      </DetailSection>
    </BottomSheet>
  );
}

// ── 메인 화면 ─────────────────────────────────────────────────

export default function ScheduleScreen() {
  const colors = Colors[useColorScheme() ?? "light"];
  const insets = useSafeAreaInsets();

  const {
    monthSchedules, selectedDate, selectedDateSchedules, colorLabels,
    year, month, isLoaded,
    loadMonth, selectDate, goToDate, goToday, loadColorLabels, saveColorLabel,
    add: addSchedule, update: updateSchedule, remove: removeSchedule,
  } = useScheduleStore();

  const {
    transactions, loadMonth: loadBudgetMonth,
    add: addTransaction, update: updateTransaction, remove: removeTransaction,
  } = useBudgetStore();

  const { selectedTodos, selectedRoutines, loadDate: loadTodosForDate } = useTodoStore();

  const [scheduleModalVisible, setScheduleModalVisible] = useState(false);
  const [editSchedule, setEditSchedule] = useState<ScheduleItem | undefined>();
  const [budgetModalVisible, setBudgetModalVisible] = useState(false);
  const [budgetInitialType, setBudgetInitialType] = useState<"income" | "expense">("expense");
  const [editTransaction, setEditTransaction] = useState<Transaction | undefined>();
  const [todoSheetVisible, setTodoSheetVisible] = useState(false);
  const [editRoutine, setEditRoutine] = useState<{ id: number; title: string; weekdays: string } | undefined>();
  const [detailVisible, setDetailVisible] = useState(false);
  const [jumpVisible, setJumpVisible] = useState(false);
  // 달력의 '오늘' 기준 — 앱을 켜 둔 채 자정이 지나도 다시 그려지도록 상태로 둔다 (수정 2번)
  const [today, setToday] = useState(todayString());
  const todayRef = useRef(today);

  // 첫 진입: 보고 있는 달의 일정·거래와 색상 이름을 불러온다
  useEffect(() => {
    loadMonth(year, month);
    loadBudgetMonth(year, month);
    loadColorLabels();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 날짜를 고를 때마다 그날의 할 일·루틴을 불러온다 (피드백 2번)
  useEffect(() => {
    loadTodosForDate(selectedDate);
  }, [selectedDate, loadTodosForDate]);

  // 백그라운드에서 돌아왔을 때 날짜가 바뀌었으면 오늘 표시를 갱신하고,
  // 어제(=그때의 오늘)를 보고 있었다면 새 오늘로 옮긴다
  useEffect(() => {
    const sub = AppState.addEventListener("change", (state) => {
      if (state !== "active") return;
      const now = todayString();
      if (now === todayRef.current) return;
      const wasOnToday = useScheduleStore.getState().selectedDate === todayRef.current;
      todayRef.current = now;
      setToday(now);
      if (wasOnToday) {
        goToday();
        const d = new Date();
        loadBudgetMonth(d.getFullYear(), d.getMonth() + 1);
      }
    });
    return () => sub.remove();
  }, [goToday, loadBudgetMonth]);

  // 수정 1번: 연·월·일을 골라 바로 이동
  const handleJump = useCallback(async (date: string) => {
    await goToDate(date);
    const [y, m] = date.split("-").map(Number);
    await loadBudgetMonth(y, m);
  }, [goToDate, loadBudgetMonth]);

  const changeMonth = useCallback((delta: -1 | 1) => {
    const next = shiftMonth(year, month, delta);
    loadMonth(next.year, next.month);
    loadBudgetMonth(next.year, next.month);
  }, [year, month, loadMonth, loadBudgetMonth]);

  // 피드백 4번: 오늘로 돌아가기
  const handleGoToday = useCallback(async () => {
    await goToday();
    const d = new Date();
    await loadBudgetMonth(d.getFullYear(), d.getMonth() + 1);
  }, [goToday, loadBudgetMonth]);

  const selectedDateTransactions = transactions.filter((t) => t.date === selectedDate);
  const marks = useMemo(
    () => buildMarks(year, month, monthSchedules, transactions),
    [year, month, monthSchedules, transactions],
  );

  const handleFabPress = () => {
    Alert.alert("추가하기", formatMonthDay(selectedDate), [
      { text: "📅 일정 추가", onPress: () => { setEditSchedule(undefined); setScheduleModalVisible(true); } },
      { text: "💸 지출 추가", onPress: () => { setEditTransaction(undefined); setBudgetInitialType("expense"); setBudgetModalVisible(true); } },
      { text: "💰 수입 추가", onPress: () => { setEditTransaction(undefined); setBudgetInitialType("income"); setBudgetModalVisible(true); } },
      { text: "취소", style: "cancel" },
    ]);
  };

  const handleEditRoutine = useCallback((r: RoutineForDate) => {
    setEditRoutine({ id: r.id, title: r.title, weekdays: r.weekdays });
    setTodoSheetVisible(true);
  }, []);

  const isToday = selectedDate === today;
  const isThisMonth = (() => { const d = new Date(); return year === d.getFullYear() && month === d.getMonth() + 1; })();
  const todoTotal = selectedTodos.length + selectedRoutines.length;
  const todoDone = [...selectedTodos, ...selectedRoutines].filter((t) => t.done).length;
  const totalCount = selectedDateSchedules.length + todoTotal + selectedDateTransactions.length;

  const dayIncome = selectedDateTransactions.filter((t) => t.type === "income").reduce((s, t) => s + t.amount, 0);
  const dayExpense = selectedDateTransactions.filter((t) => t.type === "expense").reduce((s, t) => s + t.amount, 0);

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      {/* 월 헤더 — 상단 안전 영역만큼 내려서 상태바와 겹치지 않게 (피드백 1번) */}
      <View style={[styles.monthHeader, { paddingTop: insets.top + 8 }]}>
        <TouchableOpacity onPress={() => changeMonth(-1)} style={styles.monthArrow} hitSlop={{ top: 16, bottom: 16, left: 16, right: 16 }} accessibilityLabel="이전 달">
          <Text style={[styles.monthArrowText, { color: colors.tint }]}>‹</Text>
        </TouchableOpacity>
        {/* 연·월을 누르면 날짜 이동 창 (수정 1번) */}
        <TouchableOpacity onPress={() => setJumpVisible(true)} accessibilityLabel={`${year}년 ${month}월, 눌러서 날짜 이동`}>
          <Text style={[styles.monthLabel, { color: colors.text }]}>
            {year}년 {month}월 <Text style={[styles.monthCaret, { color: colors.subtext }]}>▾</Text>
          </Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => changeMonth(1)} style={styles.monthArrow} hitSlop={{ top: 16, bottom: 16, left: 16, right: 16 }} accessibilityLabel="다음 달">
          <Text style={[styles.monthArrowText, { color: colors.tint }]}>›</Text>
        </TouchableOpacity>
        {/* 오늘 버튼 — 이미 오늘을 보고 있으면 흐리게 */}
        <TouchableOpacity
          onPress={handleGoToday}
          style={[styles.todayBtn, { borderColor: colors.tint, opacity: isToday && isThisMonth ? 0.4 : 1 }]}
          disabled={isToday && isThisMonth}
          accessibilityLabel="오늘로 이동"
        >
          <Text style={[styles.todayBtnText, { color: colors.tint }]}>오늘</Text>
        </TouchableOpacity>
      </View>

      <MonthCalendar
        year={year} month={month} selectedDate={selectedDate} marks={marks} today={today}
        onSelectDate={selectDate} onSwipeMonth={changeMonth} colors={colors}
      />

      {/* 선택한 날짜 바 */}
      <View style={[styles.selectedDateBar, { borderTopColor: colors.separator }]}>
        <Text style={[styles.selectedDateText, { color: colors.text }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.85}>
          {formatMonthDay(selectedDate)}{isToday ? " · 오늘" : ""}
        </Text>
        <View style={styles.barActions}>
          <TouchableOpacity
            onPress={() => setDetailVisible(true)}
            style={[styles.detailBtn, { backgroundColor: colors.tintLight }]}
            accessibilityLabel="이 날짜 한눈에 보기"
          >
            <Text style={[styles.detailBtnText, { color: colors.tint }]}>한눈에 보기 · {totalCount}</Text>
          </TouchableOpacity>
          {/* 추가 버튼 — 화면 아래에 떠 있으면 목록(수입·지출 등)을 가려서 날짜 바로 옮겼다 */}
          <TouchableOpacity
            onPress={handleFabPress}
            style={[styles.addBtn, { backgroundColor: colors.tint }]}
            accessibilityLabel={`${formatMonthDay(selectedDate)}에 추가`}
          >
            <Text style={styles.addBtnText}>+ 추가</Text>
          </TouchableOpacity>
        </View>
      </View>

      {isLoaded && totalCount === 0 ? (
        <View style={styles.empty}>
          <Text style={[styles.emptyText, { color: colors.subtext }]}>일정·할 일·거래 내역이 없습니다.</Text>
          <Text style={[styles.emptyHint, { color: colors.subtext }]}>오른쪽 위 + 추가 버튼으로 추가하세요</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.listContent}>
          {(dayIncome > 0 || dayExpense > 0) && (
            <View style={[styles.daySummary, { backgroundColor: colors.card, borderColor: colors.cardBorder }, cardShadow]}>
              {dayIncome > 0 && <Text style={[styles.daySummaryText, { color: colors.income }]}>수입 +{formatAmount(dayIncome)}</Text>}
              {dayExpense > 0 && <Text style={[styles.daySummaryText, { color: colors.expense }]}>지출 -{formatAmount(dayExpense)}</Text>}
            </View>
          )}

          {selectedDateSchedules.length > 0 && (
            <>
              <Text style={[styles.sectionTitle, { color: colors.subtext }]}>일정</Text>
              {selectedDateSchedules.map((s) => (
                <ScheduleRow
                  key={s.id} item={s} date={selectedDate} label={colorLabels[s.color]} colors={colors}
                  onDelete={() => removeSchedule(s.id)}
                  onEdit={() => { setEditSchedule(s); setScheduleModalVisible(true); }}
                />
              ))}
            </>
          )}

          {todoTotal > 0 && (
            <>
              <Text style={[styles.sectionTitle, { color: colors.subtext }]}>할 일</Text>
              <TodoList
                todos={selectedTodos} routines={selectedRoutines} date={selectedDate}
                colors={colors} onEditRoutine={handleEditRoutine}
              />
            </>
          )}

          {selectedDateTransactions.length > 0 && (
            <>
              <Text style={[styles.sectionTitle, { color: colors.subtext }]}>수입·지출</Text>
              {selectedDateTransactions.map((t) => (
                <TransactionRow
                  key={t.id} item={t} colors={colors}
                  onDelete={() => removeTransaction(t.id)}
                  onEdit={() => { setEditTransaction(t); setBudgetModalVisible(true); }}
                />
              ))}
            </>
          )}

          <Text style={[styles.hintText, { color: colors.subtext }]}>항목을 길게 눌러 수정·삭제</Text>
        </ScrollView>
      )}

      <ScheduleModal
        visible={scheduleModalVisible}
        initialDate={selectedDate}
        onClose={() => { setScheduleModalVisible(false); setEditSchedule(undefined); }}
        onSubmit={async (s) => {
          setScheduleModalVisible(false);
          if (editSchedule) {
            await updateSchedule(editSchedule.id, s);
            setEditSchedule(undefined);
          } else {
            await addSchedule(s);
            // 시작 시간이 있는 일정은 첫날 10분 전 알림을 예약한다
            if (s.time) await scheduleEventNotification(s.title, s.date, s.time);
          }
        }}
        colors={colors}
        initialData={editSchedule}
        labels={colorLabels}
        onSaveLabel={saveColorLabel}
      />

      <BudgetModal
        visible={budgetModalVisible}
        initialDate={selectedDate}
        initialType={budgetInitialType}
        onClose={() => { setBudgetModalVisible(false); setEditTransaction(undefined); }}
        onSubmit={async (t) => {
          setBudgetModalVisible(false);
          if (editTransaction) await updateTransaction(editTransaction.id, t);
          else await addTransaction(t);
          setEditTransaction(undefined);
        }}
        colors={colors}
        initialData={editTransaction}
      />

      <TodoAddSheet
        visible={todoSheetVisible}
        onClose={() => { setTodoSheetVisible(false); setEditRoutine(undefined); }}
        initialDate={selectedDate}
        editRoutine={editRoutine}
        colors={colors}
      />

      <DateJumpSheet
        visible={jumpVisible}
        onClose={() => setJumpVisible(false)}
        selectedDate={selectedDate}
        onJump={handleJump}
        colors={colors}
      />

      <DayDetailSheet
        visible={detailVisible}
        onClose={() => setDetailVisible(false)}
        date={selectedDate}
        schedules={selectedDateSchedules}
        todoCount={todoTotal}
        doneCount={todoDone}
        txs={selectedDateTransactions}
        labels={colorLabels}
        colors={colors}
      />
    </View>
  );
}

// ── 스타일 ───────────────────────────────────────────────────

const styles = StyleSheet.create({
  screen: { flex: 1 },
  monthHeader: {
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    paddingHorizontal: 24, paddingBottom: 8, gap: 12,
  },
  monthArrow: { padding: 8 },
  monthArrowText: { fontSize: 32, fontWeight: "300" },
  monthLabel: { fontSize: 20, fontWeight: "700", minWidth: 120, textAlign: "center" },
  monthCaret: { fontSize: 14 },
  // 월 제목 줄의 세로 가운데에 맞춘 오른쪽 끝 버튼 (제목이 가운데 정렬을 유지하도록 absolute)
  todayBtn: { position: "absolute", right: 20, bottom: 22, borderWidth: 1, borderRadius: 14, paddingHorizontal: 10, paddingVertical: 4 },
  todayBtnText: { fontSize: 12, fontWeight: "600" },
  // ── 색상 선택 ─────────────────────────────────────────────
  colorSection: { gap: 6 },
  colorPicker: { flexDirection: "row", justifyContent: "space-between" },
  colorItem: { alignItems: "center", gap: 3, width: `${100 / 8}%` },
  colorChip: { width: 30, height: 30, borderRadius: 15, alignItems: "center", justifyContent: "center" },
  colorChipSelected: {
    borderWidth: 2.5, borderColor: "#fff",
    shadowColor: "#000", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.3, shadowRadius: 2, elevation: 3,
  },
  colorCheckmark: { color: "#fff", fontSize: 13, fontWeight: "700" },
  colorLabel: { fontSize: 10, height: 13 },
  colorEditLink: { fontSize: 12, fontWeight: "500", paddingVertical: 4 },
  labelEditor: { borderWidth: 1, borderRadius: 12, padding: 12, gap: 8 },
  labelRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  labelDot: { width: 16, height: 16, borderRadius: 8 },
  labelInput: { flex: 1, borderWidth: 1, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 7, fontSize: 14 },
  // ── 선택일 바 ─────────────────────────────────────────────
  selectedDateBar: {
    flexDirection: "row", justifyContent: "space-between", alignItems: "center",
    paddingHorizontal: 24, paddingVertical: 10, borderTopWidth: StyleSheet.hairlineWidth,
  },
  // 버튼 두 개와 한 줄에 놓이므로 좁은 화면에서는 날짜 글자가 줄어든다
  selectedDateText: { flexShrink: 1, fontSize: 15, fontWeight: "600", marginRight: 8 },
  barActions: { flexDirection: "row", alignItems: "center", gap: 8 },
  detailBtn: { borderRadius: 14, paddingHorizontal: 12, paddingVertical: 6 },
  addBtn: { borderRadius: 14, paddingHorizontal: 12, paddingVertical: 6 },
  addBtnText: { color: "#fff", fontSize: 12, fontWeight: "700" },
  detailBtnText: { fontSize: 12, fontWeight: "600" },
  // ── 목록 ──────────────────────────────────────────────────
  listContent: { paddingHorizontal: 24, paddingBottom: 32, gap: 8 },
  sectionTitle: { fontSize: 12, fontWeight: "600", letterSpacing: 0.5, marginTop: 6 },
  daySummary: { flexDirection: "row", gap: 12, padding: 12, borderRadius: 12, borderWidth: 1 },
  daySummaryText: { fontSize: 13, fontWeight: "600" },
  scheduleRow: { flexDirection: "row", alignItems: "center", paddingVertical: 10, paddingLeft: 12, borderLeftWidth: 3, gap: 8 },
  scheduleMain: { flex: 1, gap: 3 },
  scheduleTitleRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  labelPill: { borderRadius: 6, paddingHorizontal: 6, paddingVertical: 1 },
  labelPillText: { fontSize: 11, fontWeight: "600" },
  scheduleTitle: { flexShrink: 1, fontSize: 15, fontWeight: "500" },
  scheduleNote: { fontSize: 12 },
  scheduleTime: { fontSize: 13, fontWeight: "500", fontVariant: ["tabular-nums"] },
  txRow: { flexDirection: "row", alignItems: "center", paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, gap: 10 },
  txBadge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
  txBadgeText: { fontSize: 11, fontWeight: "600" },
  txNote: { flex: 1, fontSize: 14 },
  txAmount: { fontSize: 14, fontWeight: "700", fontVariant: ["tabular-nums"] },
  empty: { flex: 1, justifyContent: "center", alignItems: "center", paddingBottom: 40, gap: 6 },
  emptyText: { fontSize: 15 },
  emptyHint: { fontSize: 13 },
  hintText: { fontSize: 11, textAlign: "center", paddingTop: 8 },
  // ── 시트 공통 ─────────────────────────────────────────────
  fieldLabel: { fontSize: 12, fontWeight: "500", marginTop: 8 },
  input: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15 },
  submitBtn: { paddingVertical: 16, borderRadius: 14, alignItems: "center" },
  submitBtnText: { color: "#fff", fontSize: 16, fontWeight: "600" },
  typeToggle: { flexDirection: "row", borderRadius: 10, borderWidth: 1, overflow: "hidden", marginBottom: 4 },
  typeBtn: { flex: 1, paddingVertical: 12, alignItems: "center" },
  typeBtnText: { fontSize: 15, fontWeight: "600" },
  categoryList: { gap: 8, paddingVertical: 4 },
  categoryChip: { borderWidth: 1, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 8 },
  categoryText: { fontSize: 13 },
  // ── 한눈에 보기 ───────────────────────────────────────────
  detailCard: { borderWidth: 1, borderRadius: 12, padding: 14, gap: 8 },
  detailHeader: { flexDirection: "row", justifyContent: "space-between" },
  detailTitle: { fontSize: 12, fontWeight: "700", letterSpacing: 0.5 },
  detailRight: { fontSize: 12, fontWeight: "600", fontVariant: ["tabular-nums"] },
  detailEmpty: { fontSize: 13 },
  detailLine: { flexDirection: "row", alignItems: "center", gap: 8 },
  detailDot: { width: 8, height: 8, borderRadius: 4 },
  detailText: { flex: 1, fontSize: 14 },
  detailMeta: { fontSize: 12, fontVariant: ["tabular-nums"] },
  detailAmount: { fontSize: 13, fontWeight: "700", fontVariant: ["tabular-nums"] },
});
