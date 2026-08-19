/**
 * 로그인 화면 — Google 소셜 로그인만 지원
 *
 * expo-auth-session 브라우저 OAuth 방식을 사용한다.
 * redirect URI는 GCP Android 클라이언트가 기대하는 패키지명 기반 스킴으로 고정.
 */

import * as Google from "expo-auth-session/providers/google";
import { makeRedirectUri } from "expo-auth-session";
import { router } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

import { Colors } from "@/constants/theme";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { useAuthStore } from "@/src/store/authStore";

// expo-auth-session이 브라우저를 닫을 수 있도록 등록
WebBrowser.maybeCompleteAuthSession();

export default function LoginScreen() {
  const colors = Colors[useColorScheme() ?? "light"];
  const { signIn } = useAuthStore();
  const [loading, setLoading] = useState(false);

  // app.json scheme("haru")과 GCP Android 클라이언트가 기대하는 패키지명 기반
  // redirect URI("com.haru.app:/oauth2redirect/google") 불일치가 Error 400 원인.
  // makeRedirectUri({ native: ... })로 패키지명 스킴을 명시해 강제 사용.
  const redirectUri = makeRedirectUri({
    native: "com.haru.app:/oauth2redirect/google",
  });

  const [request, response, promptGoogleAsync] = Google.useAuthRequest({
    webClientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID,
    iosClientId: process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID,
    androidClientId: process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID,
    redirectUri,
  });

  // Google 응답 처리 — response가 success로 바뀌면 유저 정보 조회
  useEffect(() => {
    if (!response) return;

    // 취소·닫기·오류 시 loading 초기화
    if (response.type !== "success") {
      setLoading(false);
      return;
    }

    const accessToken = response.authentication?.accessToken;
    if (!accessToken) {
      setLoading(false);
      return;
    }

    (async () => {
      try {
        const res = await fetch("https://www.googleapis.com/userinfo/v2/me", {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        const info = await res.json();
        await signIn({
          id: info.id,
          name: info.name,
          email: info.email,
          profileImage: info.picture,
          provider: "google",
        });
        router.replace("/(tabs)");
      } catch {
        Alert.alert("오류", "Google 로그인에 실패했습니다.");
      } finally {
        setLoading(false);
      }
    })();
  }, [response]);

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* 앱 브랜딩 */}
      <View style={styles.header}>
        <Text style={styles.logo}>🌸</Text>
        <Text style={[styles.appName, { color: colors.text }]}>하루</Text>
        <Text style={[styles.tagline, { color: colors.subtext }]}>
          오늘 하루를 한눈에 정리하세요
        </Text>
      </View>

      {/* 로그인 버튼 영역 */}
      <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
        <Text style={[styles.cardLabel, { color: colors.subtext }]}>소셜 계정으로 시작하기</Text>

        <TouchableOpacity
          style={[styles.btn, styles.btnGoogle, { borderColor: colors.separator }]}
          onPress={() => {
            setLoading(true);
            promptGoogleAsync();
          }}
          disabled={!request || loading}
          activeOpacity={0.8}
        >
          {loading ? (
            <ActivityIndicator color="#4285F4" size="small" />
          ) : (
            <>
              <Text style={styles.btnIconGoogle}>G</Text>
              <Text style={[styles.btnText, { color: "#3c4043" }]}>Google로 시작하기</Text>
            </>
          )}
        </TouchableOpacity>
      </View>

      <Text style={[styles.notice, { color: colors.subtext }]}>
        로그인 시 이용약관 및 개인정보처리방침에{"\n"}동의하게 됩니다.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 28,
    gap: 32,
  },
  header: {
    alignItems: "center",
    gap: 10,
  },
  logo: {
    fontSize: 80,
    marginBottom: 2,
  },
  appName: {
    fontSize: 40,
    fontWeight: "700",
    letterSpacing: -1,
  },
  tagline: {
    fontSize: 15,
    letterSpacing: 0.2,
  },
  card: {
    width: "100%",
    borderRadius: 20,
    borderWidth: 1,
    padding: 20,
    gap: 12,
  },
  cardLabel: {
    fontSize: 11,
    fontWeight: "600",
    letterSpacing: 0.8,
    textTransform: "uppercase",
    textAlign: "center",
    marginBottom: 2,
  },
  btn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 15,
    borderRadius: 14,
    gap: 10,
  },
  btnGoogle: {
    backgroundColor: "#fff",
    borderWidth: 1,
  },
  btnIconGoogle: {
    fontSize: 17,
    fontWeight: "700",
    color: "#4285F4",
    width: 20,
    textAlign: "center",
  },
  btnText: {
    fontSize: 16,
    fontWeight: "600",
  },
  notice: {
    fontSize: 11,
    textAlign: "center",
    lineHeight: 18,
  },
});
