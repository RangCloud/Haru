/**
 * 하루 앱 탭 레이아웃
 * 4개 탭: 홈 · 일정+가계부 · 운세 · 뉴스
 *
 * - 날씨는 홈 탭 헤더 우상단 위젯으로 이전 (weatherStore.ts)
 * - budget 탭은 schedule에 통합 — href: null 으로 숨긴다
 * - more 탭은 뉴스 탭으로 대체 — href: null 으로 숨긴다
 * - weather 탭도 숨긴다 (홈 위젯으로 대체)
 */

import { Tabs } from "expo-router";
import React from "react";

import { HapticTab } from "@/components/haptic-tab";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { Colors } from "@/constants/theme";
import { useColorScheme } from "@/hooks/use-color-scheme";

export default function TabLayout() {
  const scheme = useColorScheme();
  const colors = Colors[scheme];

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
          height: 60,
          paddingBottom: 8,
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
      {/* 아래 탭들은 독립 탭으로 노출하지 않음 */}
      <Tabs.Screen name="budget" options={{ href: null }} />
      <Tabs.Screen name="more" options={{ href: null }} />
      <Tabs.Screen name="weather" options={{ href: null }} />
    </Tabs>
  );
}
