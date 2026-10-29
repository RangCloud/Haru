/**
 * 운세 스토어 — 생년월일 저장 + 하루 1회 운세 캐시
 *
 * - 생년월일(시)은 SecureStore에 영구 저장 (앱 재시작 후에도 유지)
 * - 오늘의 운세는 날짜 기반으로 클라이언트 캐시 (당일 재진입 시 API 재호출 안 함)
 * - 하루가 바뀌면 자동으로 새 운세를 가져옴
 * - AI 전송 동의 전에는 서버를 호출하지 않는다 — App Store 심사 지침 5.1.2(i)는 개인정보(생년월일)를
 *   제3자 AI(Anthropic Claude)로 보내기 전에 알리고 명시적으로 동의를 받도록 요구한다.
 *   예전 빌드에서 생년월일을 이미 저장한 사용자도 동의 전까지는 운세를 새로 받지 않는다.
 */

import * as SecureStore from "expo-secure-store";
import { create } from "zustand";

import { fetchFortune, type FortuneData } from "@/src/api/fortune";

// SecureStore 키 상수
const BIRTH_INFO_KEY = "haru_birth_info";
const FORTUNE_CACHE_KEY = "haru_fortune_cache";
// AI 전송 동의 여부 — 값이 "1"이면 동의함. 생년월일을 다시 설정하면 지워진다(동의 철회 경로)
const AI_CONSENT_KEY = "haru_fortune_ai_consent";

export interface BirthInfo {
  year: number;
  month: number;
  monthType: "solar" | "lunar"; // 양력/음력
  day: number;
  hour: number | null;           // null = 시간 모름
  minute?: number | null;        // null·없음 = 분 모름 (예전에 저장된 생년월일에는 이 값이 없다)
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
  aiConsent: boolean; // 생년월일을 AI로 보내는 데 동의했는지

  // 앱 시작 시 SecureStore에서 생년월일과 캐시된 운세를 불러온다
  loadBirthInfo: () => Promise<void>;
  // AI 전송 동의를 저장한다 — 동의 창에서 '동의'를 누른 경우에만 부른다
  giveAiConsent: () => Promise<void>;
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
  aiConsent: false,

  loadBirthInfo: async () => {
    try {
      // 생년월일 불러오기
      const raw = await SecureStore.getItemAsync(BIRTH_INFO_KEY);
      const birthInfo: BirthInfo | null = raw ? JSON.parse(raw) : null;

      // 캐시된 운세 불러오기 (당일 캐시만 유효)
      const cacheRaw = await SecureStore.getItemAsync(FORTUNE_CACHE_KEY);
      const cache: FortuneCacheEntry | null = cacheRaw ? JSON.parse(cacheRaw) : null;
      const todayFortune = cache?.date === todayStr() ? cache.fortune : null;

      const aiConsent = (await SecureStore.getItemAsync(AI_CONSENT_KEY)) === "1";

      set({ birthInfo, todayFortune, aiConsent });
    } catch {
      // SecureStore 읽기 실패 시 빈 상태로 시작 (동의도 없는 것으로 본다 — 모르면 보내지 않는 쪽이 안전하다)
      set({ birthInfo: null, todayFortune: null, aiConsent: false });
    }
  },

  giveAiConsent: async () => {
    // 저장에 실패해도 이번 실행 동안은 동의 상태로 둔다 — 사용자가 방금 직접 동의했기 때문.
    // 다음 실행 때 다시 묻게 될 뿐, 동의 없이 보내는 경우는 생기지 않는다.
    await SecureStore.setItemAsync(AI_CONSENT_KEY, "1").catch(() => {});
    set({ aiConsent: true });
  },

  saveBirthInfo: async (info: BirthInfo) => {
    try {
      await SecureStore.setItemAsync(BIRTH_INFO_KEY, JSON.stringify(info));
      // 캐시는 유지한다 — fetchTodayFortune에서 당일 캐시가 있으면 재사용한다.
      // (같은 날 생년월일을 바꿔도 이미 운세를 받은 경우 재호출하지 않음)
      set({ birthInfo: info, todayFortune: null, error: null });
      // 저장 즉시 오늘 운세를 가져온다 (캐시 없으면 API 호출)
      await get().fetchTodayFortune();
    } catch {
      set({ error: "생년월일 저장에 실패했습니다." });
    }
  },

  clearBirthInfo: async () => {
    try {
      // 생년월일만 삭제한다. 운세 캐시는 유지하여 당일 재요청을 막는다.
      // FORTUNE_CACHE_KEY를 지우면 새 생년월일 입력 시 당일 운세를 다시 볼 수 있어
      // 하루 1회 제한이 우회되므로 삭제하지 않는다.
      await SecureStore.deleteItemAsync(BIRTH_INFO_KEY);
      // AI 전송 동의도 함께 지운다 — 동의를 거둘 수 있는 길이 있어야 하고,
      // 새 생년월일을 보내기 전에 무엇이 어디로 가는지 다시 알리는 편이 맞다
      await SecureStore.deleteItemAsync(AI_CONSENT_KEY);
      set({ birthInfo: null, todayFortune: null, error: null, aiConsent: false });
    } catch {
      set({ error: "초기화에 실패했습니다." });
    }
  },

  fetchTodayFortune: async () => {
    const { birthInfo, todayFortune, aiConsent } = get();

    // 생년월일이 없으면 운세를 가져올 수 없음
    if (!birthInfo) return;

    // state에 이미 오늘 운세가 있으면 API 재호출 생략
    if (todayFortune) return;

    // state에는 없지만 SecureStore 캐시 확인
    // clearBirthInfo 후 새 생년월일 입력 시 같은 날 재요청을 방지한다
    try {
      const cacheRaw = await SecureStore.getItemAsync(FORTUNE_CACHE_KEY);
      const cache: FortuneCacheEntry | null = cacheRaw ? JSON.parse(cacheRaw) : null;
      if (cache?.date === todayStr()) {
        set({ todayFortune: cache.fortune });
        return;
      }
    } catch {
      // 캐시 읽기 실패 시 무시하고 API 호출로 넘어간다
    }

    // 여기부터는 생년월일이 기기 밖(서버 → Claude)으로 나간다. 동의가 없으면 멈춘다.
    // 화면이 동의 창을 띄우지만, 어느 경로로 불리든 이 한 곳에서 막아 두면 빠뜨릴 일이 없다.
    if (!aiConsent) return;

    set({ isLoading: true, error: null });
    try {
      const fortune = await fetchFortune({
        birthYear: birthInfo.year,
        birthMonth: birthInfo.month,
        birthMonthType: birthInfo.monthType,
        birthDay: birthInfo.day,
        birthHour: birthInfo.hour ?? undefined,
        // 시를 모르면 분은 보내지 않는다
        birthMinute: birthInfo.hour !== null ? (birthInfo.minute ?? undefined) : undefined,
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
