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
  // clientId 값은 frontend/.env.local의 EXPO_PUBLIC_GOOGLE_* 에서 읽는다.
  const [request, response, promptGoogleAsync] = Google.useAuthRequest({
    webClientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID,
    iosClientId: process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID,
    androidClientId: process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID,
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
        <Text style={[styles.tagline, { color: colors.icon }]}>
          오늘 하루를 한눈에 정리하세요
        </Text>
      </View>

      {/* 로그인 버튼 영역 */}
      <View style={styles.buttons}>
        {/* Google */}
        <TouchableOpacity
          style={[styles.btn, styles.btnGoogle, { borderColor: colors.icon + "40" }]}
          onPress={() => {
            setLoading("google");
            promptGoogleAsync();
          }}
          disabled={!request || loading !== null}
          activeOpacity={0.8}
        >
          {loading === "google" ? (
            <ActivityIndicator color="#444" />
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
            <ActivityIndicator color="#3c1e1e" />
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
            <ActivityIndicator color="#fff" />
          ) : (
            <>
              <Text style={styles.btnIconNaver}>N</Text>
              <Text style={[styles.btnText, { color: "#fff" }]}>네이버로 시작하기</Text>
            </>
          )}
        </TouchableOpacity>
      </View>

      <Text style={[styles.notice, { color: colors.icon }]}>
        로그인 시 이용약관 및 개인정보처리방침에 동의하게 됩니다.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 32,
    gap: 40,
  },
  header: {
    alignItems: "center",
    gap: 8,
  },
  logo: {
    fontSize: 64,
    marginBottom: 4,
  },
  appName: {
    fontSize: 36,
    fontWeight: "700",
    letterSpacing: -0.5,
  },
  tagline: {
    fontSize: 15,
  },
  buttons: {
    width: "100%",
    gap: 12,
  },
  btn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 15,
    borderRadius: 12,
    gap: 10,
  },
  // Google — 흰 배경 + 테두리
  btnGoogle: {
    backgroundColor: "#fff",
    borderWidth: 1,
  },
  btnIconGoogle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#4285F4",
  },
  // 카카오 — 공식 노란색
  btnKakao: {
    backgroundColor: "#FEE500",
  },
  btnIconKakao: {
    fontSize: 18,
    fontWeight: "700",
    color: "#3c1e1e",
  },
  // 네이버 — 공식 초록색
  btnNaver: {
    backgroundColor: "#03C75A",
  },
  btnIconNaver: {
    fontSize: 18,
    fontWeight: "700",
    color: "#fff",
  },
  btnText: {
    fontSize: 16,
    fontWeight: "600",
  },
  notice: {
    fontSize: 11,
    textAlign: "center",
    lineHeight: 16,
  },
});
