/**
 * 일정 전역 상태 — Zustand store
 *
 * - monthSchedules: 달력에 보이는 월의 일정 (기간 일정은 걸쳐 있는 모든 달에 포함)
 * - selectedDateSchedules: 달력에서 선택한 날짜의 일정 (DB 재조회 없이 메모리에서 파생)
 * - todaySchedules: 홈 '오늘 일정' 전용. 달력에서 다른 달로 넘겨도 바뀌지 않도록
 *   monthSchedules와 분리해 오늘 날짜로 따로 조회한다.
 * - colorLabels: 색상별 사용자 이름 (예: 파랑 = 회사)
 */

import { create } from "zustand";
import { getColorLabels, setColorLabel, type ColorLabels } from "@/src/db/colorLabel";
import {
  addSchedule,
  deleteSchedule,
  getSchedulesByMonth,
  getSchedulesOnDate,
  updateSchedule,
  type NewScheduleItem,
  type ScheduleItem,
} from "@/src/db/schedule";
import { todayString, toDateStr } from "@/src/utils/date";
import { occursOn, sortForDate } from "@/src/utils/scheduleText";

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
}

// ── 헬퍼 ──────────────────────────────────────────────────────

function filterByDate(schedules: ScheduleItem[], date: string): ScheduleItem[] {
  return sortForDate(schedules.filter((s) => occursOn(s, date)), date);
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
      await addSchedule(s);
      await refresh();
    },

    update: async (id, s) => {
      await updateSchedule(id, s);
      await refresh();
    },

    remove: async (id) => {
      await deleteSchedule(id);
      await refresh();
    },

    reload: refresh,
  };
});
