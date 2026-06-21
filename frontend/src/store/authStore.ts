/**
 * 인증 전역 상태 — Zustand + expo-secure-store
 *
 * 세션 유지 전략:
 * - 로그인 성공 시 User 정보를 SecureStore(기기 보안 저장소)에 저장
 * - 앱 재시작 시 loadSession()으로 저장된 세션을 복원
 * - 로그아웃 시 SecureStore에서 삭제 + user를 null로 초기화
 *
 * 현재 앱 데이터(가계부·일정)는 로컬 SQLite에 있으므로
 * 로그인은 개인화(이름·프로필 표시) 용도로만 사용된다.
 */

import * as SecureStore from "expo-secure-store";
import { create } from "zustand";

const SESSION_KEY = "haru_user_session";

// ── 타입 ──────────────────────────────────────────────────────

export interface User {
  id: string;
  name: string;
  email?: string;
  profileImage?: string;
  provider: "google" | "kakao" | "naver";
}

interface AuthState {
  user: User | null;
  isLoaded: boolean;   // SecureStore 조회 완료 여부 (false 동안은 스플래시 유지)

  loadSession: () => Promise<void>;
  signIn: (user: User) => Promise<void>;
  signOut: () => Promise<void>;
}

// ── Store ──────────────────────────────────────────────────────

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  isLoaded: false,

  /** 앱 시작 시 1회 호출 — SecureStore에서 이전 세션 복원 */
  loadSession: async () => {
    try {
      const stored = await SecureStore.getItemAsync(SESSION_KEY);
      if (stored) {
        set({ user: JSON.parse(stored) as User, isLoaded: true });
      } else {
        set({ user: null, isLoaded: true });
      }
    } catch {
      // 저장소 읽기 실패 시 비로그인 상태로 처리
      set({ user: null, isLoaded: true });
    }
  },

  /** 로그인 성공 시 호출 — 세션을 SecureStore에 저장하고 상태 업데이트 */
  signIn: async (user) => {
    await SecureStore.setItemAsync(SESSION_KEY, JSON.stringify(user));
    set({ user });
  },

  /** 로그아웃 — SecureStore에서 삭제하고 상태 초기화 */
  signOut: async () => {
    await SecureStore.deleteItemAsync(SESSION_KEY);
    set({ user: null });
  },
}));
