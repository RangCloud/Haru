/**
 * 소셜 탭 — 친구 관리 + 피드 + 좋아요
 *
 * 화면 구성:
 *   [비로그인] → 회원가입/로그인 폼
 *   [로그인]   → 상단: 내 프로필 + 친구 목록(수락/거절 포함)
 *               하단: 친구들의 공유 일정 피드 + 좋아요 버튼
 *
 * 소셜 기능은 사용자가 명시적으로 공유한 일정만 서버로 전송한다.
 */

import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import { IconSymbol } from "@/components/ui/icon-symbol";
import { Colors } from "@/constants/theme";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { FriendItem, SharedScheduleItem } from "@/src/api/social";
import { useSocialStore } from "@/src/store/socialStore";

export default function SocialScreen() {
  const scheme = useColorScheme();
  const colors = Colors[scheme];
  const s = styles(colors);

  const {
    token, profile, authLoaded,
    friends, friendsLoading,
    feed, feedLoading,
    error,
    loadAuth, login, register, logout,
    loadFriends, sendFriendRequest, acceptFriend, rejectFriend,
    loadFeed, toggleLike,
    clearError,
  } = useSocialStore();

  // 앱 시작 시 저장된 토큰 복원
  useEffect(() => { loadAuth(); }, []);

  // 로그인 후 친구·피드 로드
  useEffect(() => {
    if (token) {
      loadFriends();
      loadFeed();
    }
  }, [token]);

  // 에러 알림
  useEffect(() => {
    if (error) {
      Alert.alert("오류", error, [{ text: "확인", onPress: clearError }]);
    }
  }, [error]);

  // 친구 추가 모달
  const [friendModalVisible, setFriendModalVisible] = useState(false);
  const [friendEmail, setFriendEmail] = useState("");
  const [friendLoading, setFriendLoading] = useState(false);

  const handleSendFriendRequest = async () => {
    if (!friendEmail.trim()) return;
    setFriendLoading(true);
    try {
      await sendFriendRequest(friendEmail.trim());
      setFriendEmail("");
      setFriendModalVisible(false);
      Alert.alert("완료", "친구 요청을 보냈습니다.");
    } catch (e) {
      Alert.alert("오류", (e as Error).message);
    } finally {
      setFriendLoading(false);
    }
  };

  const onRefresh = useCallback(() => {
    loadFriends();
    loadFeed();
  }, [token]);

  if (!authLoaded) {
    return (
      <View style={[s.center, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.tint} />
      </View>
    );
  }

  if (!token) {
    return <AuthView colors={colors} s={s} onLogin={login} onRegister={register} />;
  }

  // ── 로그인 상태 화면 ───────────────────────────────────────────

  // 받은 친구 요청(pending + received)
  const pendingRequests = friends.filter(
    (f) => f.status === "pending" && f.direction === "received",
  );
  // 친구 목록(accepted)
  const acceptedFriends = friends.filter((f) => f.status === "accepted");

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      {/* 헤더 */}
      <View style={s.header}>
        <Text style={s.headerTitle}>소셜</Text>
        <View style={{ flexDirection: "row", gap: 8 }}>
          <Pressable style={s.headerBtn} onPress={() => setFriendModalVisible(true)}>
            <IconSymbol name="person.badge.plus" size={20} color={colors.tint} />
          </Pressable>
          <Pressable style={s.headerBtn} onPress={logout}>
            <IconSymbol name="rectangle.portrait.and.arrow.right" size={20} color={colors.subtext} />
          </Pressable>
        </View>
      </View>

      <ScrollView
        refreshControl={<RefreshControl refreshing={feedLoading || friendsLoading} onRefresh={onRefresh} />}
        contentContainerStyle={{ paddingBottom: 32 }}
      >
        {/* 내 프로필 */}
        <View style={s.profileCard}>
          <View style={s.avatar}>
            <Text style={s.avatarText}>{profile?.nickname?.[0] ?? "?"}</Text>
          </View>
          <View>
            <Text style={s.profileName}>{profile?.nickname}</Text>
            <Text style={s.profileEmail}>{profile?.email}</Text>
          </View>
        </View>

        {/* 받은 친구 요청 */}
        {pendingRequests.length > 0 && (
          <View style={s.section}>
            <Text style={s.sectionTitle}>받은 친구 요청 ({pendingRequests.length})</Text>
            {pendingRequests.map((item) => (
              <PendingRequestRow
                key={item.friendship_id}
                item={item}
                colors={colors}
                s={s}
                onAccept={() => acceptFriend(item.friendship_id)}
                onReject={() => rejectFriend(item.friendship_id)}
              />
            ))}
          </View>
        )}

        {/* 친구 목록 */}
        <View style={s.section}>
          <Text style={s.sectionTitle}>친구 {acceptedFriends.length}명</Text>
          {acceptedFriends.length === 0 ? (
            <Text style={s.emptyText}>아직 친구가 없습니다. 친구 추가 버튼으로 초대해보세요!</Text>
          ) : (
            acceptedFriends.map((item) => (
              <FriendRow key={item.friendship_id} item={item} colors={colors} s={s} />
            ))
          )}
        </View>

        {/* 피드 */}
        <View style={s.section}>
          <Text style={s.sectionTitle}>친구들의 일정</Text>
          {feedLoading && feed.length === 0 ? (
            <ActivityIndicator color={colors.tint} style={{ marginTop: 16 }} />
          ) : feed.length === 0 ? (
            <Text style={s.emptyText}>친구들의 공유 일정이 없습니다.</Text>
          ) : (
            feed.map((item) => (
              <FeedCard
                key={item.id}
                item={item}
                colors={colors}
                s={s}
                onLike={() => toggleLike(item.id)}
              />
            ))
          )}
        </View>
      </ScrollView>

      {/* 친구 추가 모달 */}
      <Modal visible={friendModalVisible} transparent animationType="fade">
        <Pressable style={s.overlay} onPress={() => setFriendModalVisible(false)}>
          <Pressable style={s.modal}>
            <Text style={s.modalTitle}>친구 추가</Text>
            <Text style={s.modalSub}>친구의 이메일 주소를 입력하세요</Text>
            <TextInput
              style={s.input}
              placeholder="이메일"
              placeholderTextColor={colors.subtext}
              keyboardType="email-address"
              autoCapitalize="none"
              value={friendEmail}
              onChangeText={setFriendEmail}
            />
            <View style={{ flexDirection: "row", gap: 8, marginTop: 4 }}>
              <Pressable
                style={[s.btn, s.btnGhost, { flex: 1 }]}
                onPress={() => setFriendModalVisible(false)}
              >
                <Text style={s.btnGhostText}>취소</Text>
              </Pressable>
              <Pressable
                style={[s.btn, s.btnPrimary, { flex: 1 }]}
                onPress={handleSendFriendRequest}
                disabled={friendLoading}
              >
                {friendLoading
                  ? <ActivityIndicator color="#fff" size="small" />
                  : <Text style={s.btnPrimaryText}>요청 보내기</Text>
                }
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

// ── 서브 컴포넌트 ────────────────────────────────────────────────

/** 비로그인 상태: 회원가입/로그인 탭 */
function AuthView({
  colors,
  s,
  onLogin,
  onRegister,
}: {
  colors: (typeof Colors)["light"];
  s: ReturnType<typeof styles>;
  onLogin: (email: string, password: string) => Promise<unknown>;
  onRegister: (nickname: string, email: string, password: string) => Promise<void>;
}) {
  const [tab, setTab] = useState<"login" | "register">("login");
  const [nickname, setNickname] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const handle = async () => {
    setLoading(true);
    try {
      if (tab === "login") {
        await onLogin(email, password);
      } else {
        await onRegister(nickname, email, password);
        // 회원가입 성공 후 자동 로그인
        await onLogin(email, password);
      }
    } catch (e) {
      Alert.alert("오류", (e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: colors.background }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView contentContainerStyle={s.authContainer}>
        <View style={s.authCard}>
          {/* 탭 전환 */}
          <View style={s.authTabs}>
            {(["login", "register"] as const).map((t) => (
              <Pressable key={t} style={[s.authTab, tab === t && s.authTabActive]} onPress={() => setTab(t)}>
                <Text style={[s.authTabText, tab === t && s.authTabTextActive]}>
                  {t === "login" ? "로그인" : "회원가입"}
                </Text>
              </Pressable>
            ))}
          </View>

          {tab === "register" && (
            <TextInput
              style={s.input}
              placeholder="닉네임 (2-20자)"
              placeholderTextColor={colors.subtext}
              value={nickname}
              onChangeText={setNickname}
            />
          )}
          <TextInput
            style={s.input}
            placeholder="이메일"
            placeholderTextColor={colors.subtext}
            keyboardType="email-address"
            autoCapitalize="none"
            value={email}
            onChangeText={setEmail}
          />
          <TextInput
            style={s.input}
            placeholder="비밀번호 (6자 이상)"
            placeholderTextColor={colors.subtext}
            secureTextEntry
            value={password}
            onChangeText={setPassword}
          />

          <Pressable style={[s.btn, s.btnPrimary, { marginTop: 8 }]} onPress={handle} disabled={loading}>
            {loading
              ? <ActivityIndicator color="#fff" />
              : <Text style={s.btnPrimaryText}>{tab === "login" ? "로그인" : "가입하기"}</Text>
            }
          </Pressable>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

/** 친구 요청 수락/거절 행 */
function PendingRequestRow({
  item, colors, s, onAccept, onReject,
}: {
  item: FriendItem;
  colors: (typeof Colors)["light"];
  s: ReturnType<typeof styles>;
  onAccept: () => void;
  onReject: () => void;
}) {
  return (
    <View style={s.friendRow}>
      <View style={s.avatarSmall}>
        <Text style={s.avatarSmallText}>{item.nickname[0]}</Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text style={s.friendName}>{item.nickname}</Text>
        <Text style={s.friendEmail}>{item.email}</Text>
      </View>
      <Pressable style={[s.smallBtn, { backgroundColor: colors.tint }]} onPress={onAccept}>
        <Text style={s.smallBtnText}>수락</Text>
      </Pressable>
      <Pressable style={[s.smallBtn, { backgroundColor: colors.separator, marginLeft: 4 }]} onPress={onReject}>
        <Text style={[s.smallBtnText, { color: colors.subtext }]}>거절</Text>
      </Pressable>
    </View>
  );
}

/** 수락된 친구 행 */
function FriendRow({ item, colors, s }: {
  item: FriendItem;
  colors: (typeof Colors)["light"];
  s: ReturnType<typeof styles>;
}) {
  return (
    <View style={s.friendRow}>
      <View style={s.avatarSmall}>
        <Text style={s.avatarSmallText}>{item.nickname[0]}</Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text style={s.friendName}>{item.nickname}</Text>
        <Text style={s.friendEmail}>{item.email}</Text>
      </View>
      {item.status === "pending" && item.direction === "sent" && (
        <View style={[s.smallBtn, { backgroundColor: colors.tintLight }]}>
          <Text style={[s.smallBtnText, { color: colors.tint }]}>요청 중</Text>
        </View>
      )}
    </View>
  );
}

/** 친구 공유 일정 피드 카드 */
function FeedCard({
  item, colors, s, onLike,
}: {
  item: SharedScheduleItem;
  colors: (typeof Colors)["light"];
  s: ReturnType<typeof styles>;
  onLike: () => void;
}) {
  const dot = item.color || colors.tint;
  return (
    <View style={s.feedCard}>
      <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 8 }}>
        <View style={[s.avatarSmall, { backgroundColor: colors.tintLight }]}>
          <Text style={[s.avatarSmallText, { color: colors.tint }]}>{item.nickname[0]}</Text>
        </View>
        <Text style={s.feedNickname}>{item.nickname}</Text>
        <Text style={s.feedDate}>{item.date}</Text>
      </View>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        <View style={[s.colorDot, { backgroundColor: dot }]} />
        <View style={{ flex: 1 }}>
          <Text style={s.feedTitle}>{item.title}</Text>
          {!!item.time && <Text style={s.feedTime}>{item.time}</Text>}
          {!!item.note && <Text style={s.feedNote}>{item.note}</Text>}
        </View>
      </View>
      {/* 좋아요 버튼 */}
      <Pressable style={s.likeRow} onPress={onLike}>
        <IconSymbol
          name={item.liked_by_me ? "heart.fill" : "heart"}
          size={18}
          color={item.liked_by_me ? "#E84343" : colors.subtext}
        />
        <Text style={[s.likeCount, item.liked_by_me && { color: "#E84343" }]}>
          {item.like_count}
        </Text>
      </Pressable>
    </View>
  );
}

// ── 스타일 ────────────────────────────────────────────────────────

const styles = (c: (typeof Colors)["light"]) =>
  StyleSheet.create({
    center: { flex: 1, justifyContent: "center", alignItems: "center" },

    // 헤더
    header: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      paddingHorizontal: 20,
      paddingTop: 60,
      paddingBottom: 12,
      backgroundColor: c.card,
      borderBottomWidth: 1,
      borderBottomColor: c.separator,
    },
    headerTitle: { fontSize: 20, fontWeight: "700", color: c.text },
    headerBtn: {
      width: 36, height: 36, borderRadius: 18,
      backgroundColor: c.tintLight,
      alignItems: "center", justifyContent: "center",
    },

    // 프로필 카드
    profileCard: {
      flexDirection: "row", alignItems: "center", gap: 12,
      margin: 16, padding: 16,
      backgroundColor: c.card, borderRadius: 16,
      borderWidth: 1, borderColor: c.cardBorder,
    },
    avatar: {
      width: 48, height: 48, borderRadius: 24,
      backgroundColor: c.tint, alignItems: "center", justifyContent: "center",
    },
    avatarText: { fontSize: 20, fontWeight: "700", color: "#fff" },
    profileName: { fontSize: 16, fontWeight: "700", color: c.text },
    profileEmail: { fontSize: 12, color: c.subtext, marginTop: 2 },

    // 섹션
    section: { marginHorizontal: 16, marginBottom: 20 },
    sectionTitle: { fontSize: 14, fontWeight: "600", color: c.subtext, marginBottom: 8 },
    emptyText: { fontSize: 13, color: c.subtext, textAlign: "center", paddingVertical: 16 },

    // 친구 행
    friendRow: {
      flexDirection: "row", alignItems: "center",
      paddingVertical: 10, gap: 10,
      borderBottomWidth: 1, borderBottomColor: c.separator,
    },
    avatarSmall: {
      width: 36, height: 36, borderRadius: 18,
      backgroundColor: c.tintLight, alignItems: "center", justifyContent: "center",
    },
    avatarSmallText: { fontSize: 14, fontWeight: "700", color: c.tint },
    friendName: { fontSize: 14, fontWeight: "600", color: c.text },
    friendEmail: { fontSize: 12, color: c.subtext },
    smallBtn: {
      paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8,
    },
    smallBtnText: { fontSize: 12, fontWeight: "600", color: "#fff" },

    // 피드 카드
    feedCard: {
      backgroundColor: c.card, borderRadius: 16,
      borderWidth: 1, borderColor: c.cardBorder,
      padding: 14, marginBottom: 12,
    },
    feedNickname: { fontSize: 13, fontWeight: "600", color: c.text, marginLeft: 8, flex: 1 },
    feedDate: { fontSize: 11, color: c.subtext },
    colorDot: { width: 10, height: 10, borderRadius: 5, marginTop: 2 },
    feedTitle: { fontSize: 15, fontWeight: "600", color: c.text },
    feedTime: { fontSize: 12, color: c.subtext, marginTop: 2 },
    feedNote: { fontSize: 13, color: c.subtext, marginTop: 4 },
    likeRow: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 10, alignSelf: "flex-end" },
    likeCount: { fontSize: 13, color: c.subtext, fontWeight: "600" },

    // 인증 화면
    authContainer: { flexGrow: 1, justifyContent: "center", padding: 24 },
    authCard: {
      backgroundColor: c.card, borderRadius: 20,
      padding: 24, borderWidth: 1, borderColor: c.cardBorder,
    },
    authTabs: { flexDirection: "row", marginBottom: 20, borderRadius: 10, overflow: "hidden", backgroundColor: c.tintLight },
    authTab: { flex: 1, paddingVertical: 10, alignItems: "center" },
    authTabActive: { backgroundColor: c.tint },
    authTabText: { fontSize: 14, fontWeight: "600", color: c.subtext },
    authTabTextActive: { color: "#fff" },

    // 공통 인풋
    input: {
      backgroundColor: c.background, borderRadius: 12,
      paddingHorizontal: 14, paddingVertical: 12,
      fontSize: 15, color: c.text,
      borderWidth: 1, borderColor: c.cardBorder,
      marginBottom: 12,
    },

    // 버튼
    btn: { borderRadius: 12, paddingVertical: 14, alignItems: "center", justifyContent: "center" },
    btnPrimary: { backgroundColor: c.tint },
    btnPrimaryText: { color: "#fff", fontSize: 15, fontWeight: "700" },
    btnGhost: { backgroundColor: c.tintLight },
    btnGhostText: { color: c.tint, fontSize: 15, fontWeight: "600" },

    // 모달
    overlay: {
      flex: 1, backgroundColor: "rgba(0,0,0,0.4)",
      justifyContent: "center", padding: 24,
    },
    modal: {
      backgroundColor: c.card, borderRadius: 20,
      padding: 24, borderWidth: 1, borderColor: c.cardBorder,
    },
    modalTitle: { fontSize: 18, fontWeight: "700", color: c.text, marginBottom: 6 },
    modalSub: { fontSize: 13, color: c.subtext, marginBottom: 16 },
  });
