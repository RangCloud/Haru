/**
 * 앱 설정 스토어 — 시작 화면·뉴스 카테고리
 *
 * 앱을 새로 켰을 때 먼저 보여줄 탭을 사용자가 고른다 (홈·일정·운세·뉴스).
 * 뉴스 탭에 보여줄 카테고리와 순서도 사용자가 정한다.
 * 테마 설정(themeStore)과 같은 방식으로 SecureStore에 저장해 재시작 후에도 유지한다.
 * 민감한 값은 아니지만, 이미 쓰고 있는 저장소를 재사용해 새 라이브러리를 들이지 않기 위함이다.
 */

import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";
import { create } from "zustand";

import { NEWS_CATEGORIES, type NewsCategory } from "@/src/api/news";

export type StartTab = "index" | "schedule" | "fortune" | "news";

export const START_TAB_OPTIONS: { value: StartTab; label: string }[] = [
  { value: "index", label: "홈" },
  { value: "schedule", label: "일정" },
  { value: "fortune", label: "운세" },
  { value: "news", label: "뉴스" },
];

const START_TAB_KEY = "haru_start_tab";
const NEWS_CATEGORIES_KEY = "haru_news_categories";

const ALL_NEWS = NEWS_CATEGORIES.map((c) => c.value);

interface SettingsState {
  startTab: StartTab;
  /** 뉴스 탭에 보여줄 카테고리 — 배열 순서가 칩 순서 (수정 3번) */
  newsCategories: NewsCategory[];
  isLoaded: boolean;       // 저장값을 읽기 전에 시작 탭을 적용하지 않도록 구분
  setStartTab: (tab: StartTab) => Promise<void>;
  setNewsCategories: (cats: NewsCategory[]) => Promise<void>;
  loadSettings: () => Promise<void>;
}

const isStartTab = (v: string | null): v is StartTab =>
  v === "index" || v === "schedule" || v === "fortune" || v === "news";

/** 저장된 값이 깨졌거나 예전 형식이어도 안전하게 복원 — 알 수 없는 값·중복은 버리고, 비면 기본값 */
function parseNewsCategories(raw: string | null): NewsCategory[] | null {
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return null;
    const valid = [...new Set(parsed.filter((v): v is NewsCategory => ALL_NEWS.includes(v as NewsCategory)))];
    return valid.length > 0 ? valid : null;
  } catch {
    return null;
  }
}

async function save(key: string, value: string) {
  try {
    if (Platform.OS !== "web") await SecureStore.setItemAsync(key, value);
  } catch {
    // 저장 실패 시 다음 실행에서 기본값으로 시작 — 앱 사용에는 지장 없음
  }
}

export const useSettingsStore = create<SettingsState>((set) => ({
  startTab: "index",
  newsCategories: ALL_NEWS,
  isLoaded: false,

  setStartTab: async (tab) => {
    set({ startTab: tab });
    await save(START_TAB_KEY, tab);
  },

  setNewsCategories: async (cats) => {
    // 최소 하나는 남긴다 — 모두 끄면 뉴스 탭에 보여줄 것이 없어진다
    if (cats.length === 0) return;
    set({ newsCategories: cats });
    await save(NEWS_CATEGORIES_KEY, JSON.stringify(cats));
  },

  loadSettings: async () => {
    try {
      if (Platform.OS !== "web") {
        const [tab, news] = await Promise.all([
          SecureStore.getItemAsync(START_TAB_KEY),
          SecureStore.getItemAsync(NEWS_CATEGORIES_KEY),
        ]);
        if (isStartTab(tab)) set({ startTab: tab });
        const cats = parseNewsCategories(news);
        if (cats) set({ newsCategories: cats });
      }
    } catch {
      // 읽기 실패 시 기본값 유지
    }
    set({ isLoaded: true });
  },
}));
