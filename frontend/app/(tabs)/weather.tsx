/**
 * 날씨 화면
 *
 * 기기 위치를 가져와 백엔드 /api/weather를 호출하고
 * 현재 날씨 + 12시간 예보를 표시한다.
 *
 * 위치 권한 흐름:
 *  1. 화면 진입 시 expo-location으로 현재 좌표 요청
 *  2. 좌표를 백엔드로 전달 → 기상청 격자 변환 후 예보 반환
 *  3. 권한 거부 시 안내 메시지 표시
 */

import * as Location from "expo-location";
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { Colors } from "@/constants/theme";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { fetchWeather, HourlyWeather, WeatherData } from "@/src/api/weather";

// ── 날씨 상태 아이콘 매핑 ─────────────────────────────────────
// expo-location은 별도 패키지이므로 아이콘은 텍스트 이모지로 간단히 처리
const SKY_ICON: Record<string, string> = {
  맑음: "☀️",
  구름많음: "⛅",
  흐림: "☁️",
};

const RAIN_ICON: Record<string, string> = {
  없음: "",
  비: "🌧️",
  "비/눈": "🌨️",
  눈: "❄️",
  소나기: "⛈️",
};

function getWeatherIcon(sky: string, rainType: string): string {
  // 강수가 있으면 강수 아이콘을 우선 표시
  if (rainType !== "없음") return RAIN_ICON[rainType] ?? "🌧️";
  return SKY_ICON[sky] ?? "🌤️";
}

// ── 서브 컴포넌트 ─────────────────────────────────────────────

interface CurrentCardProps {
  data: HourlyWeather;
  colors: (typeof Colors)["light"];
}

function CurrentCard({ data, colors }: CurrentCardProps) {
  return (
    <View style={[styles.currentCard, { backgroundColor: colors.tint + "18" }]}>
      <Text style={styles.currentIcon}>
        {getWeatherIcon(data.sky, data.rain_type)}
      </Text>
      <Text style={[styles.currentTemp, { color: colors.text }]}>
        {data.temp}°C
      </Text>
      <Text style={[styles.currentSky, { color: colors.icon }]}>
        {data.sky}
        {data.rain_type !== "없음" ? ` · ${data.rain_type}` : ""}
      </Text>
      <View style={styles.currentMeta}>
        <Text style={[styles.metaText, { color: colors.icon }]}>
          💧 {data.humidity}%
        </Text>
        <Text style={[styles.metaText, { color: colors.icon }]}>
          💨 {data.wind_speed}m/s
        </Text>
      </View>
    </View>
  );
}

interface HourlyRowProps {
  item: HourlyWeather;
  colors: (typeof Colors)["light"];
}

function HourlyRow({ item, colors }: HourlyRowProps) {
  return (
    <View style={[styles.hourlyRow, { borderBottomColor: colors.icon + "30" }]}>
      <Text style={[styles.hourlyTime, { color: colors.icon }]}>{item.time}</Text>
      <Text style={styles.hourlyIcon}>
        {getWeatherIcon(item.sky, item.rain_type)}
      </Text>
      <Text style={[styles.hourlyTemp, { color: colors.text }]}>
        {item.temp}°C
      </Text>
      <Text style={[styles.hourlyHumidity, { color: colors.icon }]}>
        💧{item.humidity}%
      </Text>
    </View>
  );
}

// ── 메인 화면 ────────────────────────────────────────────────

export default function WeatherScreen() {
  const scheme = useColorScheme() ?? "light";
  const colors = Colors[scheme];

  const [weather, setWeather] = useState<WeatherData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadWeather = useCallback(async () => {
    try {
      setError(null);

      // 위치 권한 요청
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        setError("위치 권한이 필요합니다.\n설정 > 하루 > 위치에서 허용해 주세요.");
        return;
      }

      // 현재 위치 조회 (정확도: balanced — GPS + 네트워크 혼합, 배터리 절약)
      const loc = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });

      const data = await fetchWeather(
        loc.coords.latitude,
        loc.coords.longitude
      );
      setWeather(data);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "알 수 없는 오류가 발생했습니다.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadWeather();
  }, [loadWeather]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    loadWeather();
  }, [loadWeather]);

  // ── 로딩 상태 ─────────────────────────────────────────────
  if (loading) {
    return (
      <View style={[styles.centered, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.tint} />
        <Text style={[styles.loadingText, { color: colors.icon }]}>
          날씨 정보를 불러오는 중...
        </Text>
      </View>
    );
  }

  // ── 에러 상태 ─────────────────────────────────────────────
  if (error) {
    return (
      <View style={[styles.centered, { backgroundColor: colors.background }]}>
        <Text style={styles.errorIcon}>⚠️</Text>
        <Text style={[styles.errorText, { color: colors.text }]}>{error}</Text>
      </View>
    );
  }

  if (!weather) return null;

  // ── 정상 렌더 ─────────────────────────────────────────────
  return (
    <FlatList
      style={{ backgroundColor: colors.background }}
      contentContainerStyle={styles.listContent}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={onRefresh}
          tintColor={colors.tint}
        />
      }
      ListHeaderComponent={
        <>
          <Text style={[styles.screenTitle, { color: colors.text }]}>날씨</Text>
          <Text style={[styles.updateTime, { color: colors.icon }]}>
            예보 기준: {weather.base_date.slice(0, 4)}년{" "}
            {weather.base_date.slice(4, 6)}월{" "}
            {weather.base_date.slice(6, 8)}일 {weather.base_time.slice(0, 2)}시
          </Text>
          <CurrentCard data={weather.current} colors={colors} />
          <Text style={[styles.sectionTitle, { color: colors.text }]}>
            시간별 예보
          </Text>
        </>
      }
      data={weather.hourly}
      keyExtractor={(item) => item.time}
      renderItem={({ item }) => <HourlyRow item={item} colors={colors} />}
    />
  );
}

const styles = StyleSheet.create({
  centered: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    gap: 12,
    padding: 24,
  },
  loadingText: {
    fontSize: 14,
  },
  errorIcon: {
    fontSize: 40,
  },
  errorText: {
    fontSize: 15,
    textAlign: "center",
    lineHeight: 24,
  },
  listContent: {
    padding: 24,
    paddingTop: 64,
    gap: 8,
  },
  screenTitle: {
    fontSize: 28,
    fontWeight: "700",
    marginBottom: 4,
  },
  updateTime: {
    fontSize: 12,
    marginBottom: 16,
  },
  currentCard: {
    borderRadius: 16,
    padding: 24,
    alignItems: "center",
    gap: 8,
    marginBottom: 24,
  },
  currentIcon: {
    fontSize: 64,
  },
  currentTemp: {
    fontSize: 48,
    fontWeight: "700",
  },
  currentSky: {
    fontSize: 16,
  },
  currentMeta: {
    flexDirection: "row",
    gap: 16,
    marginTop: 4,
  },
  metaText: {
    fontSize: 14,
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: "600",
    marginBottom: 8,
  },
  hourlyRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 12,
  },
  hourlyTime: {
    width: 44,
    fontSize: 14,
  },
  hourlyIcon: {
    fontSize: 20,
    width: 28,
    textAlign: "center",
  },
  hourlyTemp: {
    flex: 1,
    fontSize: 15,
    fontWeight: "500",
  },
  hourlyHumidity: {
    fontSize: 13,
  },
});
