/**
 * 소셜 기능 전역 상태 — Zustand + expo-secure-store
 *
 * 저장 전략:
 * - 인증 토큰(Bearer)과 사용자 정보를 SecureStore에 보관 → 앱 재시작 후에도 로그인 유지
 * - 친구 목록·피드는 인메모리에만 두고, 탭 진입 시마다 서버에서 최신 데이터를 로드
 *
 * 소셜 기능은 CLAUDE.md의 "로컬 우선" 원칙의 예외로,
 * 사용자가 명시적으로 공유를 선택한 일정만 서버로 전송한다.
 */

import * as SecureStore from "expo-secure-store";
import { create } from "zustand";

import {
  FriendItem,
  LikeResponse,
  SharedScheduleItem,
  TokenResponse,
  UserProfile,
  apiAcceptFriend,
  apiDeleteSharedSchedule,
  apiGetFeed,
  apiGetMe,
  apiListFriends,
  apiLogin,
  apiRegister,
  apiRejectFriend,
  apiSendFriendRequest,
  apiShareSchedule,
  apiToggleLike,
  ShareScheduleRequest,
} from "@/api/social";

const TOKEN_KEY = "haru_social_token";
const PROFILE_KEY = "haru_social_profile";

// ── 타입 ──────────────────────────────────────────────────────

interface SocialState {
  // 인증
  token: string | null;
  profile: UserProfile | null;
  authLoaded: boolean;   // SecureStore 조회 완료 여부

  // 친구
  friends: FriendItem[];
  friendsLoading: boolean;

  // 피드
  feed: SharedScheduleItem[];
  feedLoading: boolean;

  // 에러
  error: string | null;

  // ── 인증 액션 ──
  loadAuth: () => Promise<void>;
  register: (nickname: string, email: string, password: string) => Promise<void>;
  login: (email: string, password: string) => Promise<TokenResponse>;
  logout: () => Promise<void>;

  // ── 친구 액션 ──
  loadFriends: () => Promise<void>;
  sendFriendRequest: (email: string) => Promise<void>;
  acceptFriend: (friendshipId: number) => Promise<void>;
  rejectFriend: (friendshipId: number) => Promise<void>;

  // ── 피드 액션 ──
  loadFeed: (date?: string) => Promise<void>;
  shareSchedule: (data: ShareScheduleRequest) => Promise<number>;
  deleteSharedSchedule: (scheduleId: number) => Promise<void>;
  toggleLike: (scheduleId: number) => Promise<LikeResponse>;

  clearError: () => void;
}

// ── Store ──────────────────────────────────────────────────────

export const useSocialStore = create<SocialState>((set, get) => ({
  token: null,
  profile: null,
  authLoaded: false,
  friends: [],
  friendsLoading: false,
  feed: [],
  feedLoading: false,
  error: null,

  /** 앱 시작 시 1회 — SecureStore에서 이전 소셜 세션 복원 */
  loadAuth: async () => {
    try {
      const [storedToken, storedProfile] = await Promise.all([
        SecureStore.getItemAsync(TOKEN_KEY),
        SecureStore.getItemAsync(PROFILE_KEY),
      ]);
      if (storedToken && storedProfile) {
        set({
          token: storedToken,
          profile: JSON.parse(storedProfile) as UserProfile,
          authLoaded: true,
        });
      } else {
        set({ token: null, profile: null, authLoaded: true });
      }
    } catch {
      set({ token: null, profile: null, authLoaded: true });
    }
  },

  /** 회원가입 — 성공해도 자동 로그인은 하지 않음 (별도 login 호출 필요) */
  register: async (nickname, email, password) => {
    set({ error: null });
    await apiRegister(nickname, email, password);
  },

  /** 로그인 — 토큰과 프로필을 SecureStore에 저장 */
  login: async (email, password) => {
    set({ error: null });
    const result = await apiLogin(email, password);
    const profile = await apiGetMe(result.token);
    await Promise.all([
      SecureStore.setItemAsync(TOKEN_KEY, result.token),
      SecureStore.setItemAsync(PROFILE_KEY, JSON.stringify(profile)),
    ]);
    set({ token: result.token, profile });
    return result;
  },

  /** 로그아웃 — SecureStore에서 삭제하고 상태 초기화 */
  logout: async () => {
    await Promise.all([
      SecureStore.deleteItemAsync(TOKEN_KEY),
      SecureStore.deleteItemAsync(PROFILE_KEY),
    ]);
    set({ token: null, profile: null, friends: [], feed: [], error: null });
  },

  // ── 친구 ──────────────────────────────────────────────────────

  loadFriends: async () => {
    const { token } = get();
    if (!token) return;
    set({ friendsLoading: true, error: null });
    try {
      const friends = await apiListFriends(token);
      set({ friends, friendsLoading: false });
    } catch (e) {
      set({ error: (e as Error).message, friendsLoading: false });
    }
  },

  sendFriendRequest: async (email) => {
    const { token } = get();
    if (!token) return;
    set({ error: null });
    const newItem = await apiSendFriendRequest(email, token);
    // 낙관적 업데이트: 목록에 즉시 추가
    set((s) => ({ friends: [...s.friends, newItem] }));
  },

  acceptFriend: async (friendshipId) => {
    const { token } = get();
    if (!token) return;
    await apiAcceptFriend(friendshipId, token);
    // 해당 항목의 status를 accepted로 업데이트
    set((s) => ({
      friends: s.friends.map((f) =>
        f.friendship_id === friendshipId ? { ...f, status: "accepted" as const } : f,
      ),
    }));
  },

  rejectFriend: async (friendshipId) => {
    const { token } = get();
    if (!token) return;
    await apiRejectFriend(friendshipId, token);
    // 목록에서 제거
    set((s) => ({
      friends: s.friends.filter((f) => f.friendship_id !== friendshipId),
    }));
  },

  // ── 피드 ──────────────────────────────────────────────────────

  loadFeed: async (date) => {
    const { token } = get();
    if (!token) return;
    set({ feedLoading: true, error: null });
    try {
      const feed = await apiGetFeed(token, date);
      set({ feed, feedLoading: false });
    } catch (e) {
      set({ error: (e as Error).message, feedLoading: false });
    }
  },

  shareSchedule: async (data) => {
    const { token } = get();
    if (!token) throw new Error("로그인이 필요합니다.");
    const result = await apiShareSchedule(data, token);
    return result.id;
  },

  deleteSharedSchedule: async (scheduleId) => {
    const { token } = get();
    if (!token) return;
    await apiDeleteSharedSchedule(scheduleId, token);
    set((s) => ({ feed: s.feed.filter((item) => item.id !== scheduleId) }));
  },

  toggleLike: async (scheduleId) => {
    const { token } = get();
    if (!token) throw new Error("로그인이 필요합니다.");
    const result = await apiToggleLike(scheduleId, token);
    // 피드에서 해당 항목의 좋아요 수·상태 즉시 반영
    set((s) => ({
      feed: s.feed.map((item) =>
        item.id === scheduleId
          ? { ...item, like_count: result.like_count, liked_by_me: result.liked_by_me }
          : item,
      ),
    }));
    return result;
  },

  clearError: () => set({ error: null }),
}));
