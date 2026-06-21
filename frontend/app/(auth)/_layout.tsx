/**
 * 인증 그룹 레이아웃
 *
 * 이미 로그인된 사용자가 로그인 화면에 진입하면 탭으로 리다이렉트한다.
 */

import { Redirect, Stack } from "expo-router";

import { useAuthStore } from "@/src/store/authStore";

export default function AuthLayout() {
  const { user, isLoaded } = useAuthStore();

  // 세션 로드 전에는 아무것도 렌더링하지 않음 (루트 레이아웃이 스플래시 처리)
  if (!isLoaded) return null;

  // 이미 로그인된 상태면 탭으로 이동
  if (user) return <Redirect href="/(tabs)" />;

  return (
    <Stack screenOptions={{ headerShown: false }} />
  );
}
