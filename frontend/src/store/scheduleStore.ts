/**
 * 일정 전역 상태 — Zustand store
 *
 * - monthSchedules: 달력에 보이는 월의 일정 (기간 일정은 걸쳐 있는 모든 달에 포함)
 * - selectedDateSchedules: 달력에서 선택한 날짜의 일정 (DB 재조회 없이 메모리에서 파생)
 * - todaySchedules: 홈 '오늘 일정' 전용. 달력에서 다른 달로 넘겨도 바뀌지 않도록
 *   monthSchedules와 분리해 오늘 날짜로 따로 조회한다.
 * - colorLabels: 색상별 사용자 이름 (예: 파랑 = 회사)
 *
 * 일정 10분 전 알림도 여기서 함께 관리한다. 추가·수정·삭제가 모두 이 store를 거치므로
 * 어느 화면에서 바꿔도 "일정 = 알림"이 어긋나지 않는다(QA TC-042).
 *   추가 → 예약하고 알림 ID 저장 / 수정 → 기존 알림 취소 후 새 내용으로 다시 예약 / 삭제 → 기존 알림 취소
 */

import { create } from "zustand";
import { getColorLabels, setColorLabel, type ColorLabels } from "@/src/db/colorLabel";
import { takeNotificationResyncFlag } from "@/src/db/database";
import {
  addSchedule,
  deleteSchedule,
  getScheduleById,
  getSchedulesByMonth,
  getSchedulesOnDate,
  getUpcomingTimedSchedules,
  setScheduleNotificationId,
  updateSchedule,
  type NewScheduleItem,
  type ScheduleItem,
} from "@/src/db/schedule";
import { todayString, toDateStr } from "@/src/utils/date";
import {
  cancelAllNotifications,
  cancelNotification,
  scheduleEventNotification,
} from "@/src/utils/notifications";
import { needsEventNotification, occursOn, sortForDate } from "@/src/utils/scheduleText";

// ── 상태 타입 ──────────────────────────────────────────────────

interface ScheduleState {
  monthSchedules: ScheduleItem[];
  selectedDate: string;            // YYYY-MM-DD
  year: number;
  month: number;
  isLoaded: boolean;
  selectedDateSchedules: ScheduleItem[];
  todaySchedules: ScheduleItem[];
  colorLabels: ColorLabels;

  // 액션
  loadMonth: (year: number, month: number) => Promise<void>;
  selectDate: (date: string) => void;
  goToDate: (date: string) => Promise<void>;
  goToday: () => Promise<void>;
  loadToday: () => Promise<void>;
  loadColorLabels: () => Promise<void>;
  saveColorLabel: (color: string, label: string) => Promise<void>;
  add: (s: NewScheduleItem) => Promise<void>;
  update: (id: number, s: Partial<NewScheduleItem>) => Promise<void>;
  remove: (id: number) => Promise<void>;
  /** DB가 스토어 밖에서 바뀐 뒤(기기 캘린더 가져오기 등) 화면 목록을 새로 읽는다 */
  reload: () => Promise<void>;
  /**
   * DB v5로 올라간 첫 실행에서 한 번만, 예전 버전이 남긴 알림을 정리하고 다시 예약한다.
   * 알림 권한을 요청한 뒤(Android 알림 채널이 생긴 뒤) 부른다.
   */
  resyncNotificationsIfNeeded: () => Promise<void>;
}

// ── 헬퍼 ──────────────────────────────────────────────────────

function filterByDate(schedules: ScheduleItem[], date: string): ScheduleItem[] {
  return sortForDate(schedules.filter((s) => occursOn(s, date)), date);
}

/**
 * 일정 하나의 알림을 현재 내용에 맞게 예약하고 ID를 기록한다.
 * 알림 대상이 아니거나, 이미 지난 시각이거나, 권한이 없으면 ID는 ""로 남는다.
 * 알림은 여러 날 일정이라도 첫날(date) 시작 시각 10분 전 한 번만 보낸다.
 */
async function scheduleAndStore(id: number, s: Pick<ScheduleItem, "title" | "date" | "time" | "source_id">) {
  const notificationId = needsEventNotification(s)
    ? await scheduleEventNotification(s.title, s.date, s.time)
    : null;
  await setScheduleNotificationId(id, notificationId ?? "");
}

// ── Store ──────────────────────────────────────────────────────

const now = new Date();

export const useScheduleStore = create<ScheduleState>((set, get) => {
  /** 추가·수정·삭제 후 보고 있는 달과 오늘 목록을 모두 새로 고친다 */
  const refresh = async () => {
    const { year, month, selectedDate } = get();
    const [monthSchedules, todaySchedules] = await Promise.all([
      getSchedulesByMonth(year, month),
      getSchedulesOnDate(todayString()),
    ]);
    set({
      monthSchedules,
      todaySchedules,
      selectedDateSchedules: filterByDate(monthSchedules, selectedDate),
    });
  };

  return {
    monthSchedules: [],
    selectedDate: todayString(),
    year: now.getFullYear(),
    month: now.getMonth() + 1,
    isLoaded: false,
    selectedDateSchedules: [],
    todaySchedules: [],
    colorLabels: {},

    /** 특정 연월 일정을 로드한다. 선택일이 그 달 밖이면 그 달 1일로 옮긴다 */
    loadMonth: async (year, month) => {
      const monthSchedules = await getSchedulesByMonth(year, month);
      const { selectedDate } = get();
      const prefix = `${year}-${String(month).padStart(2, "0")}`;
      const newSelectedDate = selectedDate.startsWith(prefix) ? selectedDate : toDateStr(year, month, 1);

      set({
        monthSchedules,
        year,
        month,
        isLoaded: true,
        selectedDate: newSelectedDate,
        selectedDateSchedules: filterByDate(monthSchedules, newSelectedDate),
      });
    },

    /** 날짜를 선택한다 (DB 재조회 없음) */
    selectDate: (date) => {
      set({ selectedDate: date, selectedDateSchedules: filterByDate(get().monthSchedules, date) });
    },

    /** 달력을 특정 날짜가 있는 달로 옮기고 그 날짜를 선택한다 */
    goToDate: async (date) => {
      // 선택일을 먼저 바꿔 두면 loadMonth가 그 달 1일로 덮어쓰지 않는다
      set({ selectedDate: date });
      const [y, m] = date.split("-").map(Number);
      await get().loadMonth(y, m);
    },

    /** 달력을 이번 달로 돌리고 오늘을 선택한다 */
    goToday: async () => {
      await get().goToDate(todayString());
    },

    /** 홈 '오늘 일정'을 불러온다 (날짜가 바뀐 뒤 복귀했을 때도 호출) */
    loadToday: async () => {
      set({ todaySchedules: await getSchedulesOnDate(todayString()) });
    },

    loadColorLabels: async () => {
      set({ colorLabels: await getColorLabels() });
    },

    saveColorLabel: async (color, label) => {
      await setColorLabel(color, label);
      set({ colorLabels: await getColorLabels() });
    },

    add: async (s) => {
      const id = await addSchedule(s);
      await scheduleAndStore(id, s);
      await refresh();
    },

    update: async (id, s) => {
      // 제목(알림 문구)·날짜·시각 중 무엇이 바뀌었든 기존 알림을 지우고 새 내용으로 다시 건다.
      // 무엇이 바뀌었는지 비교하는 것보다 단순하고, 바뀌지 않았어도 결과가 같다.
      const before = await getScheduleById(id);
      if (before?.notification_id) await cancelNotification(before.notification_id);
      await updateSchedule(id, s);
      // s는 바뀐 필드만 담을 수 있으므로 기존 값과 합쳐 최종 내용을 만든다.
      // 출처 표식(source_id)은 수정으로 바뀌지 않으므로(updateSchedule이 쓰지 않음) 항상 DB 값을 쓴다 —
      // s에 source_id: undefined가 섞여 들어와도 가져온 일정에 알림이 걸리지 않게 한다.
      if (before) await scheduleAndStore(id, { ...before, ...s, source_id: before.source_id });
      await refresh();
    },

    remove: async (id) => {
      const before = await getScheduleById(id);
      if (before?.notification_id) await cancelNotification(before.notification_id);
      await deleteSchedule(id);
      await refresh();
    },

    reload: refresh,

    resyncNotificationsIfNeeded: async () => {
      if (!(await takeNotificationResyncFlag())) return;
      // 예전 버전의 알림은 어느 일정 것인지 알 수 없으므로 모두 취소한다.
      // 하루가 예약하는 알림은 일정 알림뿐이라(notifications.ts) 다른 알림을 지울 걱정은 없다.
      await cancelAllNotifications();
      // 지운 일정·옛 시각의 알림은 사라지고, 남아 있는 앞으로의 일정만 현재 내용으로 다시 예약된다
      const upcoming = await getUpcomingTimedSchedules(todayString());
      for (const s of upcoming) await scheduleAndStore(s.id, s);
    },
  };
});
