import { DarkTheme, DefaultTheme, ThemeProvider } from "@react-navigation/native";
import { router, Stack, useSegments } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useEffect } from "react";
import { LogBox, Platform } from "react-native";
import "react-native-reanimated";

// 웹 환경에서는 LogBox(네이티브 디버그 오버레이)가 초기화에 실패해 앱 전체가 crash됨
if (Platform.OS === "web") {
  LogBox.ignoreAllLogs();
}

import { useColorScheme } from "@/hooks/use-color-scheme";
import { useAuthStore } from "@/src/store/authStore";
import { useSettingsStore } from "@/src/store/settingsStore";
import { useThemeStore } from "@/src/store/themeStore";

// 시작 화면은 "앱을 새로 켰을 때 한 번"만 적용한다.
// 컴포넌트 상태가 아니라 모듈 변수로 두어, 화면이 다시 그려져도 두 번 이동하지 않게 한다.
let startTabApplied = false;

export const unstable_settings = {
  anchor: "(tabs)",
};

export default function RootLayout() {
  const colorScheme = useColorScheme();
  const { user, isLoaded, loadSession } = useAuthStore();
  const { loadMode } = useThemeStore();
  const { startTab, isLoaded: settingsLoaded, loadSettings } = useSettingsStore();
  const segments = useSegments();

  // 앱 최초 실행 시 세션 + 테마 + 시작 화면 설정 복원
  useEffect(() => {
    loadSession();
    loadMode();
    loadSettings();
  }, []);

  // 피드백 17번: 저장된 세션으로 바로 탭 화면에 들어온 경우에만 사용자가 고른 시작 탭으로 이동한다.
  // 로그인 화면을 거쳐 들어온 경우는 로그인 직후 홈을 보여주는 흐름을 유지한다.
  useEffect(() => {
    if (startTabApplied || !isLoaded || !settingsLoaded) return;
    if (segments[0] === "(auth)" || !user) {
      startTabApplied = true;
      return;
    }
    startTabApplied = true;
    if (startTab !== "index") router.replace(`/(tabs)/${startTab}`);
  }, [isLoaded, settingsLoaded, user, segments, startTab]);

  // 세션 로드 완료 후 로그인 여부에 따라 라우트 전환
  useEffect(() => {
    if (!isLoaded) return;

    // Google 로그인 복귀 화면(oauth2redirect)도 로그인 흐름의 일부로 본다.
    // 여기서 로그인 화면으로 replace 하면 로그인 화면이 새로 만들어져 진행 중이던 인증 요청이 사라진다.
    const first: string | undefined = segments[0];
    const inAuthGroup = first === "(auth)" || first === "oauth2redirect";

    if (!user && !inAuthGroup) {
      // 비로그인 상태인데 탭에 있으면 로그인 화면으로
      router.replace("/(auth)/login");
    } else if (user && inAuthGroup) {
      // 로그인됐는데 로그인 화면에 있으면 탭으로
      router.replace("/(tabs)");
    }
  }, [user, isLoaded, segments]);

  return (
    <ThemeProvider value={colorScheme === "dark" ? DarkTheme : DefaultTheme}>
      <Stack>
        <Stack.Screen name="(auth)" options={{ headerShown: false }} />
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        {/* 소비 분석 — 화면 안에 자체 헤더(뒤로 가기)가 있어 기본 헤더는 숨긴다 */}
        <Stack.Screen name="budget-insight" options={{ headerShown: false }} />
        {/* Google 로그인 복귀 주소 — 열리자마자 로그인 화면으로 돌아가는 빈 화면. 전환 효과 없이 처리한다 */}
        <Stack.Screen name="oauth2redirect/google" options={{ headerShown: false, animation: "none" }} />
        <Stack.Screen name="modal" options={{ presentation: "modal", title: "Modal" }} />
      </Stack>
      {/* 상태바 글자색은 기기 설정이 아니라 앱에서 고른 테마를 따른다 (다크면 밝은 글자) */}
      <StatusBar style={colorScheme === "dark" ? "light" : "dark"} />
    </ThemeProvider>
  );
}
