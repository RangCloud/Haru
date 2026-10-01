/**
 * 공휴일 상태 — 연도별로 한 번만 받아 메모리에 둔다
 *
 * 공휴일은 달력을 꾸미는 부가 정보라, 받아오지 못해도(오프라인·서버 키 미설정 등)
 * 오류를 띄우지 않고 공휴일 없이 달력을 그린다. 실패한 연도는 다음 앱 실행 때 다시 시도한다.
 */

import { create } from "zustand";

import { fetchHolidays } from "@/src/api/holidays";

interface HolidayState {
  /** { '2026-10-03': '개천절', ... } — 받은 연도의 공휴일을 모두 합친 지도 */
  names: Record<string, string>;
  loadYear: (year: number) => Promise<void>;
}

const requested = new Set<number>();   // 같은 연도를 동시에 여러 번 요청하지 않도록

export const useHolidayStore = create<HolidayState>((set, get) => ({
  names: {},

  loadYear: async (year) => {
    if (requested.has(year)) return;
    requested.add(year);
    try {
      const list = await fetchHolidays(year);
      const next = { ...get().names };
      for (const h of list) next[h.date] = h.name;
      set({ names: next });
    } catch {
      requested.delete(year);   // 실패하면 나중에 다시 시도할 수 있게
    }
  },
}));
