/**
 * 웹용 useColorScheme — 하이드레이션 문제 방지를 위해 별도 파일 유지
 *
 * 정적 렌더링 시 'light'를 기본값으로 사용하고,
 * 클라이언트 하이드레이션 후 실제 시스템 설정 + 스토어 모드를 적용한다.
 */

import { useEffect, useState } from "react";
import { useColorScheme as useRNColorScheme } from "react-native";
import { useThemeStore } from "@/src/store/themeStore";

export function useColorScheme(): "light" | "dark" {
  const [hasHydrated, setHasHydrated] = useState(false);
  const system = useRNColorScheme() ?? "light";
  const { mode } = useThemeStore();

  useEffect(() => {
    setHasHydrated(true);
  }, []);

  if (!hasHydrated) return "light";
  return mode === "system" ? system : mode;
}
