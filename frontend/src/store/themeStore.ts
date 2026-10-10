/**
 * 테마 설정 스토어 — Zustand + expo-secure-store
 *
 * 두 가지 모드만 있다: 'light'(라이트) / 'dark'(다크).
 * 예전에는 '시스템' 모드가 있었지만, 설정에서 직접 고르는 두 가지로 단순화했다.
 *
 * 처음 설치했을 때는 사용자가 아직 고른 적이 없으므로 기기의 현재 설정(라이트/다크)을 출발점으로 삼는다.
 * 예전 버전에서 '시스템'으로 저장해 둔 사용자도 같은 방식으로 옮겨 온다 — 업데이트 직후 화면이
 * 갑자기 반대 테마로 바뀌지 않게 하기 위함이다. 한 번 정해진 뒤에는 기기 설정이 바뀌어도 따라가지 않는다.
 *
 * 선택 값은 SecureStore에 저장해 앱 재시작 후에도 유지된다.
 */

import * as SecureStore from "expo-secure-store";
import { Appearance, Platform } from "react-native";
import { create } from "zustand";

export type ThemeMode = "light" | "dark";

const THEME_KEY = "haru_theme_mode";

/** 기기의 현재 설정 — 알 수 없으면 라이트 */
function deviceTheme(): ThemeMode {
  return Appearance.getColorScheme() === "dark" ? "dark" : "light";
}

async function save(mode: ThemeMode) {
  try {
    if (Platform.OS !== "web") await SecureStore.setItemAsync(THEME_KEY, mode);
  } catch {
    // 저장 실패는 무시 — 다음 실행 시 기기 설정에서 다시 출발한다
  }
}

interface ThemeState {
  mode: ThemeMode;
  setMode: (mode: ThemeMode) => Promise<void>;
  loadMode: () => Promise<void>;
}

export const useThemeStore = create<ThemeState>((set, get) => ({
  // 저장값을 읽기 전 첫 화면도 기기 설정에 맞춰 그린다 (다크 기기에서 흰 화면이 번쩍이지 않게)
  mode: deviceTheme(),

  /** 모드 변경 — 상태 업데이트 + SecureStore 저장 */
  setMode: async (mode) => {
    set({ mode });
    await save(mode);
  },

  /** 앱 시작 시 저장된 테마 설정 복원 */
  loadMode: async () => {
    try {
      if (Platform.OS === "web") return;
      const saved = await SecureStore.getItemAsync(THEME_KEY);
      if (saved === "light" || saved === "dark") {
        set({ mode: saved });
      } else {
        // 저장값이 없거나(첫 실행) 예전의 'system'이면, 지금 보이는 테마를 그대로 확정해 저장한다
        await save(get().mode);
      }
    } catch {
      // 읽기 실패 시 기기 설정 기준 유지
    }
  },
}));
