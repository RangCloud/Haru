/**
 * 날씨 화면
 * 기기 위치 → 백엔드 /api/weather → 현재 날씨 + 12시간 예보
 */

import * as Location from "expo-location";
import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, FlatList, RefreshControl, StyleSheet, Text, TouchableOpacity, View } from "react-native";

import { Colors, cardShadow } from "@/constants/theme";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { fetchWeather, type HourlyWeather, type WeatherData } from "@/src/api/weather";

// ── 날씨 아이콘 ───────────────────────────────────────────────

const SKY_ICON: Record<string, string> = { 맑음: "☀️", 구름많음: "⛅", 흐림: "☁️" };
const RAIN_ICON: Record<string, string> = { 없음: "", 비: "🌧️", "비/눈": "🌨️", 눈: "❄️", 소나기: "⛈️" };

function getWeatherIcon(sky: string, rainType: string): string {
  if (rainType !== "없음") return RAIN_ICON[rainType] ?? "🌧️";
  return SKY_ICON[sky] ?? "🌤️";
}

// ── 현재 날씨 카드 ────────────────────────────────────────────

function CurrentCard({ data, colors }: { data: HourlyWeather; colors: typeof Colors.light }) {
  return (
    <View style={[styles.currentCard, { backgroundColor: colors.tintLight, borderColor: colors.cardBorder }, cardShadow]}>
      <Text style={styles.currentIcon}>{getWeatherIcon(data.sky, data.rain_type)}</Text>
      <Text style={[styles.currentTemp, { color: colors.text }]}>{data.temp}°</Text>
      <Text style={[styles.currentSky, { color: colors.subtext }]}>
        {data.sky}{data.rain_type !== "없음" ? ` · ${data.rain_type}` : ""}
      </Text>
      <View style={styles.currentMeta}>
        <View style={[styles.metaPill, { backgroundColor: colors.card }]}>
          <Text style={[styles.metaText, { color: colors.subtext }]}>💧 {data.humidity}%</Text>
        </View>
        <View style={[styles.metaPill, { backgroundColor: colors.card }]}>
          <Text style={[styles.metaText, { color: colors.subtext }]}>💨 {data.wind_speed}m/s</Text>
        </View>
      </View>
    </View>
  );
}

// ── 시간별 예보 행 ────────────────────────────────────────────

function HourlyRow({ item, colors }: { item: HourlyWeather; colors: typeof Colors.light }) {
  return (
    <View style={[styles.hourlyRow, { borderBottomColor: colors.separator }]}>
      <Text style={[styles.hourlyTime, { color: colors.subtext }]}>{item.time}</Text>
      <Text style={styles.hourlyIcon}>{getWeatherIcon(item.sky, item.rain_type)}</Text>
      <Text style={[styles.hourlyTemp, { color: colors.text }]}>{item.temp}°</Text>
      <Text style={[styles.hourlyHumidity, { color: colors.subtext }]}>💧{item.humidity}%</Text>
    </View>
  );
}

// ── 메인 화면 ────────────────────────────────────────────────

export default function WeatherScreen() {
  const scheme = useColorScheme();
  const colors = Colors[scheme];

  const [weather, setWeather] = useState<WeatherData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadWeather = useCallback(async () => {
    try {
      setError(null);
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        setError("위치 권한이 필요합니다.\n설정 > 하루 > 위치에서 허용해 주세요.");
        return;
      }
      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      const data = await fetchWeather(loc.coords.latitude, loc.coords.longitude);
      setWeather(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "날씨 정보를 불러오지 못했습니다.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { loadWeather(); }, [loadWeather]);
  const onRefresh = useCallback(() => { setRefreshing(true); loadWeather(); }, [loadWeather]);

  if (loading) {
    return (
      <View style={[styles.centered, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.tint} />
        <Text style={[styles.statusText, { color: colors.subtext }]}>날씨 정보를 불러오는 중...</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={[styles.centered, { backgroundColor: colors.background }]}>
        <Text style={styles.errorEmoji}>⚠️</Text>
        <Text style={[styles.errorText, { color: colors.text }]}>{error}</Text>
        <TouchableOpacity
          onPress={loadWeather}
          style={[styles.retryBtn, { backgroundColor: colors.tint }]}
        >
          <Text style={styles.retryText}>다시 시도</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (!weather) return null;

  return (
    <FlatList
      style={{ backgroundColor: colors.background }}
      contentContainerStyle={styles.listContent}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.tint} />}
      ListHeaderComponent={
        <>
          <Text style={[styles.screenTitle, { color: colors.text }]}>날씨</Text>
          <Text style={[styles.updateTime, { color: colors.subtext }]}>
            예보 기준 {weather.base_date.slice(0, 4)}.{weather.base_date.slice(4, 6)}.{weather.base_date.slice(6, 8)} {weather.base_time.slice(0, 2)}시
          </Text>
          <CurrentCard data={weather.current} colors={colors} />
          <Text style={[styles.sectionLabel, { color: colors.subtext }]}>시간별 예보</Text>
        </>
      }
      data={weather.hourly}
      keyExtractor={(item) => item.time}
      renderItem={({ item }) => <HourlyRow item={item} colors={colors} />}
    />
  );
}

const styles = StyleSheet.create({
  centered: { flex: 1, justifyContent: "center", alignItems: "center", gap: 12, padding: 24 },
  statusText: { fontSize: 14 },
  errorEmoji: { fontSize: 40 },
  errorText: { fontSize: 15, textAlign: "center", lineHeight: 24 },
  retryBtn: { marginTop: 8, paddingHorizontal: 28, paddingVertical: 12, borderRadius: 12 },
  retryText: { color: "#fff", fontSize: 15, fontWeight: "600" },
  listContent: { padding: 24, paddingTop: 64, gap: 4 },
  screenTitle: { fontSize: 28, fontWeight: "700", letterSpacing: -0.5, marginBottom: 2 },
  updateTime: { fontSize: 12, marginBottom: 20 },
  // ── 현재 날씨 카드 ──────────────────────────────────────────
  currentCard: {
    borderRadius: 20,
    borderWidth: 1,
    padding: 28,
    alignItems: "center",
    gap: 6,
    marginBottom: 24,
  },
  currentIcon: { fontSize: 72 },
  currentTemp: { fontSize: 56, fontWeight: "700", letterSpacing: -2 },
  currentSky: { fontSize: 16 },
  currentMeta: { flexDirection: "row", gap: 10, marginTop: 8 },
  metaPill: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 20,
  },
  metaText: { fontSize: 13 },
  // ── 시간별 예보 ─────────────────────────────────────────────
  sectionLabel: {
    fontSize: 12,
    fontWeight: "600",
    letterSpacing: 0.8,
    textTransform: "uppercase",
    marginBottom: 4,
  },
  hourlyRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 12,
  },
  hourlyTime: { width: 48, fontSize: 14 },
  hourlyIcon: { fontSize: 22, width: 30, textAlign: "center" },
  hourlyTemp: { flex: 1, fontSize: 16, fontWeight: "600" },
  hourlyHumidity: { fontSize: 13 },
});
