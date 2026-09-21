/**
 * 하루 앱 탭 레이아웃
 * 5개 탭: 홈 · 일정+가계부 · 날씨 · 운세 · 뉴스
 *
 * - budget 탭은 schedule에 통합되어 별도 탭 아이콘을 숨긴다 (href: null)
 * - more 탭도 숨긴다 (뉴스 탭으로 대체)
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
        name="weather"
        options={{
          title: "날씨",
          tabBarIcon: ({ color }) => (
            <IconSymbol size={24} name="cloud.sun.fill" color={color} />
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
      {/* 가계부는 일정 탭에 통합 — 독립 탭에서는 숨긴다 */}
      <Tabs.Screen
        name="budget"
        options={{ href: null }}
      />
      {/* 더보기 탭은 뉴스 탭으로 대체 — 접근 경로 비활성화 */}
      <Tabs.Screen
        name="more"
        options={{ href: null }}
      />
    </Tabs>
  );
}
