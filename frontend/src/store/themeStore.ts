/**
 * 테마 설정 스토어 — Zustand + expo-secure-store
 *
 * 세 가지 모드:
 *   'system' — 기기 시스템 설정을 따름 (기본값)
 *   'light'  — 항상 라이트 모드
 *   'dark'   — 항상 다크 모드
 *
 * 선택 값은 SecureStore에 저장해 앱 재시작 후에도 유지된다.
 */

import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";
import { create } from "zustand";

export type ThemeMode = "light" | "dark" | "system";

const THEME_KEY = "haru_theme_mode";

interface ThemeState {
  mode: ThemeMode;
  setMode: (mode: ThemeMode) => Promise<void>;
  loadMode: () => Promise<void>;
}

export const useThemeStore = create<ThemeState>((set) => ({
  mode: "system",

  /** 모드 변경 — 상태 업데이트 + SecureStore 저장 */
  setMode: async (mode) => {
    set({ mode });
    try {
      if (Platform.OS !== "web") {
        await SecureStore.setItemAsync(THEME_KEY, mode);
      }
    } catch {
      // 저장 실패는 무시 — 다음 실행 시 기본값으로 복원됨
    }
  },

  /** 앱 시작 시 저장된 테마 설정 복원 */
  loadMode: async () => {
    try {
      if (Platform.OS === "web") return;
      const saved = await SecureStore.getItemAsync(THEME_KEY);
      if (saved === "light" || saved === "dark" || saved === "system") {
        set({ mode: saved });
      }
    } catch {
      // 읽기 실패 시 기본값(system) 유지
    }
  },
}));
