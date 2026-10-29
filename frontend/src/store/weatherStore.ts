/**
 * 날씨 전역 상태 — 홈 탭 날씨 위젯용
 *
 * 위치 권한 → 대략적인 현재 위치 → 기기 안에서 기상청 격자로 변환 → 격자 번호로 날씨 fetch.
 * 위도·경도는 서버로 보내지 않는다 (위치정보법 — src/utils/kmaGrid.ts 참고).
 * 위치를 못 쓰면 서울 격자로 fallback.
 * 마지막 fetch로부터 30분 이내이면 캐시를 그대로 사용해 불필요한 API 호출을 막는다.
 */

import * as Location from "expo-location";
import { create } from "zustand";

import { fetchWeather, type HourlyWeather } from "@/src/api/weather";
import { latlonToGrid, SEOUL_GRID } from "@/src/utils/kmaGrid";

// 30분(밀리초)마다 한 번씩만 날씨를 새로 가져온다
const CACHE_TTL_MS = 30 * 60 * 1000;

interface WeatherState {
  current: HourlyWeather | null;
  isLoading: boolean;
  error: string | null;
  usingFallback: boolean;       // true: 서울 좌표 기준
  lastFetchedAt: number | null; // Unix 밀리초

  // 날씨 로드 (TTL 내이면 캐시 사용)
  loadWeather: (force?: boolean) => Promise<void>;
}

export const useWeatherStore = create<WeatherState>((set, get) => ({
  current: null,
  isLoading: false,
  error: null,
  usingFallback: false,
  lastFetchedAt: null,

  loadWeather: async (force = false) => {
    const { lastFetchedAt, isLoading } = get();

    // 이미 로딩 중이면 중복 호출 방지
    if (isLoading) return;

    // TTL 내이면 캐시를 그대로 사용 (force=true 시 항상 재요청)
    if (!force && lastFetchedAt && Date.now() - lastFetchedAt < CACHE_TTL_MS) return;

    set({ isLoading: true, error: null });

    try {
      let grid = SEOUL_GRID;
      let usingFallback = false;

      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status === "granted") {
          // 3초 내 응답 없으면 서울 fallback (에뮬레이터 GPS 무한 대기 방지).
          // Low: 날씨는 5km 격자 단위라 정밀 측위가 필요 없다. 기기도 대략적인 위치만 주도록 설정돼 있다
          // (iOS NSLocationDefaultAccuracyReduced, Android는 정확한 위치 권한 자체를 뺐다)
          const loc = await Promise.race([
            Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Low }),
            new Promise<never>((_, reject) =>
              setTimeout(() => reject(new Error("GPS timeout")), 3000)
            ),
          ]);
          // 좌표는 이 자리에서 격자로 바꾸고 버린다 — 저장하지도, 서버로 보내지도 않는다
          grid = latlonToGrid(loc.coords.latitude, loc.coords.longitude);
        } else {
          usingFallback = true;
        }
      } catch {
        usingFallback = true;
      }

      const data = await fetchWeather(grid);

      set({
        current: data.current,
        usingFallback,
        isLoading: false,
        error: null,
        lastFetchedAt: Date.now(),
      });
    } catch (e) {
      set({
        error: e instanceof Error ? e.message : "날씨 정보를 불러오지 못했습니다.",
        isLoading: false,
      });
    }
  },
}));
