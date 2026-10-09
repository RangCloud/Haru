/**
 * 기기 캘린더에서 일정 가져오기 시트
 *
 * 삼성 캘린더·Google 캘린더·iPhone 캘린더에 이미 적어 둔 일정을 하루로 복사한다.
 * - 폰의 공용 캘린더 저장소를 읽는다. Google 로그인과는 관계없고, 서버로 보내는 것도 없다.
 * - "한 번 복사" 방식이다. 가져온 뒤 원래 캘린더에서 일정을 고쳐도 하루에는 반영되지 않는다.
 *   다시 가져오면 새로 생긴 일정만 추가되고, 이미 가져온 일정은 건너뛴다.
 * - 반복 일정은 고른 기간 안의 각 회차가 낱개 일정으로 들어온다 (하루에는 일정 반복 기능이 없다).
 *
 * 화면 흐름: 열기 → 권한 요청 → 캘린더 목록(체크) + 기간 선택 → 가져오기 → 결과 안내
 */

import * as Calendar from "expo-calendar";
import { useEffect, useState } from "react";
import { ActivityIndicator, Linking, Platform, StyleSheet, TouchableOpacity, View } from "react-native";

import { Colors } from "@/constants/theme";
import { Text } from "@/src/components/AppText";
import { BottomSheet } from "@/src/components/BottomSheet";
import { importSchedules } from "@/src/db/schedule";
import { useScheduleStore } from "@/src/store/scheduleStore";
import { IMPORT_RANGES, importRange, toSchedule, type ImportedSchedule, type ImportPlatform } from "@/src/utils/calendarImport";

interface CalendarImportSheetProps {
  visible: boolean;
  onClose: () => void;
  colors: typeof Colors.light;
}

/** 목록에 보여 줄 캘린더 한 줄 */
interface CalendarRow {
  id: string;
  title: string;
  account: string;   // 어느 계정의 캘린더인지 (예: Google 계정 이메일, "내 캘린더")
  color: string;
}

type Phase =
  | { kind: "loading" }
  | { kind: "denied"; canAskAgain: boolean }
  | { kind: "ready" }
  | { kind: "importing" }
  | { kind: "done"; added: number; skipped: number }
  | { kind: "error" };

export function CalendarImportSheet({ visible, onClose, colors }: CalendarImportSheetProps) {
  const reloadSchedules = useScheduleStore((s) => s.reload);

  const [phase, setPhase] = useState<Phase>({ kind: "loading" });
  const [calendars, setCalendars] = useState<CalendarRow[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [months, setMonths] = useState<number>(12);

  // 열 때마다 권한을 확인하고 캘린더 목록을 새로 읽는다 (그 사이 계정이 추가됐을 수 있다)
  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    setPhase({ kind: "loading" });

    (async () => {
      try {
        const permission = await Calendar.requestCalendarPermissionsAsync();
        if (cancelled) return;
        if (permission.status !== "granted") {
          setPhase({ kind: "denied", canAskAgain: permission.canAskAgain });
          return;
        }
        const list = await Calendar.getCalendarsAsync(Calendar.EntityTypes.EVENT);
        if (cancelled) return;
        const rows = list.map((c) => ({
          id: c.id,
          title: c.title || "(이름 없는 캘린더)",
          account: c.source?.name ?? "",
          color: c.color,
        }));
        setCalendars(rows);
        // 처음에는 모두 선택해 둔다 — 대부분 전부 가져오길 원하고, 빼는 쪽이 고르는 쪽보다 쉽다
        setSelected(new Set(rows.map((r) => r.id)));
        setPhase({ kind: "ready" });
      } catch {
        if (!cancelled) setPhase({ kind: "error" });
      }
    })();

    return () => { cancelled = true; };
  }, [visible]);

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const runImport = async () => {
    if (selected.size === 0) return;
    setPhase({ kind: "importing" });
    try {
      const { start, end } = importRange(months);
      const events = await Calendar.getEventsAsync([...selected], start, end);
      const colorOf = new Map(calendars.map((c) => [c.id, c.color]));
      const platform: ImportPlatform = Platform.OS === "ios" ? "ios" : "android";

      const items: ImportedSchedule[] = [];
      for (const ev of events) {
        const item = toSchedule(ev, colorOf.get(ev.calendarId), platform);
        if (item) items.push(item);
      }

      const result = await importSchedules(items);
      // 달력과 홈의 오늘 일정이 바로 바뀌도록 목록을 새로 읽는다
      await reloadSchedules();
      setPhase({ kind: "done", ...result });
    } catch {
      setPhase({ kind: "error" });
    }
  };

  const busy = phase.kind === "importing";
  const footer =
    phase.kind === "ready" || phase.kind === "importing" ? (
      <TouchableOpacity
        onPress={runImport}
        disabled={busy || selected.size === 0}
        style={[styles.primaryBtn, { backgroundColor: colors.tint, opacity: busy || selected.size === 0 ? 0.5 : 1 }]}
        accessibilityRole="button"
      >
        {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryText}>일정 가져오기</Text>}
      </TouchableOpacity>
    ) : phase.kind === "done" ? (
      <TouchableOpacity onPress={onClose} style={[styles.primaryBtn, { backgroundColor: colors.tint }]} accessibilityRole="button">
        <Text style={styles.primaryText}>확인</Text>
      </TouchableOpacity>
    ) : undefined;

  return (
    <BottomSheet visible={visible} onClose={onClose} title="캘린더에서 가져오기" colors={colors} footer={footer}>
      {phase.kind === "loading" && (
        <View style={styles.center}><ActivityIndicator color={colors.tint} /></View>
      )}

      {phase.kind === "denied" && (
        <View style={styles.center}>
          <Text style={[styles.message, { color: colors.text }]}>캘린더 접근 권한이 필요해요.</Text>
          <Text style={[styles.sub, { color: colors.subtext }]}>
            폰에 저장된 일정을 읽어 하루로 복사하는 데만 쓰고, 서버로 보내지 않아요.
          </Text>
          {/* 한 번 거부하면 시스템이 다시 묻지 않는 경우가 있어, 설정 화면으로 가는 길을 준다 */}
          <TouchableOpacity onPress={() => Linking.openSettings()} style={[styles.outlineBtn, { borderColor: colors.tint }]} accessibilityRole="button">
            <Text style={[styles.outlineText, { color: colors.tint }]}>설정에서 권한 켜기</Text>
          </TouchableOpacity>
        </View>
      )}

      {phase.kind === "error" && (
        <View style={styles.center}>
          <Text style={[styles.message, { color: colors.text }]}>일정을 가져오지 못했어요.</Text>
          <Text style={[styles.sub, { color: colors.subtext }]}>잠시 후 다시 시도해 주세요. 가져오던 일정은 저장되지 않았어요.</Text>
        </View>
      )}

      {phase.kind === "done" && (
        <View style={styles.center}>
          <Text style={[styles.message, { color: colors.text }]}>
            {phase.added > 0 ? `일정 ${phase.added}개를 가져왔어요.` : "새로 가져올 일정이 없어요."}
          </Text>
          {phase.skipped > 0 && (
            <Text style={[styles.sub, { color: colors.subtext }]}>이미 가져온 {phase.skipped}개는 건너뛰었어요.</Text>
          )}
          <Text style={[styles.sub, { color: colors.subtext }]}>가져온 일정은 일정 탭 달력에서 볼 수 있어요.</Text>
        </View>
      )}

      {(phase.kind === "ready" || phase.kind === "importing") && (
        <>
          <Text style={[styles.sub, { color: colors.subtext }]}>
            폰의 캘린더에 있는 일정을 하루로 복사해요. 일정은 폰 안에서만 옮겨지고 서버로 보내지 않아요.
          </Text>

          <Text style={[styles.label, { color: colors.subtext }]}>가져올 캘린더</Text>
          {calendars.length === 0 ? (
            <Text style={[styles.sub, { color: colors.subtext }]}>폰에 등록된 캘린더가 없어요.</Text>
          ) : (
            <View>
              {calendars.map((c) => {
                const on = selected.has(c.id);
                return (
                  <TouchableOpacity
                    key={c.id}
                    onPress={() => toggle(c.id)}
                    disabled={busy}
                    style={[styles.row, { borderBottomColor: colors.separator }]}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: on }}
                    accessibilityLabel={`${c.title}${c.account ? `, ${c.account}` : ""}`}
                  >
                    <View style={[styles.checkbox, { borderColor: on ? colors.tint : colors.separator }, on && { backgroundColor: colors.tint }]}>
                      {on && <Text maxScale={1} style={styles.check}>✓</Text>}
                    </View>
                    <View style={[styles.dot, { backgroundColor: c.color }]} />
                    <View style={styles.rowText}>
                      <Text style={[styles.rowTitle, { color: colors.text }]} numberOfLines={1}>{c.title}</Text>
                      {!!c.account && c.account !== c.title && (
                        <Text style={[styles.rowSub, { color: colors.subtext }]} numberOfLines={1}>{c.account}</Text>
                      )}
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>
          )}

          <Text style={[styles.label, { color: colors.subtext }]}>기간 — 한 달 전부터 앞으로</Text>
          <View style={[styles.segment, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
            {IMPORT_RANGES.map((r) => {
              const on = r.months === months;
              return (
                <TouchableOpacity
                  key={r.months}
                  onPress={() => setMonths(r.months)}
                  disabled={busy}
                  style={[styles.segmentBtn, on && { backgroundColor: colors.tint }]}
                  accessibilityState={{ selected: on }}
                >
                  <Text style={[styles.segmentText, { color: on ? "#fff" : colors.subtext }]}>{r.label}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
          <Text style={[styles.hint, { color: colors.subtext }]}>
            반복 일정은 이 기간 안의 회차가 하나씩 들어와요. 다시 가져와도 같은 일정은 중복되지 않아요.
          </Text>
        </>
      )}
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  center: { alignItems: "center", paddingVertical: 28, gap: 8 },
  message: { fontSize: 16, fontWeight: "600", textAlign: "center" },
  sub: { fontSize: 13, lineHeight: 19, textAlign: "center" },
  label: { fontSize: 12, fontWeight: "600", marginTop: 10 },
  hint: { fontSize: 12, lineHeight: 17 },
  row: { flexDirection: "row", alignItems: "center", gap: 10, minHeight: 50, borderBottomWidth: StyleSheet.hairlineWidth },
  checkbox: { width: 22, height: 22, borderRadius: 6, borderWidth: 1.5, alignItems: "center", justifyContent: "center" },
  check: { color: "#fff", fontSize: 13, fontWeight: "700" },
  dot: { width: 10, height: 10, borderRadius: 5 },
  rowText: { flex: 1, paddingVertical: 6 },
  rowTitle: { fontSize: 15, fontWeight: "500" },
  rowSub: { fontSize: 12, marginTop: 1 },
  segment: { flexDirection: "row", borderRadius: 12, borderWidth: 1, overflow: "hidden" },
  segmentBtn: { flex: 1, alignItems: "center", paddingVertical: 10 },
  segmentText: { fontSize: 14, fontWeight: "600" },
  primaryBtn: { borderRadius: 14, paddingVertical: 15, alignItems: "center" },
  primaryText: { color: "#fff", fontSize: 16, fontWeight: "600" },
  outlineBtn: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 10, marginTop: 8 },
  outlineText: { fontSize: 14, fontWeight: "600" },
});
