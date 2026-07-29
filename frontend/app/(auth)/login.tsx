/**
 * 로그인 화면
 *
 * 첫 실행 또는 로그아웃 후에만 표시된다.
 * 세 가지 소셜 로그인을 지원한다:
 * - Google: expo-auth-session (브라우저 OAuth)
 * - 카카오: @react-native-kakao/user (네이티브 SDK)
 * - 네이버: @react-native-seoul/naver-login (네이티브 SDK)
 *
 * 주의: 카카오·네이버는 Expo Go에서 동작하지 않는다.
 *        개발 빌드(npx expo run:android / run:ios) 또는 EAS Build 필요.
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
import { signInWithKakao, signInWithNaver } from "@/src/api/auth";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { useAuthStore } from "@/src/store/authStore";

// expo-auth-session이 브라우저를 닫을 수 있도록 등록
WebBrowser.maybeCompleteAuthSession();

export default function LoginScreen() {
  const colors = Colors[useColorScheme() ?? "light"];
  const { signIn } = useAuthStore();
  const [loading, setLoading] = useState<"google" | "kakao" | "naver" | null>(null);

  // ── Google OAuth 설정 ──────────────────────────────────────
  // app.json scheme이 "haru"이므로 expo-auth-session이 자동 생성하는 redirect URI는
  // "haru:/oauth2redirect/google"이지만, GCP Android 클라이언트는 패키지명 기반인
  // "com.haru.app:/oauth2redirect/google"을 기대 → 스킴 불일치로 Error 400 발생.
  // makeRedirectUri({ native: ... })로 명시해 패키지명 스킴을 강제 사용.
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

    // 취소·닫기·오류 시 loading 초기화 — 이걸 빠뜨리면 버튼이 영구 비활성화됨
    if (response.type !== "success") {
      setLoading(null);
      return;
    }

    const accessToken = response.authentication?.accessToken;
    if (!accessToken) {
      setLoading(null);
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
      } catch (e) {
        Alert.alert("오류", "Google 로그인에 실패했습니다.");
      } finally {
        setLoading(null);
      }
    })();
  }, [response]);

  // ── 카카오 로그인 ──────────────────────────────────────────
  const handleKakao = async () => {
    setLoading("kakao");
    try {
      const user = await signInWithKakao();
      await signIn(user);
      router.replace("/(tabs)");
    } catch (e) {
      // 실제 오류 내용을 보여줘야 디버깅 가능 — 출시 전 제거 예정
      const msg = e instanceof Error ? e.message : String(e);
      Alert.alert("카카오 로그인 오류", msg);
    } finally {
      setLoading(null);
    }
  };

  // ── 네이버 로그인 ──────────────────────────────────────────
  const handleNaver = async () => {
    setLoading("naver");
    try {
      const user = await signInWithNaver();
      await signIn(user);
      router.replace("/(tabs)");
    } catch (e) {
      Alert.alert("오류", "네이버 로그인에 실패했습니다.");
    } finally {
      setLoading(null);
    }
  };

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

        {/* Google */}
        <TouchableOpacity
          style={[styles.btn, styles.btnGoogle, { borderColor: colors.separator }]}
          onPress={() => {
            setLoading("google");
            promptGoogleAsync();
          }}
          disabled={!request || loading !== null}
          activeOpacity={0.8}
        >
          {loading === "google" ? (
            <ActivityIndicator color="#4285F4" size="small" />
          ) : (
            <>
              <Text style={styles.btnIconGoogle}>G</Text>
              <Text style={[styles.btnText, { color: "#3c4043" }]}>Google로 시작하기</Text>
            </>
          )}
        </TouchableOpacity>

        {/* 카카오 */}
        <TouchableOpacity
          style={[styles.btn, styles.btnKakao]}
          onPress={handleKakao}
          disabled={loading !== null}
          activeOpacity={0.8}
        >
          {loading === "kakao" ? (
            <ActivityIndicator color="#3c1e1e" size="small" />
          ) : (
            <>
              <Text style={styles.btnIconKakao}>K</Text>
              <Text style={[styles.btnText, { color: "#3c1e1e" }]}>카카오로 시작하기</Text>
            </>
          )}
        </TouchableOpacity>

        {/* 네이버 */}
        <TouchableOpacity
          style={[styles.btn, styles.btnNaver]}
          onPress={handleNaver}
          disabled={loading !== null}
          activeOpacity={0.8}
        >
          {loading === "naver" ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <>
              <Text style={styles.btnIconNaver}>N</Text>
              <Text style={[styles.btnText, { color: "#fff" }]}>네이버로 시작하기</Text>
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
  // 버튼을 감싸는 카드
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
  // Google — 흰 배경 + 구분선
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
  // 카카오 — 공식 노란색 (#FEE500)
  btnKakao: {
    backgroundColor: "#FEE500",
  },
  btnIconKakao: {
    fontSize: 17,
    fontWeight: "700",
    color: "#3c1e1e",
    width: 20,
    textAlign: "center",
  },
  // 네이버 — 공식 초록색 (#03C75A)
  btnNaver: {
    backgroundColor: "#03C75A",
  },
  btnIconNaver: {
    fontSize: 17,
    fontWeight: "700",
    color: "#fff",
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
