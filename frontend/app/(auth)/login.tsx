/**
 * 로그인 화면 — Google / Apple 소셜 로그인 + 게스트 모드
 *
 * Google: expo-auth-session 브라우저 OAuth 방식
 *   redirect URI는 GCP Android 클라이언트가 기대하는 패키지명 기반 스킴으로 고정.
 *
 * Apple: expo-apple-authentication 네이티브 방식 (iOS 전용)
 *   App Store 심사 규정상 Google 로그인을 제공하면 Apple 로그인도 필수(Guideline 4.8).
 *   Apple은 최초 로그인 시에만 이름·이메일을 제공하므로,
 *   signIn()으로 SecureStore에 저장한 후 이후 로그인에서는 저장 값을 사용한다.
 */

import * as AppleAuthentication from "expo-apple-authentication";
import * as Google from "expo-auth-session/providers/google";
import { makeRedirectUri } from "expo-auth-session";
import { router } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Platform,
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
  const { signIn, continueAsGuest } = useAuthStore();
  const [loading, setLoading] = useState(false);

  // iOS에서 Apple 로그인 사용 가능 여부 확인 (iOS 13+ 기기만 true)
  const [appleAvailable, setAppleAvailable] = useState(false);
  useEffect(() => {
    if (Platform.OS === "ios") {
      AppleAuthentication.isAvailableAsync().then(setAppleAvailable);
    }
  }, []);

  // app.json scheme("haru")과 GCP Android 클라이언트가 기대하는 패키지명 기반
  // redirect URI("com.haru.app:/oauth2redirect/google") 불일치가 Error 400 원인.
  // makeRedirectUri({ native: ... })로 패키지명 스킴을 명시해 강제 사용.
  const redirectUri = makeRedirectUri({
    native: "com.rangcloud.haru:/oauth2redirect/google",
  });

  const [request, response, promptGoogleAsync] = Google.useAuthRequest({
    webClientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID,
    iosClientId: process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID,
    androidClientId: process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID,
    redirectUri,
  });

  // Apple 로그인 처리
  // Apple은 최초 로그인 시에만 fullName·email을 내려줌.
  // 이후 로그인에서는 null → signIn()이 SecureStore에 저장한 세션으로 복원.
  const handleAppleLogin = async () => {
    setLoading(true);
    try {
      const credential = await AppleAuthentication.signInAsync({
        requestedScopes: [
          AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
          AppleAuthentication.AppleAuthenticationScope.EMAIL,
        ],
      });

      // 최초 로그인 시 이름 제공, 이후 null → "Apple 사용자" 폴백
      const name =
        credential.fullName?.givenName ??
        credential.fullName?.familyName ??
        "Apple 사용자";

      await signIn({
        id: credential.user,          // Apple 고유 ID (앱 재설치 전까지 고정)
        name,
        email: credential.email ?? undefined,
        profileImage: undefined,      // Apple은 프로필 이미지 미제공
        provider: "apple",
      });
      router.replace("/(tabs)");
    } catch (e: any) {
      // ERR_REQUEST_CANCELED: 사용자가 직접 닫은 경우 — 오류 메시지 불필요
      if (e.code !== "ERR_REQUEST_CANCELED") {
        Alert.alert("오류", "Apple 로그인에 실패했습니다.");
      }
    } finally {
      setLoading(false);
    }
  };

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

        {/* Google 로그인 — Android·iOS 공통 */}
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

        {/* Apple 로그인 — iOS 전용 (App Store 심사 규정 Guideline 4.8 필수) */}
        {appleAvailable && (
          <AppleAuthentication.AppleAuthenticationButton
            buttonType={AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN}
            buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.BLACK}
            cornerRadius={14}
            style={styles.appleBtn}
            onPress={handleAppleLogin}
          />
        )}
      </View>

      {/* 게스트 모드 — 로그인 없이 시작 */}
      <TouchableOpacity
        style={styles.guestBtn}
        onPress={async () => {
          await continueAsGuest();
          router.replace("/(tabs)");
        }}
        disabled={loading}
        activeOpacity={0.7}
      >
        <Text style={[styles.guestText, { color: colors.subtext }]}>
          로그인 없이 시작하기
        </Text>
      </TouchableOpacity>

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
  // Apple 버튼은 네이티브 컴포넌트라 내부 스타일 직접 제어 불가.
  // width/height만 지정하면 나머지는 Apple이 그림.
  appleBtn: {
    width: "100%",
    height: 54,
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
  guestBtn: {
    paddingVertical: 8,
    paddingHorizontal: 20,
  },
  guestText: {
    fontSize: 14,
    textDecorationLine: "underline",
  },
  notice: {
    fontSize: 11,
    textAlign: "center",
    lineHeight: 18,
  },
});
