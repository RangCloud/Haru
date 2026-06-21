/**
 * 가계부 화면
 *
 * 구조:
 * 1. 월 선택 헤더 (< 2025년 6월 >)
 * 2. 이달 요약 카드 (수입 / 지출 / 잔액)
 * 3. 거래 내역 리스트 (날짜별 구분선, 최신순)
 * 4. 하단 추가 버튼 → 입력 모달
 *
 * 모든 데이터는 기기 로컬 SQLite에만 저장 (외부 전송 없음, CLAUDE.md §4).
 */

import { useCallback, useEffect, useState } from "react";
import {
  Alert,
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

import { Colors } from "@/constants/theme";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { EXPENSE_CATEGORIES, INCOME_CATEGORIES, type Transaction } from "@/src/db/budget";
import { useBudgetStore } from "@/src/store/budgetStore";

// ── 유틸 ─────────────────────────────────────────────────────

/** 숫자를 한국 원화 표기로 변환 (예: 1234567 → "1,234,567원") */
function formatAmount(n: number): string {
  return n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",") + "원";
}

/** 오늘 날짜를 YYYY-MM-DD 형식으로 반환 */
function todayString(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** YYYY-MM-DD → "M월 D일" */
function formatDate(date: string): string {
  const [, m, d] = date.split("-");
  return `${Number(m)}월 ${Number(d)}일`;
}

// ── 요약 카드 ─────────────────────────────────────────────────

interface SummaryCardProps {
  income: number;
  expense: number;
  balance: number;
  colors: (typeof Colors)["light"];
}

function SummaryCard({ income, expense, balance, colors }: SummaryCardProps) {
  return (
    <View style={[styles.summaryCard, { backgroundColor: colors.tint + "18" }]}>
      <View style={styles.summaryRow}>
        <View style={styles.summaryItem}>
          <Text style={[styles.summaryLabel, { color: colors.icon }]}>수입</Text>
          <Text style={[styles.summaryIncome]}>{formatAmount(income)}</Text>
        </View>
        <View style={[styles.summaryDivider, { backgroundColor: colors.icon + "30" }]} />
        <View style={styles.summaryItem}>
          <Text style={[styles.summaryLabel, { color: colors.icon }]}>지출</Text>
          <Text style={[styles.summaryExpense]}>{formatAmount(expense)}</Text>
        </View>
        <View style={[styles.summaryDivider, { backgroundColor: colors.icon + "30" }]} />
        <View style={styles.summaryItem}>
          <Text style={[styles.summaryLabel, { color: colors.icon }]}>잔액</Text>
          <Text
            style={[
              styles.summaryBalance,
              { color: balance >= 0 ? colors.tint : "#e74c3c" },
            ]}
          >
            {formatAmount(balance)}
          </Text>
        </View>
      </View>
    </View>
  );
}

// ── 거래 행 ───────────────────────────────────────────────────

interface TransactionRowProps {
  item: Transaction;
  colors: (typeof Colors)["light"];
  onDelete: () => void;
}

function TransactionRow({ item, colors, onDelete }: TransactionRowProps) {
  const isIncome = item.type === "income";

  const handleLongPress = () => {
    Alert.alert("거래 삭제", `"${item.category} ${formatAmount(item.amount)}"을 삭제할까요?`, [
      { text: "취소", style: "cancel" },
      { text: "삭제", style: "destructive", onPress: onDelete },
    ]);
  };

  return (
    <TouchableOpacity
      style={[styles.txRow, { borderBottomColor: colors.icon + "20" }]}
      onLongPress={handleLongPress}
      activeOpacity={0.7}
    >
      <View style={[styles.txCategory, { backgroundColor: colors.tint + "18" }]}>
        <Text style={[styles.txCategoryText, { color: colors.tint }]}>{item.category}</Text>
      </View>
      <View style={styles.txMiddle}>
        {item.note ? (
          <Text style={[styles.txNote, { color: colors.text }]} numberOfLines={1}>
            {item.note}
          </Text>
        ) : (
          <Text style={[styles.txNote, { color: colors.icon }]}>{item.category}</Text>
        )}
      </View>
      <Text style={[styles.txAmount, { color: isIncome ? "#27ae60" : "#e74c3c" }]}>
        {isIncome ? "+" : "-"}{formatAmount(item.amount)}
      </Text>
    </TouchableOpacity>
  );
}

// ── 거래 추가 모달 ─────────────────────────────────────────────

interface AddModalProps {
  visible: boolean;
  onClose: () => void;
  onSubmit: (t: { type: "income" | "expense"; amount: number; category: string; note: string; date: string }) => void;
  colors: (typeof Colors)["light"];
}

function AddModal({ visible, onClose, onSubmit, colors }: AddModalProps) {
  const [type, setType] = useState<"income" | "expense">("expense");
  const [amount, setAmount] = useState("");
  // string으로 명시 — EXPENSE/INCOME 카테고리를 모두 담을 수 있어야 하므로
  const [category, setCategory] = useState<string>(EXPENSE_CATEGORIES[0]);
  const [note, setNote] = useState("");
  const [date, setDate] = useState(todayString());

  const categories = type === "expense" ? EXPENSE_CATEGORIES : INCOME_CATEGORIES;

  // 수입↔지출 전환 시 카테고리 기본값 초기화
  const switchType = (t: "income" | "expense") => {
    setType(t);
    setCategory(t === "expense" ? EXPENSE_CATEGORIES[0] : INCOME_CATEGORIES[0]);
  };

  const handleSubmit = () => {
    const num = parseInt(amount.replace(/,/g, ""), 10);
    if (!num || num <= 0) {
      Alert.alert("입력 오류", "금액을 올바르게 입력해 주세요.");
      return;
    }
    // YYYY-MM-DD 형식 검증
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      Alert.alert("입력 오류", "날짜를 YYYY-MM-DD 형식으로 입력해 주세요.\n예: 2025-06-16");
      return;
    }
    onSubmit({ type, amount: num, category, note: note.trim(), date });
    // 초기화
    setType("expense");
    setAmount("");
    setCategory(EXPENSE_CATEGORIES[0]);
    setNote("");
    setDate(todayString());
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={styles.modalOverlay}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        <View style={[styles.modalSheet, { backgroundColor: colors.background }]}>
          {/* 헤더 */}
          <View style={styles.modalHeader}>
            <Text style={[styles.modalTitle, { color: colors.text }]}>거래 추가</Text>
            <TouchableOpacity onPress={onClose}>
              <Text style={[styles.modalClose, { color: colors.icon }]}>✕</Text>
            </TouchableOpacity>
          </View>

          {/* 수입 / 지출 토글 */}
          <View style={[styles.typeToggle, { backgroundColor: colors.icon + "18" }]}>
            {(["expense", "income"] as const).map((t) => (
              <TouchableOpacity
                key={t}
                style={[
                  styles.typeBtn,
                  type === t && { backgroundColor: colors.tint },
                ]}
                onPress={() => switchType(t)}
              >
                <Text style={[styles.typeBtnText, { color: type === t ? "#fff" : colors.text }]}>
                  {t === "expense" ? "지출" : "수입"}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* 금액 입력 */}
          <Text style={[styles.fieldLabel, { color: colors.icon }]}>금액</Text>
          <TextInput
            style={[styles.input, { color: colors.text, borderColor: colors.icon + "40" }]}
            placeholder="금액 입력 (원)"
            placeholderTextColor={colors.icon}
            keyboardType="numeric"
            value={amount}
            onChangeText={setAmount}
          />

          {/* 카테고리 */}
          <Text style={[styles.fieldLabel, { color: colors.icon }]}>카테고리</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.categoryScroll}>
            {categories.map((c) => (
              <TouchableOpacity
                key={c}
                style={[
                  styles.categoryChip,
                  {
                    backgroundColor: category === c ? colors.tint : colors.icon + "18",
                    borderColor: category === c ? colors.tint : "transparent",
                  },
                ]}
                onPress={() => setCategory(c)}
              >
                <Text style={{ color: category === c ? "#fff" : colors.text, fontSize: 13 }}>
                  {c}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          {/* 메모 */}
          <Text style={[styles.fieldLabel, { color: colors.icon }]}>메모 (선택)</Text>
          <TextInput
            style={[styles.input, { color: colors.text, borderColor: colors.icon + "40" }]}
            placeholder="메모 입력"
            placeholderTextColor={colors.icon}
            value={note}
            onChangeText={setNote}
          />

          {/* 날짜 */}
          <Text style={[styles.fieldLabel, { color: colors.icon }]}>날짜</Text>
          <TextInput
            style={[styles.input, { color: colors.text, borderColor: colors.icon + "40" }]}
            placeholder="YYYY-MM-DD"
            placeholderTextColor={colors.icon}
            value={date}
            onChangeText={setDate}
          />

          {/* 확인 버튼 */}
          <TouchableOpacity
            style={[styles.submitBtn, { backgroundColor: colors.tint }]}
            onPress={handleSubmit}
          >
            <Text style={styles.submitBtnText}>추가하기</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ── 메인 화면 ─────────────────────────────────────────────────

export default function BudgetScreen() {
  const colors = Colors[useColorScheme() ?? "light"];
  const { transactions, year, month, isLoaded, totalIncome, totalExpense, balance, loadMonth, add, remove } =
    useBudgetStore();
  const [modalVisible, setModalVisible] = useState(false);

  // 화면 진입 시 이번 달 데이터 로드 (mount 1회만 실행)
  // year, month는 store 초기값 그대로 — 이후 변경은 prevMonth/nextMonth가 직접 호출
  useEffect(() => {
    loadMonth(year, month);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 월 이동
  const prevMonth = useCallback(() => {
    const newMonth = month === 1 ? 12 : month - 1;
    const newYear = month === 1 ? year - 1 : year;
    loadMonth(newYear, newMonth);
  }, [year, month, loadMonth]);

  const nextMonth = useCallback(() => {
    const newMonth = month === 12 ? 1 : month + 1;
    const newYear = month === 12 ? year + 1 : year;
    loadMonth(newYear, newMonth);
  }, [year, month, loadMonth]);

  // 날짜별로 헤더를 삽입한 리스트 아이템 생성
  type ListItem =
    | { kind: "header"; date: string }
    | { kind: "tx"; data: Transaction };

  const listItems = (() => {
    const items: ListItem[] = [];
    let lastDate = "";
    for (const tx of transactions) {
      if (tx.date !== lastDate) {
        items.push({ kind: "header", date: tx.date });
        lastDate = tx.date;
      }
      items.push({ kind: "tx", data: tx });
    }
    return items;
  })();

  const handleAdd = async (t: Parameters<typeof add>[0]) => {
    setModalVisible(false);
    await add(t);
  };

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

      {/* 요약 카드 */}
      <SummaryCard
        income={totalIncome}
        expense={totalExpense}
        balance={balance}
        colors={colors}
      />

      {/* 거래 목록 */}
      {isLoaded && transactions.length === 0 ? (
        <View style={styles.empty}>
          <Text style={[styles.emptyText, { color: colors.icon }]}>거래 내역이 없습니다.</Text>
          <Text style={[styles.emptySubText, { color: colors.icon }]}>
            아래 버튼을 눌러 추가해보세요.
          </Text>
        </View>
      ) : (
        <FlatList
          data={listItems}
          keyExtractor={(item, idx) =>
            item.kind === "header" ? `h-${item.date}` : `t-${item.data.id}-${idx}`
          }
          renderItem={({ item }) => {
            if (item.kind === "header") {
              return (
                <Text style={[styles.dateHeader, { color: colors.icon }]}>
                  {formatDate(item.date)}
                </Text>
              );
            }
            return (
              <TransactionRow
                item={item.data}
                colors={colors}
                onDelete={() => remove(item.data.id)}
              />
            );
          }}
          contentContainerStyle={styles.listContent}
        />
      )}

      {/* 거래 추가 버튼 */}
      <TouchableOpacity
        style={[styles.fab, { backgroundColor: colors.tint }]}
        onPress={() => setModalVisible(true)}
      >
        <Text style={styles.fabText}>+ 거래 추가</Text>
      </TouchableOpacity>

      {/* 거래 추가 모달 */}
      <AddModal
        visible={modalVisible}
        onClose={() => setModalVisible(false)}
        onSubmit={handleAdd}
        colors={colors}
      />
    </View>
  );
}

// ── 스타일 ───────────────────────────────────────────────────

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  monthHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingTop: 64,
    paddingHorizontal: 24,
    paddingBottom: 12,
    gap: 16,
  },
  monthArrow: {
    padding: 8,
  },
  monthArrowText: {
    fontSize: 28,
    fontWeight: "300",
  },
  monthLabel: {
    fontSize: 20,
    fontWeight: "700",
    minWidth: 110,
    textAlign: "center",
  },
  summaryCard: {
    marginHorizontal: 24,
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
  },
  summaryRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  summaryItem: {
    flex: 1,
    alignItems: "center",
    gap: 6,
  },
  summaryDivider: {
    width: 1,
    height: 36,
  },
  summaryLabel: {
    fontSize: 12,
  },
  summaryIncome: {
    fontSize: 14,
    fontWeight: "600",
    color: "#27ae60",
  },
  summaryExpense: {
    fontSize: 14,
    fontWeight: "600",
    color: "#e74c3c",
  },
  summaryBalance: {
    fontSize: 14,
    fontWeight: "700",
  },
  listContent: {
    paddingHorizontal: 24,
    paddingBottom: 100,
  },
  dateHeader: {
    fontSize: 12,
    fontWeight: "600",
    paddingTop: 16,
    paddingBottom: 6,
    letterSpacing: 0.5,
  },
  txRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 10,
  },
  txCategory: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  txCategoryText: {
    fontSize: 12,
    fontWeight: "500",
  },
  txMiddle: {
    flex: 1,
  },
  txNote: {
    fontSize: 14,
  },
  txAmount: {
    fontSize: 14,
    fontWeight: "600",
  },
  empty: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    gap: 8,
    paddingBottom: 80,
  },
  emptyText: {
    fontSize: 16,
  },
  emptySubText: {
    fontSize: 13,
  },
  fab: {
    position: "absolute",
    bottom: 32,
    left: 24,
    right: 24,
    paddingVertical: 16,
    borderRadius: 14,
    alignItems: "center",
  },
  fabText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },
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
  modalTitle: {
    fontSize: 18,
    fontWeight: "700",
  },
  modalClose: {
    fontSize: 18,
    padding: 4,
  },
  typeToggle: {
    flexDirection: "row",
    borderRadius: 10,
    padding: 4,
    marginBottom: 8,
  },
  typeBtn: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 8,
    alignItems: "center",
  },
  typeBtnText: {
    fontSize: 15,
    fontWeight: "600",
  },
  fieldLabel: {
    fontSize: 12,
    fontWeight: "500",
    marginTop: 8,
    marginBottom: 4,
  },
  input: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
  },
  categoryScroll: {
    flexGrow: 0,
    marginBottom: 4,
  },
  categoryChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    marginRight: 8,
    borderWidth: 1,
  },
  submitBtn: {
    marginTop: 16,
    paddingVertical: 16,
    borderRadius: 14,
    alignItems: "center",
  },
  submitBtnText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },
});
