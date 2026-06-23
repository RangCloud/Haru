/**
 * 소셜 로그인 API — 카카오 · 네이버
 *
 * Google은 expo-auth-session의 훅 기반 API라 login.tsx에서 직접 처리한다.
 * 카카오·네이버는 명령형(imperative) API라 여기서 함수로 분리한다.
 *
 * 네이티브 모듈이므로 Expo Go가 아닌 개발 빌드(expo run:android/ios)에서만 동작한다.
 */

import { me, login as kakaoLogin } from "@react-native-kakao/user";
import NaverLogin from "@react-native-seoul/naver-login";

import { type User } from "@/src/store/authStore";

// ── 카카오 로그인 ──────────────────────────────────────────────

export async function signInWithKakao(): Promise<User> {
  // 카카오 계정으로 로그인 → 액세스 토큰 발급
  await kakaoLogin();

  // 프로필 조회 — @react-native-kakao/user 의 me() 사용 (getProfile 없음)
  const profile = await me();

  return {
    id: String(profile.id),
    name: profile.nickname ?? "카카오 사용자",
    profileImage: profile.profileImageUrl ?? undefined,
    provider: "kakao",
  };
}

// ── 네이버 로그인 ──────────────────────────────────────────────

/**
 * 네이버 로그인
 *
 * @react-native-seoul/naver-login API:
 *   1. initialize(params) — consumerKey 등을 먼저 등록
 *   2. login()            — 인자 없음, 등록된 설정으로 로그인
 *   3. getProfile(token)  — 액세스 토큰으로 프로필 조회
 *
 * consumerKey / consumerSecret은 네이버 개발자 콘솔에서 발급.
 * EXPO_PUBLIC_ 접두사를 붙이면 앱 번들에 포함됨(모바일 OAuth에서는 불가피).
 * 중요한 시크릿이므로 frontend/.env.local에만 보관하고 git에 포함하지 않는다.
 */
export async function signInWithNaver(): Promise<User> {
  // 로그인 전 SDK 초기화 — 매 호출마다 해도 무방
  NaverLogin.initialize({
    appName: "하루",
    consumerKey: process.env.EXPO_PUBLIC_NAVER_CLIENT_ID ?? "",
    consumerSecret: process.env.EXPO_PUBLIC_NAVER_CLIENT_SECRET ?? "",
    serviceUrlSchemeIOS: "haru",  // iOS: app.json scheme과 동일해야 함
  });

  // login() 에는 인자를 전달하지 않음
  const result = await NaverLogin.login();

  if (!result.isSuccess || !result.successResponse) {
    throw new Error(result.failureResponse?.message ?? "네이버 로그인에 실패했습니다.");
  }

  // 프로필 조회 (이름, 이메일, 프로필 이미지)
  const { response: profile } = await NaverLogin.getProfile(
    result.successResponse.accessToken,
  );

  return {
    id: profile.id,
    name: profile.name ?? "네이버 사용자",
    email: profile.email ?? undefined,
    profileImage: profile.profile_image ?? undefined,
    provider: "naver",
  };
}
