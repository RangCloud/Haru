/**
 * 거래(수입·지출) 공용 부품 — 일정 탭과 가계부 탭이 함께 쓴다
 *
 * - TransactionRow: 거래 한 줄. 수입은 초록·지출은 빨강 태그, 길게 누르면 수정·삭제
 * - BudgetModal: 거래 추가·수정 시트 (수입/지출 전환, 금액, 카테고리, 날짜, 메모)
 */

import { useEffect, useState } from "react";
import { Alert, ScrollView, StyleSheet, TouchableOpacity, View } from "react-native";

import { Colors } from "@/constants/theme";
import { Text, TextInput } from "@/src/components/AppText";
import { BottomSheet } from "@/src/components/BottomSheet";
import { DateField } from "@/src/components/DateTimeFields";
import {
  EXPENSE_CATEGORIES,
  INCOME_CATEGORIES,
  type NewTransaction,
  type Transaction,
} from "@/src/db/budget";

type ThemeColors = (typeof Colors)["light"];

export function formatAmount(n: number): string {
  return n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",") + "원";
}

/** '#RRGGBB' + 투명도 → 연한 배경색 */
function withAlpha(hex: string, alpha: string): string {
  return `${hex}${alpha}`;
}

// ── 거래 행 — 수입·지출 태그 색 구분, 길게 눌러 수정·삭제 ─────────

export function TransactionRow({ item, colors, onDelete, onEdit }: {
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


// ── 거래 추가·수정 시트 ───────────────────────────────────────

export interface BudgetModalProps {
  visible: boolean;
  initialDate: string;
  initialType?: "income" | "expense";
  onClose: () => void;
  onSubmit: (t: NewTransaction) => void;
  colors: ThemeColors;
  initialData?: Transaction;
}

export function BudgetModal({ visible, initialDate, initialType = "expense", onClose, onSubmit, colors, initialData }: BudgetModalProps) {
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

const styles = StyleSheet.create({
  // ── 거래 행 ───────────────────────────────────────────────
  txRow: { flexDirection: "row", alignItems: "center", paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, gap: 10 },
  txBadge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
  txBadgeText: { fontSize: 11, fontWeight: "600" },
  txNote: { flex: 1, fontSize: 14 },
  txAmount: { fontSize: 14, fontWeight: "700", fontVariant: ["tabular-nums"] },
  // ── 거래 시트 ─────────────────────────────────────────────
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
});
