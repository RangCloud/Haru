/**
 * 일정 화면
 *
 * 구조:
 * 1. 월 선택 헤더 (< 2025년 6월 >)
 * 2. 달력 그리드 (7열 × 최대 6행, 일정 있는 날짜에 dot 표시)
 * 3. 선택된 날짜의 일정 목록
 * 4. 일정 추가 버튼 → 입력 모달
 *
 * 외부 달력 라이브러리 없이 React Native 기본 컴포넌트로 구현.
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
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

import { Colors } from "@/constants/theme";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { type ScheduleItem } from "@/src/db/schedule";
import { useScheduleStore } from "@/src/store/scheduleStore";

// ── 유틸 ─────────────────────────────────────────────────────

/** 오늘 날짜를 YYYY-MM-DD 형식으로 반환 */
function todayString(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/**
 * 실제 존재하는 날짜인지 검사한다.
 * Date 객체를 생성해 월·일이 유지되는지 확인하므로 2025-02-30 같은 잘못된 날짜를 걸러낸다.
 */
function isValidDate(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const [y, m, d] = s.split("-").map(Number);
  if (m < 1 || m > 12 || d < 1) return false;
  const date = new Date(y, m - 1, d);
  return date.getMonth() === m - 1 && date.getDate() === d;
}

/** 숫자 입력을 YYYY-MM-DD 형식으로 자동 포맷한다 (예: "20250615" → "2025-06-15") */
function autoFormatDate(input: string): string {
  const digits = input.replace(/\D/g, "").slice(0, 8);
  if (digits.length <= 4) return digits;
  if (digits.length <= 6) return `${digits.slice(0, 4)}-${digits.slice(4)}`;
  return `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6)}`;
}

/** 숫자 입력을 HH:MM 형식으로 자동 포맷한다 (예: "1430" → "14:30") */
function autoFormatTime(input: string): string {
  const digits = input.replace(/\D/g, "").slice(0, 4);
  if (digits.length <= 2) return digits;
  return `${digits.slice(0, 2)}:${digits.slice(2)}`;
}

/** YYYY-MM-DD → Date 객체 */
function parseDate(s: string): Date {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
}

/**
 * 해당 월의 달력 그리드용 날짜 배열 반환 (일요일 시작)
 * null은 앞뒤 빈 셀 (7열 기준으로 채움)
 */
function buildCalendarDays(year: number, month: number): (number | null)[] {
  const firstDay = new Date(year, month - 1, 1).getDay(); // 0=일 ~ 6=토
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
  scheduleDates: Set<string>;
  colors: (typeof Colors)["light"];
  onSelectDate: (date: string) => void;
}

function Calendar({ year, month, selectedDate, scheduleDates, colors, onSelectDate }: CalendarProps) {
  const today = todayString();
  const days = buildCalendarDays(year, month);

  return (
    <View style={styles.calendar}>
      {/* 요일 헤더 */}
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

      {/* 날짜 그리드 */}
      <View style={styles.daysGrid}>
        {days.map((day, idx) => {
          if (day === null) {
            return <View key={`empty-${idx}`} style={styles.dayCell} />;
          }

          const dateStr = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
          const isSelected = dateStr === selectedDate;
          const isToday = dateStr === today;
          const hasEvent = scheduleDates.has(dateStr);
          const dayOfWeek = idx % 7;

          return (
            <TouchableOpacity
              key={dateStr}
              style={[
                styles.dayCell,
                isSelected && { backgroundColor: colors.tint, borderRadius: 22 },
              ]}
              onPress={() => onSelectDate(dateStr)}
              activeOpacity={0.7}
            >
              <Text
                style={[
                  styles.dayText,
                  {
                    color: isSelected
                      ? "#fff"
                      : dayOfWeek === 0
                        ? "#e74c3c"
                        : dayOfWeek === 6
                          ? "#3498db"
                          : colors.text,
                    fontWeight: isToday ? "700" : "400",
                  },
                ]}
              >
                {day}
              </Text>
              {hasEvent && (
                <View
                  style={[
                    styles.eventDot,
                    { backgroundColor: isSelected ? "#fff" : colors.tint },
                  ]}
                />
              )}
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

// ── 일정 행 ───────────────────────────────────────────────────

interface ScheduleRowProps {
  item: ScheduleItem;
  colors: (typeof Colors)["light"];
  onDelete: () => void;
  onEdit: () => void;
}

function ScheduleRow({ item, colors, onDelete, onEdit }: ScheduleRowProps) {
  const handleLongPress = () => {
    Alert.alert(
      "일정 관리",
      item.title,
      [
        { text: "취소", style: "cancel" },
        { text: "수정", onPress: onEdit },
        { text: "삭제", style: "destructive", onPress: onDelete },
      ],
    );
  };

  return (
    <TouchableOpacity
      style={[styles.scheduleRow, { borderLeftColor: colors.tint }]}
      onLongPress={handleLongPress}
      activeOpacity={0.7}
    >
      <View style={styles.scheduleMain}>
        <Text style={[styles.scheduleTitle, { color: colors.text }]}>{item.title}</Text>
        {item.note ? (
          <Text style={[styles.scheduleNote, { color: colors.icon }]} numberOfLines={1}>
            {item.note}
          </Text>
        ) : null}
      </View>
      <Text style={[styles.scheduleTime, { color: item.time ? colors.tint : colors.icon }]}>
        {item.time || "종일"}
      </Text>
    </TouchableOpacity>
  );
}

// ── 일정 추가 모달 ─────────────────────────────────────────────

interface AddEditModalProps {
  visible: boolean;
  initialDate: string;
  onClose: () => void;
  onAdd: (s: { title: string; date: string; time: string; note: string }) => void;
  onUpdate: (s: { title: string; date: string; time: string; note: string }) => void;
  colors: (typeof Colors)["light"];
  initialData?: ScheduleItem;   // 수정 모드일 때 기존 일정 데이터
}

function AddEditModal({ visible, initialDate, onClose, onAdd, onUpdate, colors, initialData }: AddEditModalProps) {
  const [title, setTitle] = useState("");
  const [date, setDate] = useState(initialDate);
  const [time, setTime] = useState("");
  const [note, setNote] = useState("");

  const isEdit = !!initialData;

  // 모달이 열릴 때마다 폼 초기값 설정 — 수정 모드이면 기존 데이터로, 추가 모드이면 초기값으로
  useEffect(() => {
    if (!visible) return;
    if (initialData) {
      setTitle(initialData.title);
      setDate(initialData.date);
      setTime(initialData.time);
      setNote(initialData.note);
    } else {
      setTitle("");
      setDate(initialDate);
      setTime("");
      setNote("");
    }
  }, [visible, initialDate, initialData]);

  const handleSubmit = () => {
    if (!title.trim()) {
      Alert.alert("입력 오류", "제목을 입력해 주세요.");
      return;
    }
    if (!isValidDate(date)) {
      Alert.alert("입력 오류", "올바른 날짜를 입력해 주세요.\n예) 2025-06-15");
      return;
    }
    if (time) {
      // HH:MM 형식 + 실제 범위 검사 (00:00 ~ 23:59)
      if (!/^\d{2}:\d{2}$/.test(time)) {
        Alert.alert("입력 오류", "시간을 HH:MM 형식으로 입력하거나 비워두세요.");
        return;
      }
      const [h, m] = time.split(":").map(Number);
      if (h > 23 || m > 59) {
        Alert.alert("입력 오류", "올바른 시간을 입력해 주세요.\n시(0-23), 분(0-59)");
        return;
      }
    }
    const data = { title: title.trim(), date, time, note: note.trim() };
    if (isEdit) onUpdate(data);
    else onAdd(data);
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={styles.modalOverlay}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        <View style={[styles.modalSheet, { backgroundColor: colors.background }]}>
          <View style={styles.modalHeader}>
            <Text style={[styles.modalTitle, { color: colors.text }]}>{isEdit ? "일정 수정" : "일정 추가"}</Text>
            <TouchableOpacity onPress={onClose}>
              <Text style={[styles.modalClose, { color: colors.icon }]}>✕</Text>
            </TouchableOpacity>
          </View>

          <Text style={[styles.fieldLabel, { color: colors.icon }]}>제목 *</Text>
          <TextInput
            style={[styles.input, { color: colors.text, borderColor: colors.icon + "40" }]}
            placeholder="일정 제목"
            placeholderTextColor={colors.icon}
            value={title}
            onChangeText={setTitle}
            autoFocus={!isEdit}
          />

          <Text style={[styles.fieldLabel, { color: colors.icon }]}>날짜</Text>
          <TextInput
            style={[styles.input, { color: colors.text, borderColor: colors.icon + "40" }]}
            placeholder="YYYY-MM-DD"
            placeholderTextColor={colors.icon}
            keyboardType="number-pad"
            value={date}
            onChangeText={(t) => setDate(autoFormatDate(t))}
          />

          <Text style={[styles.fieldLabel, { color: colors.icon }]}>
            시간 (선택 — 비우면 종일)
          </Text>
          <TextInput
            style={[styles.input, { color: colors.text, borderColor: colors.icon + "40" }]}
            placeholder="HH:MM  예) 14:30"
            placeholderTextColor={colors.icon}
            keyboardType="number-pad"
            value={time}
            onChangeText={(t) => setTime(autoFormatTime(t))}
          />

          <Text style={[styles.fieldLabel, { color: colors.icon }]}>메모 (선택)</Text>
          <TextInput
            style={[styles.input, { color: colors.text, borderColor: colors.icon + "40" }]}
            placeholder="메모"
            placeholderTextColor={colors.icon}
            value={note}
            onChangeText={setNote}
          />

          <TouchableOpacity
            style={[styles.submitBtn, { backgroundColor: colors.tint }]}
            onPress={handleSubmit}
          >
            <Text style={styles.submitBtnText}>{isEdit ? "수정하기" : "추가하기"}</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ── 메인 화면 ─────────────────────────────────────────────────

export default function ScheduleScreen() {
  const colors = Colors[useColorScheme() ?? "light"];
  const {
    monthSchedules, selectedDate, selectedDateSchedules,
    year, month, isLoaded,
    loadMonth, selectDate, add, update, remove,
  } = useScheduleStore();
  const [modalVisible, setModalVisible] = useState(false);
  // 수정 모드일 때 대상 일정 — undefined이면 추가 모드
  const [editItem, setEditItem] = useState<ScheduleItem | undefined>(undefined);

  useEffect(() => {
    loadMonth(year, month);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const prevMonth = useCallback(() => {
    const nm = month === 1 ? 12 : month - 1;
    const ny = month === 1 ? year - 1 : year;
    loadMonth(ny, nm);
  }, [year, month, loadMonth]);

  const nextMonth = useCallback(() => {
    const nm = month === 12 ? 1 : month + 1;
    const ny = month === 12 ? year + 1 : year;
    loadMonth(ny, nm);
  }, [year, month, loadMonth]);

  // 일정 있는 날짜 집합 — Calendar에 전달해 dot 표시
  const scheduleDates = new Set(monthSchedules.map((s) => s.date));

  const handleAdd = async (s: Parameters<typeof add>[0]) => {
    setModalVisible(false);
    setEditItem(undefined);
    await add(s);
  };

  const handleUpdate = async (s: { title: string; date: string; time: string; note: string }) => {
    setModalVisible(false);
    if (editItem) await update(editItem.id, s);
    setEditItem(undefined);
  };

  // 선택된 날짜 레이블 (예: "6월 21일 토요일")
  const selectedDateLabel = (() => {
    const d = parseDate(selectedDate);
    const weekday = ["일", "월", "화", "수", "목", "금", "토"][d.getDay()];
    return `${d.getMonth() + 1}월 ${d.getDate()}일 ${weekday}요일`;
  })();

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      {/* 월 선택 헤더 */}
      <View style={styles.monthHeader}>
        <TouchableOpacity onPress={prevMonth} style={styles.monthArrow}>
          <Text style={[styles.monthArrowText, { color: colors.tint }]}>‹</Text>
        </TouchableOpacity>
        <Text style={[styles.monthLabel, { color: colors.text }]}>
          {year}년 {month}월
        </Text>
        <TouchableOpacity onPress={nextMonth} style={styles.monthArrow}>
          <Text style={[styles.monthArrowText, { color: colors.tint }]}>›</Text>
        </TouchableOpacity>
      </View>

      {/* 달력 */}
      <Calendar
        year={year}
        month={month}
        selectedDate={selectedDate}
        scheduleDates={scheduleDates}
        colors={colors}
        onSelectDate={selectDate}
      />

      {/* 선택된 날짜 헤더 */}
      <View style={[styles.selectedDateBar, { borderTopColor: colors.icon + "20" }]}>
        <Text style={[styles.selectedDateText, { color: colors.text }]}>
          {selectedDateLabel}
        </Text>
        <Text style={[styles.selectedDateCount, { color: colors.icon }]}>
          {selectedDateSchedules.length}개
        </Text>
      </View>

      {/* 일정 목록 */}
      {isLoaded && selectedDateSchedules.length === 0 ? (
        <View style={styles.empty}>
          <Text style={[styles.emptyText, { color: colors.icon }]}>일정이 없습니다.</Text>
        </View>
      ) : (
        <FlatList
          data={selectedDateSchedules}
          keyExtractor={(item) => String(item.id)}
          renderItem={({ item }) => (
            <ScheduleRow
              item={item}
              colors={colors}
              onDelete={() => remove(item.id)}
              onEdit={() => { setEditItem(item); setModalVisible(true); }}
            />
          )}
          contentContainerStyle={styles.listContent}
          ListFooterComponent={() =>
            selectedDateSchedules.length > 0
              ? <Text style={[styles.hintText, { color: colors.icon }]}>항목을 길게 눌러 수정·삭제</Text>
              : null
          }
        />
      )}

      {/* 일정 추가 버튼 */}
      <TouchableOpacity
        style={[styles.fab, { backgroundColor: colors.tint }]}
        onPress={() => { setEditItem(undefined); setModalVisible(true); }}
      >
        <Text style={styles.fabText}>+ 일정 추가</Text>
      </TouchableOpacity>

      <AddEditModal
        visible={modalVisible}
        initialDate={selectedDate}
        onClose={() => { setModalVisible(false); setEditItem(undefined); }}
        onAdd={handleAdd}
        onUpdate={handleUpdate}
        colors={colors}
        initialData={editItem}
      />
    </View>
  );
}

// ── 스타일 ───────────────────────────────────────────────────

// 화면 너비에 맞게 달력 셀 크기를 동적으로 계산한다.
// paddingHorizontal: 12 × 2 = 24px을 제외한 나머지를 7열로 균등 분할.
// 고정값 44를 쓰면 넓은 화면에서 달력이 왼쪽으로 몰리는 문제가 있었음.
const { width: SCREEN_WIDTH } = Dimensions.get("window");
const CELL_SIZE = Math.floor((SCREEN_WIDTH - 24) / 7);

const styles = StyleSheet.create({
  screen: { flex: 1 },
  monthHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingTop: 64,
    paddingHorizontal: 24,
    paddingBottom: 8,
    gap: 16,
  },
  monthArrow: { padding: 8 },
  monthArrowText: { fontSize: 28, fontWeight: "300" },
  monthLabel: {
    fontSize: 20,
    fontWeight: "700",
    minWidth: 110,
    textAlign: "center",
  },
  // ── 달력 ──────────────────────────────────────────────────
  calendar: { paddingHorizontal: 12, marginBottom: 4 },
  weekdayRow: { flexDirection: "row", marginBottom: 4 },
  weekdayText: {
    width: CELL_SIZE,
    textAlign: "center",
    fontSize: 12,
    fontWeight: "600",
  },
  daysGrid: { flexDirection: "row", flexWrap: "wrap" },
  dayCell: {
    width: CELL_SIZE,
    height: CELL_SIZE,
    alignItems: "center",
    justifyContent: "center",
  },
  dayText: { fontSize: 14 },
  eventDot: { width: 4, height: 4, borderRadius: 2, marginTop: 2 },
  // ── 선택일 헤더 ───────────────────────────────────────────
  selectedDateBar: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 24,
    paddingVertical: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  selectedDateText: { fontSize: 15, fontWeight: "600" },
  selectedDateCount: { fontSize: 13 },
  // ── 일정 목록 ─────────────────────────────────────────────
  listContent: { paddingHorizontal: 24, paddingBottom: 100 },
  scheduleRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    paddingLeft: 12,
    borderLeftWidth: 3,
    marginBottom: 8,
    gap: 8,
  },
  scheduleMain: { flex: 1, gap: 3 },
  scheduleTitle: { fontSize: 15, fontWeight: "500" },
  scheduleNote: { fontSize: 12 },
  scheduleTime: { fontSize: 13, fontWeight: "500" },
  empty: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingBottom: 100,
  },
  emptyText: { fontSize: 15 },
  // ── FAB ───────────────────────────────────────────────────
  fab: {
    position: "absolute",
    bottom: 32,
    left: 24,
    right: 24,
    paddingVertical: 16,
    borderRadius: 14,
    alignItems: "center",
  },
  fabText: { color: "#fff", fontSize: 16, fontWeight: "600" },
  // ── 모달 ──────────────────────────────────────────────────
  modalOverlay: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "#00000060",
  },
  modalSheet: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 24,
    paddingBottom: 40,
    gap: 8,
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  modalTitle: { fontSize: 18, fontWeight: "700" },
  modalClose: { fontSize: 18, padding: 4 },
  fieldLabel: { fontSize: 12, fontWeight: "500", marginTop: 8, marginBottom: 4 },
  input: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
  },
  submitBtn: { marginTop: 16, paddingVertical: 16, borderRadius: 14, alignItems: "center" },
  submitBtnText: { color: "#fff", fontSize: 16, fontWeight: "600" },
  hintText: { fontSize: 11, textAlign: "center", paddingTop: 8, paddingBottom: 90 },
});
