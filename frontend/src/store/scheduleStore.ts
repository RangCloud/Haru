/**
 * 일정 전역 상태 — Zustand store
 *
 * - monthSchedules: 현재 월 전체 일정 (달력 점 표시용)
 * - selectedDate: 선택된 날짜의 일정 목록
 * - 날짜 선택은 DB 재조회 없이 monthSchedules에서 필터링
 */

import { create } from "zustand";
import {
  addSchedule,
  deleteSchedule,
  getSchedulesByMonth,
  type NewScheduleItem,
  type ScheduleItem,
} from "@/src/db/schedule";

// ── 상태 타입 ──────────────────────────────────────────────────

interface ScheduleState {
  monthSchedules: ScheduleItem[];  // 현재 월 전체 (달력 dot 표시용)
  selectedDate: string;            // 선택된 날짜 (YYYY-MM-DD)
  year: number;
  month: number;
  isLoaded: boolean;

  // selectedDate의 일정만 걸러낸 뷰 — DB 재조회 없이 메모리에서 파생
  selectedDateSchedules: ScheduleItem[];

  // 액션
  loadMonth: (year: number, month: number) => Promise<void>;
  selectDate: (date: string) => void;
  add: (s: NewScheduleItem) => Promise<void>;
  remove: (id: number) => Promise<void>;
}

// ── 헬퍼 ──────────────────────────────────────────────────────

function filterByDate(schedules: ScheduleItem[], date: string): ScheduleItem[] {
  return schedules.filter((s) => s.date === date);
}

// ── Store ──────────────────────────────────────────────────────

const now = new Date();
const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;

export const useScheduleStore = create<ScheduleState>((set, get) => ({
  monthSchedules: [],
  selectedDate: todayStr,
  year: now.getFullYear(),
  month: now.getMonth() + 1,
  isLoaded: false,
  selectedDateSchedules: [],

  /** 특정 연월 전체 일정을 로드하고 선택일을 해당 월 1일로 초기화한다 */
  loadMonth: async (year, month) => {
    const monthSchedules = await getSchedulesByMonth(year, month);
    const { selectedDate } = get();

    // 월이 바뀌면 선택일도 해당 월 1일로 초기화
    const newSelectedDate =
      selectedDate.startsWith(`${year}-${String(month).padStart(2, "0")}`)
        ? selectedDate
        : `${year}-${String(month).padStart(2, "0")}-01`;

    set({
      monthSchedules,
      year,
      month,
      isLoaded: true,
      selectedDate: newSelectedDate,
      selectedDateSchedules: filterByDate(monthSchedules, newSelectedDate),
    });
  },

  /** 날짜를 선택하고 해당 날짜의 일정 목록을 갱신한다 (DB 재조회 없음) */
  selectDate: (date) => {
    const { monthSchedules } = get();
    set({
      selectedDate: date,
      selectedDateSchedules: filterByDate(monthSchedules, date),
    });
  },

  /** 일정을 추가하고 현재 월 상태를 갱신한다 */
  add: async (s) => {
    await addSchedule(s);
    const { year, month, selectedDate } = get();
    const monthSchedules = await getSchedulesByMonth(year, month);
    set({
      monthSchedules,
      selectedDateSchedules: filterByDate(monthSchedules, selectedDate),
    });
  },

  /** 일정을 삭제하고 현재 월 상태를 갱신한다 */
  remove: async (id) => {
    await deleteSchedule(id);
    const { year, month, selectedDate } = get();
    const monthSchedules = await getSchedulesByMonth(year, month);
    set({
      monthSchedules,
      selectedDateSchedules: filterByDate(monthSchedules, selectedDate),
    });
  },
}));
