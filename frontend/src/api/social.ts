/**
 * 소셜 기능 API 클라이언트
 *
 * 백엔드 /api/social 엔드포인트를 호출한다.
 * 토큰은 SecureStore에서 로드해 Authorization 헤더로 전달한다.
 *
 * CLAUDE.md 보안 규칙:
 *   - 사용자 인증 정보는 백엔드에서 검증, 앱은 토큰만 보관
 *   - 공유 일정은 사용자가 명시적으로 공유 버튼을 누를 때만 서버에 전송
 */

const API_BASE = "https://haru-api.duckdns.org";

// ── 타입 정의 ────────────────────────────────────────────────────

export interface UserProfile {
  id: number;
  nickname: string;
  email: string;
}

export interface TokenResponse {
  token: string;
  user_id: number;
  nickname: string;
}

export interface FriendItem {
  friendship_id: number;
  user_id: number;
  nickname: string;
  email: string;
  status: "pending" | "accepted";
  direction: "sent" | "received";
}

export interface SharedScheduleItem {
  id: number;
  user_id: number;
  nickname: string;
  local_id: number;
  title: string;
  date: string;
  time: string;
  note: string;
  color: string;
  shared_at: string;
  like_count: number;
  liked_by_me: boolean;
}

export interface LikeResponse {
  schedule_id: number;
  like_count: number;
  liked_by_me: boolean;
}

export interface ShareScheduleRequest {
  local_id: number;
  title: string;
  date: string;
  time: string;
  note: string;
  color: string;
}

// ── 공통 fetch 래퍼 ──────────────────────────────────────────────

async function apiFetch<T>(
  path: string,
  options: RequestInit = {},
  token?: string,
): Promise<T> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string>),
  };
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const res = await fetch(`${API_BASE}${path}`, { ...options, headers });

  if (!res.ok) {
    let detail = `HTTP ${res.status}`;
    try {
      const err = (await res.json()) as { detail?: string };
      if (err.detail) detail = err.detail;
    } catch { /* 파싱 실패 무시 */ }
    throw new Error(detail);
  }

  // 204 No Content
  if (res.status === 204) return undefined as unknown as T;
  return res.json() as Promise<T>;
}

// ── 인증 ─────────────────────────────────────────────────────────

export async function apiRegister(
  nickname: string,
  email: string,
  password: string,
): Promise<UserProfile> {
  return apiFetch<UserProfile>("/api/social/register", {
    method: "POST",
    body: JSON.stringify({ nickname, email, password }),
  });
}

export async function apiLogin(
  email: string,
  password: string,
): Promise<TokenResponse> {
  return apiFetch<TokenResponse>("/api/social/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
}

export async function apiGetMe(token: string): Promise<UserProfile> {
  return apiFetch<UserProfile>("/api/social/me", {}, token);
}

// ── 친구 ─────────────────────────────────────────────────────────

export async function apiSendFriendRequest(
  email: string,
  token: string,
): Promise<FriendItem> {
  return apiFetch<FriendItem>("/api/social/friends/request", {
    method: "POST",
    body: JSON.stringify({ email }),
  }, token);
}

export async function apiListFriends(token: string): Promise<FriendItem[]> {
  return apiFetch<FriendItem[]>("/api/social/friends", {}, token);
}

export async function apiAcceptFriend(
  friendshipId: number,
  token: string,
): Promise<void> {
  return apiFetch<void>(`/api/social/friends/${friendshipId}/accept`, {
    method: "PUT",
  }, token);
}

export async function apiRejectFriend(
  friendshipId: number,
  token: string,
): Promise<void> {
  return apiFetch<void>(`/api/social/friends/${friendshipId}/reject`, {
    method: "PUT",
  }, token);
}

// ── 공유 일정 ─────────────────────────────────────────────────────

export async function apiShareSchedule(
  data: ShareScheduleRequest,
  token: string,
): Promise<{ id: number }> {
  return apiFetch<{ id: number }>("/api/social/schedules/share", {
    method: "POST",
    body: JSON.stringify(data),
  }, token);
}

export async function apiDeleteSharedSchedule(
  scheduleId: number,
  token: string,
): Promise<void> {
  return apiFetch<void>(`/api/social/schedules/${scheduleId}`, {
    method: "DELETE",
  }, token);
}

export async function apiGetFeed(
  token: string,
  date?: string,
): Promise<SharedScheduleItem[]> {
  const params = date ? `?date=${date}` : "";
  return apiFetch<SharedScheduleItem[]>(`/api/social/feed${params}`, {}, token);
}

export async function apiToggleLike(
  scheduleId: number,
  token: string,
): Promise<LikeResponse> {
  return apiFetch<LikeResponse>(`/api/social/schedules/${scheduleId}/like`, {
    method: "POST",
  }, token);
}
