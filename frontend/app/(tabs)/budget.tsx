/**
 * 가계부 화면
 * 월 선택 → 요약 카드 → 거래 내역 → 추가 모달
 * 모든 데이터는 기기 로컬 SQLite에만 저장 (외부 전송 없음).
 */

import { useCallback, useEffect, useState } from "react";
import {
  Alert, FlatList, KeyboardAvoidingView, Modal, Platform,
  ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View,
} from "react-native";

import { Colors, cardShadow } from "@/constants/theme";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { EXPENSE_CATEGORIES, INCOME_CATEGORIES, type NewTransaction, type Transaction } from "@/src/db/budget";
import { useBudgetStore } from "@/src/store/budgetStore";

// ── 유틸 ─────────────────────────────────────────────────────

function formatAmount(n: number): string {
  return n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",") + "원";
}

function todayString(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/**
 * 실제 존재하는 날짜인지 검사한다.
 * 정규식만으로는 2025-02-30 같은 잘못된 날짜를 걸러내지 못하므로
 * Date 객체를 생성해 월·일이 유지되는지 확인한다.
 */
function isValidDate(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const [y, m, d] = s.split("-").map(Number);
  if (m < 1 || m > 12 || d < 1) return false;
  const date = new Date(y, m - 1, d);
  return date.getMonth() === m - 1 && date.getDate() === d;
}

/**
 * 숫자 입력을 받아 YYYY-MM-DD 형식으로 자동 포맷한다.
 * 예: "20250615" → "2025-06-15"
 */
function autoFormatDate(input: string): string {
  const digits = input.replace(/\D/g, "").slice(0, 8);
  if (digits.length <= 4) return digits;
  if (digits.length <= 6) return `${digits.slice(0, 4)}-${digits.slice(4)}`;
  return `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6)}`;
}

function formatDate(date: string): string {
  const [, m, d] = date.split("-");
  return `${Number(m)}월 ${Number(d)}일`;
}

// ── 요약 카드 ─────────────────────────────────────────────────

function SummaryCard({ income, expense, balance, colors }: {
  income: number; expense: number; balance: number;
  colors: typeof Colors.light;
}) {
  return (
    <View style={[styles.summaryCard, { backgroundColor: colors.card, borderColor: colors.cardBorder }, cardShadow]}>
      <View style={styles.summaryRow}>
        <View style={styles.summaryItem}>
          <Text style={[styles.summaryLabel, { color: colors.subtext }]}>수입</Text>
          <Text style={[styles.summaryIncome, { color: colors.income }]}>{formatAmount(income)}</Text>
        </View>
        <View style={[styles.summaryDivider, { backgroundColor: colors.separator }]} />
        <View style={styles.summaryItem}>
          <Text style={[styles.summaryLabel, { color: colors.subtext }]}>지출</Text>
          <Text style={[styles.summaryExpense, { color: colors.expense }]}>{formatAmount(expense)}</Text>
        </View>
        <View style={[styles.summaryDivider, { backgroundColor: colors.separator }]} />
        <View style={styles.summaryItem}>
          <Text style={[styles.summaryLabel, { color: colors.subtext }]}>잔액</Text>
          <Text style={[styles.summaryBalance, { color: balance >= 0 ? colors.tint : colors.expense }]}>
            {formatAmount(balance)}
          </Text>
        </View>
      </View>
    </View>
  );
}

// ── 거래 행 ───────────────────────────────────────────────────

function TransactionRow({ item, colors, onDelete, onEdit }: {
  item: Transaction; colors: typeof Colors.light; onDelete: () => void; onEdit: () => void;
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
      <View style={[styles.txCategoryBadge, { backgroundColor: colors.tintLight }]}>
        <Text style={[styles.txCategoryText, { color: colors.tint }]}>{item.category}</Text>
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

// ── 거래 추가·수정 모달 ────────────────────────────────────────

function AddEditModal({ visible, onClose, onAdd, onUpdate, colors, initialData }: {
  visible: boolean;
  onClose: () => void;
  onAdd: (t: NewTransaction) => void;
  onUpdate: (t: NewTransaction) => void;
  colors: typeof Colors.light;
  initialData?: Transaction;   // 수정 모드일 때 기존 거래 데이터
}) {
  const [type, setType] = useState<"income" | "expense">(initialData?.type ?? "expense");
  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState<string>(EXPENSE_CATEGORIES[0]);
  const [note, setNote] = useState("");
  const [date, setDate] = useState(todayString());

  const isEdit = !!initialData;

  // 모달이 열릴 때마다 폼 초기값 설정 — 수정 모드이면 기존 데이터로, 추가 모드이면 초기값으로
  useEffect(() => {
    if (!visible) return;
    if (initialData) {
      setType(initialData.type);
      setAmount(initialData.amount.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ","));
      setCategory(initialData.category);
      setNote(initialData.note);
      setDate(initialData.date);
    } else {
      setType("expense");
      setAmount("");
      setCategory(EXPENSE_CATEGORIES[0]);
      setNote("");
      setDate(todayString());
    }
  }, [visible, initialData]);

  const categories = type === "expense" ? EXPENSE_CATEGORIES : INCOME_CATEGORIES;

  const switchType = (t: "income" | "expense") => {
    setType(t);
    // 수입↔지출 전환 시 카테고리를 초기화한다.
    // 수정 모드에서도 전환하면 이전 타입의 카테고리(예: "급여")가 잘못된 타입으로 저장되므로 반드시 초기화.
    setCategory(t === "expense" ? EXPENSE_CATEGORIES[0] : INCOME_CATEGORIES[0]);
  };

  // 숫자만 추출해 천 단위 콤마를 자동으로 붙인다 (예: "123456" → "123,456")
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
    if (isEdit) onUpdate(data);
    else onAdd(data);
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={styles.modalOverlay}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        <View style={[styles.modalSheet, { backgroundColor: colors.card }]}>
          <View style={styles.modalHandle} />
          <View style={styles.modalHeader}>
            <Text style={[styles.modalTitle, { color: colors.text }]}>{isEdit ? "거래 수정" : "거래 추가"}</Text>
            <TouchableOpacity onPress={onClose}>
              <Text style={[styles.modalClose, { color: colors.subtext }]}>✕</Text>
            </TouchableOpacity>
          </View>

          {/* 수입 / 지출 토글 */}
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
            placeholder="금액 입력 (원)"
            placeholderTextColor={colors.subtext}
            keyboardType="numeric"
            value={amount}
            onChangeText={handleAmountChange}
          />

          <Text style={[styles.fieldLabel, { color: colors.subtext }]}>카테고리</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.categoryScroll}>
            {categories.map((c) => (
              <TouchableOpacity
                key={c}
                style={[styles.categoryChip, { backgroundColor: category === c ? colors.tint : colors.background }]}
                onPress={() => setCategory(c)}
              >
                <Text style={{ color: category === c ? "#fff" : colors.subtext, fontSize: 13, fontWeight: "500" }}>{c}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          <Text style={[styles.fieldLabel, { color: colors.subtext }]}>메모 (선택)</Text>
          <TextInput
            style={[styles.input, { color: colors.text, backgroundColor: colors.background, borderColor: colors.separator }]}
            placeholder="메모 입력"
            placeholderTextColor={colors.subtext}
            value={note}
            onChangeText={setNote}
          />

          <Text style={[styles.fieldLabel, { color: colors.subtext }]}>날짜</Text>
          <TextInput
            style={[styles.input, { color: colors.text, backgroundColor: colors.background, borderColor: colors.separator }]}
            placeholder="YYYY-MM-DD"
            placeholderTextColor={colors.subtext}
            keyboardType="number-pad"
            value={date}
            onChangeText={(t) => setDate(autoFormatDate(t))}
          />

          <TouchableOpacity style={[styles.submitBtn, { backgroundColor: colors.tint }]} onPress={handleSubmit}>
            <Text style={styles.submitBtnText}>{isEdit ? "수정하기" : "추가하기"}</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ── 메인 화면 ─────────────────────────────────────────────────

export default function BudgetScreen() {
  const scheme = useColorScheme();
  const colors = Colors[scheme];

  const { transactions, year, month, isLoaded, totalIncome, totalExpense, balance, loadMonth, add, update, remove } =
    useBudgetStore();
  const [modalVisible, setModalVisible] = useState(false);
  // 수정 모드일 때 대상 거래 — undefined이면 추가 모드
  const [editItem, setEditItem] = useState<Transaction | undefined>(undefined);

  useEffect(() => { loadMonth(year, month); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const prevMonth = useCallback(() => {
    loadMonth(month === 1 ? year - 1 : year, month === 1 ? 12 : month - 1);
  }, [year, month, loadMonth]);

  const nextMonth = useCallback(() => {
    loadMonth(month === 12 ? year + 1 : year, month === 12 ? 1 : month + 1);
  }, [year, month, loadMonth]);

  type ListItem = { kind: "header"; date: string } | { kind: "tx"; data: Transaction };

  const listItems = (() => {
    const items: ListItem[] = [];
    let lastDate = "";
    for (const tx of transactions) {
      if (tx.date !== lastDate) { items.push({ kind: "header", date: tx.date }); lastDate = tx.date; }
      items.push({ kind: "tx", data: tx });
    }
    return items;
  })();

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      {/* 월 선택 헤더 */}
      <View style={[styles.monthHeader, { borderBottomColor: colors.separator }]}>
        <TouchableOpacity onPress={prevMonth} style={styles.monthArrow}>
          <Text style={[styles.monthArrowText, { color: colors.tint }]}>‹</Text>
        </TouchableOpacity>
        <Text style={[styles.monthLabel, { color: colors.text }]}>{year}년 {month}월</Text>
        <TouchableOpacity onPress={nextMonth} style={styles.monthArrow}>
          <Text style={[styles.monthArrowText, { color: colors.tint }]}>›</Text>
        </TouchableOpacity>
      </View>

      <SummaryCard income={totalIncome} expense={totalExpense} balance={balance} colors={colors} />

      {isLoaded && transactions.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyEmoji}>📭</Text>
          <Text style={[styles.emptyText, { color: colors.subtext }]}>거래 내역이 없습니다.</Text>
          <Text style={[styles.emptySubText, { color: colors.subtext }]}>아래 버튼을 눌러 추가해보세요.</Text>
        </View>
      ) : (
        <FlatList
          data={listItems}
          keyExtractor={(item, idx) => item.kind === "header" ? `h-${item.date}` : `t-${(item as { kind: "tx"; data: Transaction }).data.id}-${idx}`}
          renderItem={({ item }) =>
            item.kind === "header"
              ? <Text style={[styles.dateHeader, { color: colors.subtext }]}>{formatDate(item.date)}</Text>
              : <TransactionRow
                  item={item.data}
                  colors={colors}
                  onDelete={() => remove(item.data.id)}
                  onEdit={() => { setEditItem(item.data); setModalVisible(true); }}
                />
          }
          contentContainerStyle={styles.listContent}
          ListFooterComponent={() =>
            transactions.length > 0
              ? <Text style={[styles.hintText, { color: colors.subtext }]}>항목을 길게 눌러 수정·삭제</Text>
              : null
          }
        />
      )}

      <TouchableOpacity
        style={[styles.fab, { backgroundColor: colors.tint }]}
        onPress={() => { setEditItem(undefined); setModalVisible(true); }}
      >
        <Text style={styles.fabText}>+ 거래 추가</Text>
      </TouchableOpacity>

      <AddEditModal
        visible={modalVisible}
        onClose={() => { setModalVisible(false); setEditItem(undefined); }}
        onAdd={async (t) => { setModalVisible(false); setEditItem(undefined); await add(t); }}
        onUpdate={async (t) => { setModalVisible(false); if (editItem) { await update(editItem.id, t); } setEditItem(undefined); }}
        colors={colors}
        initialData={editItem}
      />
    </View>
  );
}

// ── 스타일 ───────────────────────────────────────────────────

const styles = StyleSheet.create({
  screen: { flex: 1 },
  monthHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingTop: 64,
    paddingHorizontal: 24,
    paddingBottom: 14,
    gap: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  monthArrow: { padding: 8 },
  monthArrowText: { fontSize: 28, fontWeight: "300" },
  monthLabel: { fontSize: 20, fontWeight: "700", minWidth: 110, textAlign: "center" },
  summaryCard: {
    marginHorizontal: 20,
    marginTop: 16,
    marginBottom: 8,
    borderRadius: 16,
    borderWidth: 1,
    padding: 20,
  },
  summaryRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  summaryItem: { flex: 1, alignItems: "center", gap: 6 },
  summaryDivider: { width: 1, height: 32 },
  summaryLabel: { fontSize: 11 },
  summaryIncome: { fontSize: 14, fontWeight: "700" },
  summaryExpense: { fontSize: 14, fontWeight: "700" },
  summaryBalance: { fontSize: 14, fontWeight: "700" },
  listContent: { paddingHorizontal: 20, paddingBottom: 100 },
  dateHeader: { fontSize: 11, fontWeight: "600", paddingTop: 18, paddingBottom: 6, letterSpacing: 0.5 },
  txRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 10,
  },
  txCategoryBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
  txCategoryText: { fontSize: 12, fontWeight: "600" },
  txNote: { flex: 1, fontSize: 14 },
  txAmount: { fontSize: 14, fontWeight: "600" },
  empty: { flex: 1, justifyContent: "center", alignItems: "center", gap: 6, paddingBottom: 80 },
  emptyEmoji: { fontSize: 40, marginBottom: 4 },
  emptyText: { fontSize: 16 },
  emptySubText: { fontSize: 13 },
  fab: {
    position: "absolute",
    bottom: 32,
    left: 20,
    right: 20,
    paddingVertical: 16,
    borderRadius: 14,
    alignItems: "center",
  },
  fabText: { color: "#fff", fontSize: 16, fontWeight: "600" },
  // ── 모달 ──────────────────────────────────────────────────
  modalOverlay: { flex: 1, justifyContent: "flex-end", backgroundColor: "#00000055" },
  modalSheet: { borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, paddingBottom: 40, gap: 8 },
  modalHandle: { width: 40, height: 4, borderRadius: 2, backgroundColor: "#00000020", alignSelf: "center", marginBottom: 12 },
  modalHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 8 },
  modalTitle: { fontSize: 18, fontWeight: "700" },
  modalClose: { fontSize: 18, padding: 4 },
  typeToggle: { flexDirection: "row", borderRadius: 12, padding: 4, marginBottom: 8 },
  typeBtn: { flex: 1, paddingVertical: 10, borderRadius: 10, alignItems: "center" },
  typeBtnText: { fontSize: 15, fontWeight: "600" },
  fieldLabel: { fontSize: 12, fontWeight: "500", marginTop: 8, marginBottom: 4 },
  input: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 13, fontSize: 15 },
  categoryScroll: { flexGrow: 0, marginBottom: 4 },
  categoryChip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, marginRight: 8 },
  submitBtn: { marginTop: 16, paddingVertical: 16, borderRadius: 14, alignItems: "center" },
  submitBtnText: { color: "#fff", fontSize: 16, fontWeight: "600" },
  hintText: { fontSize: 11, textAlign: "center", paddingTop: 12, paddingBottom: 90 },
});
