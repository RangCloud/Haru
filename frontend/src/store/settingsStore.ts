/**
 * 앱 설정 스토어 — 시작 화면
 *
 * 앱을 새로 켰을 때 먼저 보여줄 탭을 사용자가 고른다 (홈·일정·운세·뉴스).
 * 테마 설정(themeStore)과 같은 방식으로 SecureStore에 저장해 재시작 후에도 유지한다.
 * 민감한 값은 아니지만, 이미 쓰고 있는 저장소를 재사용해 새 라이브러리를 들이지 않기 위함이다.
 */

import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";
import { create } from "zustand";

export type StartTab = "index" | "schedule" | "fortune" | "news";

export const START_TAB_OPTIONS: { value: StartTab; label: string }[] = [
  { value: "index", label: "홈" },
  { value: "schedule", label: "일정" },
  { value: "fortune", label: "운세" },
  { value: "news", label: "뉴스" },
];

const START_TAB_KEY = "haru_start_tab";

interface SettingsState {
  startTab: StartTab;
  isLoaded: boolean;       // 저장값을 읽기 전에 시작 탭을 적용하지 않도록 구분
  setStartTab: (tab: StartTab) => Promise<void>;
  loadSettings: () => Promise<void>;
}

const isStartTab = (v: string | null): v is StartTab =>
  v === "index" || v === "schedule" || v === "fortune" || v === "news";

export const useSettingsStore = create<SettingsState>((set) => ({
  startTab: "index",
  isLoaded: false,

  setStartTab: async (tab) => {
    set({ startTab: tab });
    try {
      if (Platform.OS !== "web") await SecureStore.setItemAsync(START_TAB_KEY, tab);
    } catch {
      // 저장 실패 시 다음 실행에서 홈으로 시작 — 앱 사용에는 지장 없음
    }
  },

  loadSettings: async () => {
    try {
      if (Platform.OS !== "web") {
        const saved = await SecureStore.getItemAsync(START_TAB_KEY);
        if (isStartTab(saved)) set({ startTab: saved });
      }
    } catch {
      // 읽기 실패 시 기본값(홈) 유지
    }
    set({ isLoaded: true });
  },
}));
