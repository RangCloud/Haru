/**
 * 하루 앱 탭 레이아웃
 *
 * 5개 탭: 홈 · 날씨 · 가계부 · 일정 · 더보기(뉴스/운세)
 * DAY 2에서 뉴스·운세 화면이 추가되면 "더보기" 탭 내부를 채운다.
 */

import { Tabs } from "expo-router";
import React from "react";

import { HapticTab } from "@/components/haptic-tab";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { Colors } from "@/constants/theme";
import { useColorScheme } from "@/hooks/use-color-scheme";

export default function TabLayout() {
  const colorScheme = useColorScheme();
  const tint = Colors[colorScheme ?? "light"].tint;

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: tint,
        headerShown: false,
        tabBarButton: HapticTab,
      }}
    >
      {/* 홈 — 오늘의 요약 (날씨·일정·가계부 한눈에 보기) */}
      <Tabs.Screen
        name="index"
        options={{
          title: "홈",
          tabBarIcon: ({ color }) => (
            <IconSymbol size={26} name="house.fill" color={color} />
          ),
        }}
      />

      {/* 날씨 — 기상청 단기예보 (DAY 1 완성) */}
      <Tabs.Screen
        name="weather"
        options={{
          title: "날씨",
          tabBarIcon: ({ color }) => (
            <IconSymbol size={26} name="cloud.sun.fill" color={color} />
          ),
        }}
      />

      {/* 가계부 — 로컬 SQLite (DAY 3 예정) */}
      <Tabs.Screen
        name="budget"
        options={{
          title: "가계부",
          tabBarIcon: ({ color }) => (
            <IconSymbol size={26} name="wonsign.circle.fill" color={color} />
          ),
        }}
      />

      {/* 일정 — 로컬 SQLite + 달력 (DAY 4 예정) */}
      <Tabs.Screen
        name="schedule"
        options={{
          title: "일정",
          tabBarIcon: ({ color }) => (
            <IconSymbol size={26} name="calendar" color={color} />
          ),
        }}
      />

      {/* 더보기 — 오늘의 뉴스 · 운세 (DAY 2 예정) */}
      <Tabs.Screen
        name="more"
        options={{
          title: "더보기",
          tabBarIcon: ({ color }) => (
            <IconSymbol size={26} name="ellipsis.circle.fill" color={color} />
          ),
        }}
      />
    </Tabs>
  );
}
