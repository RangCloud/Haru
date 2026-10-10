/**
 * 커스텀 useColorScheme
 *
 * 설정에서 고른 테마(라이트/다크)를 그대로 돌려준다.
 * '시스템' 모드는 없앴으므로 기기 설정을 따로 보지 않는다 — 첫 실행 때의 출발값만 themeStore가 기기 설정에서 가져온다.
 */

import { useThemeStore } from "@/src/store/themeStore";

export function useColorScheme(): "light" | "dark" {
  return useThemeStore((s) => s.mode);
}
