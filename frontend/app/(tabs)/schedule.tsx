/**
 * 일정 + 가계부 + 할 일 통합 화면
 *
 * 구조:
 * 1. 월 헤더 (‹ 2026년 9월 › · 오늘 버튼)
 * 2. 달력 (좌우 스와이프로 달 이동, 날짜 아래 일정 색 점·수입/지출 막대)
 * 3. 선택한 날짜 바 (한눈에 보기 버튼)
 * 4. 그날의 일정 → 수입·지출 목록 (할 일은 홈에서만 다룬다)
 * 5. 날짜 바의 "+ 추가" → 일정 / 지출 / 수입
 *
 * 모든 데이터는 기기 로컬 SQLite에만 저장 (외부 전송 없음, CLAUDE.md §4).
 *
 * 2026-11 리디자인(시안 1): 월 제목 줄·날짜 바의 버튼과 동작은 그대로 두고(9/29 요청) 모양만 바꿨다.
 * 그날 목록은 흰 묶음 카드 안에 '색 막대 · 제목 / 시간 · 오른쪽 색 이름' 줄로, 수입·지출은 별도 카드로 나눈다.
 */

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  Alert,
  AppState,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Colors } from "@/constants/theme";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { ActionSheet } from "@/src/components/ActionSheet";
import { Text, TextInput } from "@/src/components/AppText";
import { BottomSheet } from "@/src/components/BottomSheet";
import { DateJumpSheet } from "@/src/components/DateJumpSheet";
import { BudgetModal, formatAmount, TransactionRow } from "@/src/components/BudgetModal";
import { ScheduleWhenField, type ScheduleWhen } from "@/src/components/DateTimeFields";
import { MonthCalendar, type CellEvent, type DayMark } from "@/src/components/MonthCalendar";
import { type Transaction } from "@/src/db/budget";
import { type ColorLabels } from "@/src/db/colorLabel";
import { type NewScheduleItem, type ScheduleItem } from "@/src/db/schedule";
import { useBudgetStore } from "@/src/store/budgetStore";
import { useHolidayStore } from "@/src/store/holidayStore";
import { useScheduleStore } from "@/src/store/scheduleStore";
import { formatMonthDay, parseDate, shiftMonth, toDateStr, todayString } from "@/src/utils/date";
import { scheduleEventNotification } from "@/src/utils/notifications";
import { SCHEDULE_COLORS } from "@/src/utils/scheduleColors";
import { lastDayOf, periodLabel, timeLabelOn } from "@/src/utils/scheduleText";

type ThemeColors = (typeof Colors)["light"];


// ── 유틸 ─────────────────────────────────────────────────────

/**
 * 달력 칸에 보여줄 날짜별 내용을 만든다.
 * - 시간 있는 하루 일정 → timed(색 막대 + 제목), 종일·여러 날 일정 → band(색 띠)
 * - 여러 날 일정은 칸마다 start / mid / end 위치를 매겨 띠를 이어 그릴 수 있게 한다
 * - 보고 있는 달 범위 안에서만 계산한다
 * 칸 안 순서: 여러 날 일정(시작일 빠른 순) → 종일 일정 → 시간 있는 일정(시각 순).
 * 여러 날 일정을 늘 맨 위에 두어야 이어지는 띠가 칸마다 같은 줄에 놓인다.
 */
function buildMarks(year: number, month: number, schedules: ScheduleItem[], txs: Transaction[]): Record<string, DayMark> {
  const marks: Record<string, DayMark> = {};
  const get = (d: string) => (marks[d] ??= { events: [], income: 0, expense: 0 });
  const monthStart = toDateStr(year, month, 1);
  const monthEnd = toDateStr(year, month, new Date(year, month, 0).getDate());

  type Placed = CellEvent & { order: string };
  const byDate: Record<string, Placed[]> = {};
  for (const s of schedules) {
    const last = lastDayOf(s);
    const multi = last !== s.date;
    const color = s.color || SCHEDULE_COLORS[0];
    const from = s.date > monthStart ? s.date : monthStart;
    const to = last < monthEnd ? last : monthEnd;
    for (let d = parseDate(from); ; d.setDate(d.getDate() + 1)) {
      const ds = toDateStr(d.getFullYear(), d.getMonth() + 1, d.getDate());
      if (ds > to) break;
      const span: CellEvent["span"] = !multi ? "single" : ds === s.date ? "start" : ds === last ? "end" : "mid";
      const kind: CellEvent["kind"] = multi || !s.time ? "band" : "timed";
      // 정렬 키: 0=여러 날(시작일), 1=종일, 2=시간 있는 일정(시각)
      const order = multi ? `0${s.date}` : !s.time ? "1" : `2${s.time}`;
      (byDate[ds] ??= []).push({ id: s.id, title: s.title, color, kind, span, order });
    }
  }
  for (const [date, items] of Object.entries(byDate)) {
    get(date).events = items
      .sort((a, b) => a.order.localeCompare(b.order) || a.id - b.id)
      .map(({ order: _order, ...ev }) => ev);
  }
  for (const t of txs) {
    const m = get(t.date);
    if (t.type === "income") m.income += t.amount;
    else m.expense += t.amount;
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

function ScheduleRow({ item, date, label, colors, onDelete, onEdit, first = false }: {
  item: ScheduleItem;
  date: string;
  label?: string;
  colors: ThemeColors;
  onDelete: () => void;
  onEdit: () => void;
  /** 카드의 첫 줄이면 위 구분선을 긋지 않는다 */
  first?: boolean;
}) {
  const barColor = item.color || colors.tint;
  // 길게 눌렀을 때 뜨는 수정·삭제 창 — Android에서도 취소할 수 있도록 시스템 알림창 대신 쓴다
  const [menuVisible, setMenuVisible] = useState(false);
  const period = periodLabel(item);
  const timeLabel = timeLabelOn(item, date);

  return (
    <TouchableOpacity
      style={[styles.scheduleRow, !first && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.separator }]}
      onLongPress={() => setMenuVisible(true)}
      activeOpacity={0.7}
      accessibilityHint="길게 눌러 수정하거나 삭제"
    >
      <ActionSheet
        visible={menuVisible}
        onClose={() => setMenuVisible(false)}
        title="일정 관리"
        message={item.title}
        actions={[
          { label: "수정", onPress: onEdit },
          { label: "삭제", onPress: onDelete, destructive: true },
        ]}
        colors={colors}
      />
      {/* 왼쪽 색 막대 — 일정 색 */}
      <View style={[styles.scheduleBar, { backgroundColor: barColor }]} />
      <View style={styles.scheduleMain}>
        <Text style={[styles.scheduleTitle, { color: colors.text }]} numberOfLines={1}>{item.title}</Text>
        <Text style={[styles.scheduleNote, { color: colors.subtext }]} numberOfLines={1}>
          {[timeLabel, period, item.note].filter(Boolean).join(" · ")}
        </Text>
      </View>
      {/* 오른쪽: 색 이름(회사·운동 등) — 이름을 붙인 색일 때만 */}
      {label ? <Text style={[styles.scheduleLabel, { color: colors.subtext }]} numberOfLines={1}>{label}</Text> : null}
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
      // 버튼은 주 색 — 예전처럼 고른 일정 색으로 칠하면 노랑·하늘색 위 흰 글자 대비가 2:1 정도로 낮았다
      footer={
        <TouchableOpacity style={[styles.submitBtn, { backgroundColor: colors.tint }]} onPress={handleSubmit} accessibilityRole="button">
          <Text style={[styles.submitBtnText, { color: colors.onTint }]}>{isEdit ? "수정하기" : "추가하기"}</Text>
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
  visible, onClose, date, schedules, txs, labels, colors,
}: {
  visible: boolean;
  onClose: () => void;
  date: string;
  schedules: ScheduleItem[];
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


  const [scheduleModalVisible, setScheduleModalVisible] = useState(false);
  const [editSchedule, setEditSchedule] = useState<ScheduleItem | undefined>();
  const [budgetModalVisible, setBudgetModalVisible] = useState(false);
  const [budgetInitialType, setBudgetInitialType] = useState<"income" | "expense">("expense");
  const [editTransaction, setEditTransaction] = useState<Transaction | undefined>();
  const [detailVisible, setDetailVisible] = useState(false);
  const [jumpVisible, setJumpVisible] = useState(false);
  // 공휴일 — 보고 있는 연도를 받아 둔다 (받지 못하면 공휴일 없이 표시)
  const { names: holidays, loadYear: loadHolidays } = useHolidayStore();
  useEffect(() => { loadHolidays(year); }, [year, loadHolidays]);
  // 달력의 '오늘' 기준 — 앱을 켜 둔 채 자정이 지나도 다시 그려지도록 상태로 둔다 (수정 2번)
  const [today, setToday] = useState(todayString());
  // 달력을 좌우로 미는 동안에는 화면의 세로 스크롤을 잠근다 — 밀다가 화면이 위아래로 움직여 달이 안 넘어가던 문제 방지
  const [calendarSwiping, setCalendarSwiping] = useState(false);
  const todayRef = useRef(today);

  // 첫 진입: 보고 있는 달의 일정·거래와 색상 이름을 불러온다
  useEffect(() => {
    loadMonth(year, month);
    loadBudgetMonth(year, month);
    loadColorLabels();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  // 달력 칸 탭: 이번 달 날짜는 선택만, 앞뒤 달 날짜는 그 달로 이동하면서 선택
  const handleSelectDate = useCallback((date: string) => {
    if (date.startsWith(`${year}-${String(month).padStart(2, "0")}`)) selectDate(date);
    else handleJump(date);
  }, [year, month, selectDate, handleJump]);

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

  // + 추가를 누르면 무엇을 추가할지 고르는 창 — 취소·바깥 누르기로 닫을 수 있다
  const [addMenuVisible, setAddMenuVisible] = useState(false);
  const handleFabPress = () => setAddMenuVisible(true);
  const addActions = [
    { label: "일정 추가", onPress: () => { setEditSchedule(undefined); setScheduleModalVisible(true); } },
    { label: "지출 추가", onPress: () => { setEditTransaction(undefined); setBudgetInitialType("expense"); setBudgetModalVisible(true); } },
    { label: "수입 추가", onPress: () => { setEditTransaction(undefined); setBudgetInitialType("income"); setBudgetModalVisible(true); } },
  ];

  const isToday = selectedDate === today;
  const isThisMonth = (() => { const d = new Date(); return year === d.getFullYear() && month === d.getMonth() + 1; })();
  // 할 일은 홈에서만 다룬다 — 일정 탭에는 일정과 수입·지출만 보여준다
  const totalCount = selectedDateSchedules.length + selectedDateTransactions.length;

  const dayIncome = selectedDateTransactions.filter((t) => t.type === "income").reduce((s, t) => s + t.amount, 0);
  const dayExpense = selectedDateTransactions.filter((t) => t.type === "expense").reduce((s, t) => s + t.amount, 0);

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      {/* 월 헤더 — 상단 안전 영역만큼 내려서 상태바와 겹치지 않게 (피드백 1번) */}
      <View style={[styles.monthHeader, { paddingTop: insets.top + 8 }]}>
        <TouchableOpacity onPress={() => changeMonth(-1)} style={styles.monthArrow} accessibilityLabel="이전 달">
          <Text style={[styles.monthArrowText, { color: colors.subtext }]}>‹</Text>
        </TouchableOpacity>
        {/* 연·월을 누르면 날짜 이동 창 (수정 1번) */}
        <TouchableOpacity onPress={() => setJumpVisible(true)} accessibilityLabel={`${year}년 ${month}월, 눌러서 날짜 이동`}>
          <Text style={[styles.monthLabel, { color: colors.text }]}>
            {year}년 {month}월 <Text style={[styles.monthCaret, { color: colors.subtext }]}>▾</Text>
          </Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => changeMonth(1)} style={styles.monthArrow} accessibilityLabel="다음 달">
          <Text style={[styles.monthArrowText, { color: colors.subtext }]}>›</Text>
        </TouchableOpacity>
        {/* 왼쪽: 오늘 — 시안 1처럼 테두리 없는 글자 버튼. 이미 오늘을 보고 있으면 흐리게 */}
        <TouchableOpacity
          onPress={handleGoToday}
          style={[styles.todayBtn, { opacity: isToday && isThisMonth ? 0.4 : 1 }]}
          disabled={isToday && isThisMonth}
          accessibilityRole="button"
          accessibilityLabel="오늘로 이동"
        >
          <Text style={[styles.todayBtnText, { color: colors.tint }]}>오늘</Text>
        </TouchableOpacity>
        {/* 오른쪽: 추가 버튼 — 선택한 날짜에 일정·지출·수입 추가. 연한 파랑 보조 버튼 */}
        <TouchableOpacity
          onPress={handleFabPress}
          style={[styles.addBtn, { backgroundColor: colors.tintLight }]}
          accessibilityRole="button"
          accessibilityLabel={`${formatMonthDay(selectedDate)}에 추가`}
        >
          <Text style={[styles.addBtnText, { color: colors.tintStrong }]}>추가</Text>
        </TouchableOpacity>
      </View>

      {/* 달력이 커져서 달력과 그날 목록을 한 번에 스크롤한다.
          날짜 바(한눈에 보기)는 stickyHeaderIndices로 스크롤해도 위에 고정된다. */}
      <ScrollView
        style={styles.body}
        contentContainerStyle={styles.bodyContent}
        stickyHeaderIndices={[1]}
        keyboardShouldPersistTaps="handled"
        scrollEnabled={!calendarSwiping}
        // iOS: 스크롤이 시작되면 한 방향으로만 움직이게 해 비스듬한 손가락 움직임에 덜 흔들린다
        directionalLockEnabled
      >
        <MonthCalendar
          year={year} month={month} selectedDate={selectedDate} marks={marks} today={today} holidays={holidays}
          onSelectDate={handleSelectDate} onSwipeMonth={changeMonth} onSwipeActiveChange={setCalendarSwiping} colors={colors}
        />

        {/* 선택한 날짜 바 — 고정될 때 뒤 내용이 비치지 않도록 배경색을 칠한다.
            고정 헤더(stickyHeaderIndices)는 바로 안쪽 요소의 style을 바깥 틀로 옮기고 그 요소를 flex: 1로 바꾼다.
            그래서 가로 배치(flexDirection: row)를 한 겹 안쪽 View에 두어야 날짜와 버튼이 한 줄에 놓인다. */}
        <View style={[styles.selectedDateSticky, { borderTopColor: colors.separator, backgroundColor: colors.background }]}>
          <View style={styles.selectedDateBar}>
            <Text style={[styles.selectedDateText, { color: colors.text }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.85}>
              {formatMonthDay(selectedDate)}{holidays[selectedDate] ? ` · ${holidays[selectedDate]}` : ""}{isToday ? " · 오늘" : ""}
            </Text>
            <View style={styles.barActions}>
              <TouchableOpacity
                onPress={() => setDetailVisible(true)}
                style={styles.detailBtn}
                accessibilityRole="button"
                accessibilityLabel="이 날짜 한눈에 보기"
              >
                <Text style={[styles.detailBtnText, { color: colors.tint }]}>한눈에 보기 · {totalCount}</Text>
              </TouchableOpacity>
              {/* 달력을 아래로 내려 목록을 보는 중에도 바로 추가할 수 있게, 고정되는 날짜 바에도 추가 버튼을 둔다.
                  맨 위 월 제목 줄의 + 추가와 같은 동작이다 (선택한 날짜에 일정·지출·수입 추가) */}
              <TouchableOpacity
                onPress={handleFabPress}
                style={[styles.barAddBtn, { backgroundColor: colors.tintLight }]}
                accessibilityRole="button"
                accessibilityLabel="이 날짜에 일정 또는 가계부 추가"
              >
                <Text style={[styles.addBtnText, { color: colors.tintStrong }]}>추가</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>

        {isLoaded && totalCount === 0 ? (
          <View style={styles.empty}>
            <Text style={[styles.emptyText, { color: colors.subtext }]}>일정·거래 내역이 없습니다.</Text>
            <Text style={[styles.emptyHint, { color: colors.subtext }]}>추가 버튼으로 넣을 수 있어요</Text>
          </View>
        ) : (
          <View style={styles.listContent}>
            {selectedDateSchedules.length > 0 && (
              <>
                <Text style={[styles.sectionTitle, { color: colors.subtext }]}>일정</Text>
                <View style={[styles.listCard, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
                  {selectedDateSchedules.map((s, i) => (
                    <ScheduleRow
                      key={s.id} item={s} date={selectedDate} label={colorLabels[s.color]} colors={colors} first={i === 0}
                      onDelete={() => removeSchedule(s.id)}
                      onEdit={() => { setEditSchedule(s); setScheduleModalVisible(true); }}
                    />
                  ))}
                </View>
              </>
            )}

            {selectedDateTransactions.length > 0 && (
              <>
                {/* 제목 오른쪽에 그날 수입·지출 합계 */}
                <View style={styles.sectionHeaderRow}>
                  <Text style={[styles.sectionTitle, styles.sectionTitleInRow, { color: colors.subtext }]}>수입·지출</Text>
                  <View style={styles.daySummary}>
                    {dayIncome > 0 && <Text style={[styles.daySummaryText, { color: colors.income }]}>수입 +{formatAmount(dayIncome)}</Text>}
                    {dayExpense > 0 && <Text style={[styles.daySummaryText, { color: colors.expense }]}>지출 -{formatAmount(dayExpense)}</Text>}
                  </View>
                </View>
                <View style={[styles.listCard, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
                  {selectedDateTransactions.map((t, i) => (
                    <TransactionRow
                      key={t.id} item={t} colors={colors} first={i === 0}
                      onDelete={() => removeTransaction(t.id)}
                      onEdit={() => { setEditTransaction(t); setBudgetModalVisible(true); }}
                    />
                  ))}
                </View>
              </>
            )}

            <Text style={[styles.hintText, { color: colors.subtext }]}>항목을 길게 눌러 수정·삭제</Text>
          </View>
        )}
      </ScrollView>

      <ActionSheet
        visible={addMenuVisible}
        onClose={() => setAddMenuVisible(false)}
        title="추가하기"
        message={formatMonthDay(selectedDate)}
        actions={addActions}
        colors={colors}
      />

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
    paddingHorizontal: 20, paddingBottom: 12, gap: 4,
  },
  // 화살표 터치 영역 44×44
  monthArrow: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  monthArrowText: { fontSize: 28, fontWeight: "300" },
  monthLabel: { fontSize: 20, fontWeight: "700", minWidth: 120, textAlign: "center" },
  monthCaret: { fontSize: 14 },
  // 월 제목 줄 양 끝 버튼 (제목이 가운데 정렬을 유지하도록 absolute). 높이 44로 터치 영역 확보
  todayBtn: { position: "absolute", left: 12, bottom: 12, height: 44, paddingHorizontal: 8, justifyContent: "center" },
  todayBtnText: { fontSize: 15, fontWeight: "600" },
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
  selectedDateSticky: { borderTopWidth: StyleSheet.hairlineWidth },
  selectedDateBar: {
    flexDirection: "row", justifyContent: "space-between", alignItems: "center",
    paddingHorizontal: 20, paddingVertical: 10,
  },
  // 버튼 두 개와 한 줄에 놓이므로 좁은 화면에서는 날짜 글자가 줄어든다
  selectedDateText: { flexShrink: 1, fontSize: 17, fontWeight: "700", marginRight: 8 },
  barActions: { flexDirection: "row", alignItems: "center", gap: 4 },
  // 한눈에 보기 — 글자 버튼(시안 1). 높이 36 + 좌우 여백으로 누르기 쉽게
  detailBtn: { minHeight: 36, paddingHorizontal: 8, justifyContent: "center" },
  // 날짜 바의 추가 버튼 — 연한 파랑 보조 버튼
  barAddBtn: { borderRadius: 12, paddingHorizontal: 16, minHeight: 36, justifyContent: "center" },
  // 월 제목 줄 오른쪽 끝 — 오늘 버튼(왼쪽)과 같은 높이에 맞춘다
  addBtn: { position: "absolute", right: 20, bottom: 16, borderRadius: 12, paddingHorizontal: 16, minHeight: 36, justifyContent: "center" },
  addBtnText: { fontSize: 14, fontWeight: "700" },
  detailBtnText: { fontSize: 14, fontWeight: "600" },
  // ── 목록 ──────────────────────────────────────────────────
  body: { flex: 1 },
  bodyContent: { paddingBottom: 32 },
  listContent: { paddingHorizontal: 20, gap: 8 },
  // 그날 목록 묶음 카드 — 그림자 없이 얇은 테두리, 안쪽 줄은 구분선
  listCard: { borderWidth: 1, borderRadius: 16, paddingHorizontal: 16 },
  sectionTitle: { fontSize: 13, fontWeight: "600", marginTop: 8, marginLeft: 4 },
  sectionHeaderRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 8, marginLeft: 4 },
  sectionTitleInRow: { marginTop: 0 },
  daySummary: { flexDirection: "row", gap: 10 },
  daySummaryText: { fontSize: 13, fontWeight: "700", fontVariant: ["tabular-nums"] },
  // 일정 한 줄: 색 막대 · (제목 / 시간·기간·메모) · 색 이름
  scheduleRow: { flexDirection: "row", alignItems: "center", minHeight: 56, paddingVertical: 12, gap: 12 },
  scheduleBar: { width: 3, alignSelf: "stretch", borderRadius: 2 },
  scheduleMain: { flex: 1, gap: 3 },
  scheduleTitle: { fontSize: 16, fontWeight: "600" },
  scheduleNote: { fontSize: 13, fontVariant: ["tabular-nums"] },
  scheduleLabel: { fontSize: 13, maxWidth: 80 },
  empty: { justifyContent: "center", alignItems: "center", paddingVertical: 32, gap: 6 },
  emptyText: { fontSize: 15 },
  emptyHint: { fontSize: 13 },
  hintText: { fontSize: 12, textAlign: "center", paddingTop: 8 },
  // ── 시트 공통 ─────────────────────────────────────────────
  fieldLabel: { fontSize: 12, fontWeight: "500", marginTop: 8 },
  input: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15 },
  submitBtn: { minHeight: 52, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  submitBtnText: { fontSize: 16, fontWeight: "700" },
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
