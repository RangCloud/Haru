import { DarkTheme, DefaultTheme, ThemeProvider } from "@react-navigation/native";
import { router, Stack, useSegments } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useEffect } from "react";
import { LogBox, Platform } from "react-native";
import "react-native-reanimated";

// 웹 환경에서는 LogBox(네이티브 디버그 오버레이)가 초기화에 실패해 앱 전체가 crash됨
// Platform.OS === 'web' 일 때만 비활성화
if (Platform.OS === "web") {
  LogBox.ignoreAllLogs();
}

import { useColorScheme } from "@/hooks/use-color-scheme";
import { useAuthStore } from "@/src/store/authStore";

export const unstable_settings = {
  anchor: "(tabs)",
};

export default function RootLayout() {
  const colorScheme = useColorScheme();
  const { user, isLoaded, loadSession } = useAuthStore();
  const segments = useSegments();

  // 앱 최초 실행 시 SecureStore에서 저장된 세션 복원
  useEffect(() => {
    loadSession();
  }, []);

  // 세션 로드 완료 후 로그인 여부에 따라 라우트 전환
  useEffect(() => {
    if (!isLoaded) return;

    const inAuthGroup = segments[0] === "(auth)";

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
        <Stack.Screen name="modal" options={{ presentation: "modal", title: "Modal" }} />
      </Stack>
      <StatusBar style="auto" />
    </ThemeProvider>
  );
}
