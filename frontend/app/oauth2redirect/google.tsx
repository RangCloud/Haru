/**
 * Google 로그인 복귀 주소를 받는 화면 (Android)
 *
 * Google 로그인 창에서 계정을 고르면 브라우저가 앱을
 * `com.rangcloud.haru:/oauth2redirect/google?code=...` 주소로 다시 연다.
 * expo-router는 앱으로 들어온 모든 주소를 화면 경로로 해석하는데, 이 경로에 해당하는 화면이 없으면
 * "Unmatched Route" 오류 화면이 떠서 로그인이 끝나지 않은 것처럼 보였다.
 *
 * 그래서 이 경로에 빈 화면을 두고, 열리자마자 바로 이전 화면(로그인 화면)으로 돌아간다.
 * 실제 로그인 처리(인증 코드 → 사용자 정보)는 로그인 화면이 계속 맡는다.
 * 로그인 화면은 이 화면 아래에 그대로 살아 있어야 한다 — 다시 만들어지면 진행 중이던 인증 요청이 사라진다.
 *
 * iOS는 로그인 창이 복귀 주소를 직접 처리해 앱으로 주소가 들어오지 않으므로 이 화면이 열리지 않는다.
 */

import { router } from "expo-router";
import { useEffect } from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";

import { Colors } from "@/constants/theme";
import { useColorScheme } from "@/hooks/use-color-scheme";

export default function GoogleOAuthRedirectScreen() {
  const colors = Colors[useColorScheme() ?? "light"];

  useEffect(() => {
    // 보통은 로그인 화면 위에 쌓여 열리므로 한 칸 뒤로 가면 로그인 화면이다.
    // 앱이 완전히 꺼졌다가 이 주소로 켜진 경우에는 돌아갈 화면이 없으므로 처음 화면으로 보낸다.
    if (router.canGoBack()) router.back();
    else router.replace("/");
  }, []);

  // 아주 잠깐 보이는 화면 — 빈 흰 화면 대신 진행 중임을 알린다
  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <ActivityIndicator color={colors.tint} />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, alignItems: "center", justifyContent: "center" },
});
