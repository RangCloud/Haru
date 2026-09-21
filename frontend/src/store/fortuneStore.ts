/**
 * 운세 스토어 — 생년월일 저장 + 하루 1회 운세 캐시
 *
 * - 생년월일(시)은 SecureStore에 영구 저장 (앱 재시작 후에도 유지)
 * - 오늘의 운세는 날짜 기반으로 클라이언트 캐시 (당일 재진입 시 API 재호출 안 함)
 * - 하루가 바뀌면 자동으로 새 운세를 가져옴
 */

import * as SecureStore from "expo-secure-store";
import { create } from "zustand";

import { fetchFortune, type FortuneData } from "@/src/api/fortune";

// SecureStore 키 상수
const BIRTH_INFO_KEY = "haru_birth_info";
const FORTUNE_CACHE_KEY = "haru_fortune_cache";

export interface BirthInfo {
  year: number;
  month: number;
  monthType: "solar" | "lunar"; // 양력/음력
  day: number;
  hour: number | null;           // null = 시간 모름
}

interface FortuneCacheEntry {
  date: string;       // "YYYY-MM-DD" — 날짜가 바뀌면 무효화
  fortune: FortuneData;
}

interface FortuneState {
  birthInfo: BirthInfo | null;
  todayFortune: FortuneData | null;
  isLoading: boolean;
  error: string | null;

  // 앱 시작 시 SecureStore에서 생년월일과 캐시된 운세를 불러온다
  loadBirthInfo: () => Promise<void>;
  // 생년월일 저장 후 즉시 운세를 가져온다
  saveBirthInfo: (info: BirthInfo) => Promise<void>;
  // 생년월일 초기화 (재설정)
  clearBirthInfo: () => Promise<void>;
  // 오늘의 운세 fetch — 이미 오늘 것이 캐시돼 있으면 API 호출 생략
  fetchTodayFortune: () => Promise<void>;
}

/** 오늘 날짜 문자열 (YYYY-MM-DD) */
function todayStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export const useFortuneStore = create<FortuneState>((set, get) => ({
  birthInfo: null,
  todayFortune: null,
  isLoading: false,
  error: null,

  loadBirthInfo: async () => {
    try {
      // 생년월일 불러오기
      const raw = await SecureStore.getItemAsync(BIRTH_INFO_KEY);
      const birthInfo: BirthInfo | null = raw ? JSON.parse(raw) : null;

      // 캐시된 운세 불러오기 (당일 캐시만 유효)
      const cacheRaw = await SecureStore.getItemAsync(FORTUNE_CACHE_KEY);
      const cache: FortuneCacheEntry | null = cacheRaw ? JSON.parse(cacheRaw) : null;
      const todayFortune = cache?.date === todayStr() ? cache.fortune : null;

      set({ birthInfo, todayFortune });
    } catch {
      // SecureStore 읽기 실패 시 빈 상태로 시작
      set({ birthInfo: null, todayFortune: null });
    }
  },

  saveBirthInfo: async (info: BirthInfo) => {
    try {
      await SecureStore.setItemAsync(BIRTH_INFO_KEY, JSON.stringify(info));
      // 생년월일이 바뀌면 기존 운세 캐시 무효화
      await SecureStore.deleteItemAsync(FORTUNE_CACHE_KEY);
      set({ birthInfo: info, todayFortune: null, error: null });
      // 저장 즉시 오늘 운세를 가져온다
      await get().fetchTodayFortune();
    } catch {
      set({ error: "생년월일 저장에 실패했습니다." });
    }
  },

  clearBirthInfo: async () => {
    try {
      await SecureStore.deleteItemAsync(BIRTH_INFO_KEY);
      await SecureStore.deleteItemAsync(FORTUNE_CACHE_KEY);
      set({ birthInfo: null, todayFortune: null, error: null });
    } catch {
      set({ error: "초기화에 실패했습니다." });
    }
  },

  fetchTodayFortune: async () => {
    const { birthInfo, todayFortune } = get();

    // 생년월일이 없으면 운세를 가져올 수 없음
    if (!birthInfo) return;

    // 이미 오늘 운세가 있으면 API 재호출 생략 (하루 1회 제한)
    if (todayFortune) return;

    set({ isLoading: true, error: null });
    try {
      const fortune = await fetchFortune({
        birthYear: birthInfo.year,
        birthMonth: birthInfo.month,
        birthMonthType: birthInfo.monthType,
        birthDay: birthInfo.day,
        birthHour: birthInfo.hour ?? undefined,
      });

      // 오늘 날짜와 함께 캐시에 저장 — 앱 재시작 후에도 당일 재요청 방지
      const entry: FortuneCacheEntry = { date: todayStr(), fortune };
      await SecureStore.setItemAsync(FORTUNE_CACHE_KEY, JSON.stringify(entry));

      set({ todayFortune: fortune, isLoading: false });
    } catch (e) {
      set({
        error: e instanceof Error ? e.message : "운세를 불러오지 못했습니다.",
        isLoading: false,
      });
    }
  },
}));
