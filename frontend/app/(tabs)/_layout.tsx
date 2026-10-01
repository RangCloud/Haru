/**
 * 하루 앱 탭 레이아웃
 * 5개 탭: 홈 · 일정 · 가계부 · 운세 · 뉴스 (친구 탭은 v1.1까지 숨김)
 *
 * - 날씨는 홈 탭 헤더 우상단 위젯으로 이전 (weatherStore.ts)
 * - more·weather 탭은 숨긴다 (뉴스 탭·홈 위젯으로 대체)
 */

import { Tabs } from "expo-router";
import React from "react";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { HapticTab } from "@/components/haptic-tab";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { Colors } from "@/constants/theme";
import { useColorScheme } from "@/hooks/use-color-scheme";

export default function TabLayout() {
  const scheme = useColorScheme();
  const colors = Colors[scheme];
  // 탭 바 높이를 고정값으로 주면 iPhone 하단 홈 막대 영역이 계산에서 빠져 탭이 가려진다.
  // 기기별 하단 안전 영역(insets.bottom)만큼 높이와 아래 여백을 더한다.
  const insets = useSafeAreaInsets();

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: colors.tabIconSelected,
        tabBarInactiveTintColor: colors.tabIconDefault,
        headerShown: false,
        tabBarButton: HapticTab,
        tabBarStyle: {
          backgroundColor: colors.tabBar,
          borderTopWidth: 1,
          borderTopColor: colors.separator,
          height: 60 + insets.bottom,
          paddingBottom: 8 + insets.bottom,
          paddingTop: 4,
        },
        tabBarLabelStyle: {
          fontSize: 10,
          fontWeight: "500",
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "홈",
          tabBarIcon: ({ color }) => (
            <IconSymbol size={24} name="house.fill" color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="schedule"
        options={{
          title: "일정",
          tabBarIcon: ({ color }) => (
            <IconSymbol size={24} name="calendar" color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="budget"
        options={{
          title: "가계부",
          tabBarIcon: ({ color }) => (
            <IconSymbol size={24} name="wonsign.circle.fill" color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="fortune"
        options={{
          title: "운세",
          tabBarIcon: ({ color }) => (
            <IconSymbol size={24} name="sparkles" color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="news"
        options={{
          title: "뉴스",
          tabBarIcon: ({ color }) => (
            <IconSymbol size={24} name="newspaper.fill" color={color} />
          ),
        }}
      />
      {/* 친구 탭 — v1.1에서 로그인 연동 후 재활성화 예정 */}
      <Tabs.Screen
        name="social"
        options={{
          href: null,
          title: "친구",
          tabBarIcon: ({ color }) => (
            <IconSymbol size={24} name="person.2.fill" color={color} />
          ),
        }}
      />
      {/* 아래 탭들은 독립 탭으로 노출하지 않음 */}
      <Tabs.Screen name="more" options={{ href: null }} />
      <Tabs.Screen name="weather" options={{ href: null }} />
    </Tabs>
  );
}
