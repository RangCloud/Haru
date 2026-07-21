/**
 * 커스텀 useColorScheme
 *
 * useThemeStore의 모드 설정을 우선 적용하고,
 * 'system' 모드일 때만 기기 시스템 설정을 따른다.
 * 항상 'light' | 'dark'를 반환 (null/undefined 없음).
 */

import { useColorScheme as useSystemColorScheme } from "react-native";
import { useThemeStore } from "@/src/store/themeStore";

export function useColorScheme(): "light" | "dark" {
  const system = useSystemColorScheme() ?? "light";
  const { mode } = useThemeStore();
  return mode === "system" ? system : mode;
}
