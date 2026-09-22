/**
 * 위젯 데이터 레이어
 *
 * React Native(앱) → 네이티브 위젯으로 데이터를 전달하는 브릿지.
 * 플랫폼별로 위젯과 데이터를 공유할 수 있는 저장소에 JSON을 기록한다.
 *
 * Android: SharedPreferences (HaruWidgetData 네이티브 모듈 경유)
 *   - 위젯은 앱과 다른 프로세스에서 실행되므로 Internal Storage에 직접 접근 불가.
 *   - SharedPreferences는 같은 패키지 내에서 공유된다.
 *   - 네이티브 모듈이 없으면(Expo Go, 시뮬레이터) documentDirectory 파일로 폴백.
 *
 * iOS: App Groups 컨테이너 (group.com.rangcloud.haru)
 *   - prebuild + Xcode App Groups 설정 후 활성화 (아래 주석 참고).
 *   - 설정 전에는 documentDirectory 파일로 폴백.
 */

import { NativeModules, Platform } from "react-native";
// expo-file-system v19+에서 documentDirectory 등은 legacy 경로에서 import
import * as FileSystem from "expo-file-system/legacy";
// iOS App Groups용 새 API (prebuild + App Groups 활성화 후 사용)
import { Paths, File as EFSFile } from "expo-file-system";

// 폴백 경로: documentDirectory (위젯에서는 읽을 수 없으나 디버그용)
const FALLBACK_PATH = `${FileSystem.documentDirectory}widget_data.json`;

// iOS App Groups 식별자 (app.json의 entitlements와 일치해야 함)
const IOS_APP_GROUP = "group.com.rangcloud.haru";

export interface WidgetScheduleItem {
  id: number;
  title: string;
  time: string;   // "HH:MM" 또는 "" (종일)
  color: string;
}

export interface WidgetData {
  date: string;               // "YYYY-MM-DD"
  schedules: WidgetScheduleItem[];
  weather: {
    icon: string;             // 이모지 "☀️" 등
    temp: number;
    city: string;             // "현재위치" or "서울"
  } | null;
  updatedAt: string;          // ISO 8601
}

/**
 * 오늘 일정과 날씨를 위젯 저장소에 기록한다.
 * 홈 화면 마운트·포그라운드 복귀·데이터 변경 시 호출한다.
 */
export async function writeWidgetData(data: WidgetData): Promise<void> {
  const json = JSON.stringify(data);

  if (Platform.OS === "android") {
    // Android: HaruWidgetData 네이티브 모듈 → SharedPreferences 저장
    // 모듈이 있으면 위젯 업데이트 브로드캐스트까지 자동으로 전송한다.
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    if (NativeModules.HaruWidgetData?.write) {
      try {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
        NativeModules.HaruWidgetData.write(json);
        return;
      } catch {
        // 네이티브 모듈 오류 → 폴백으로 계속
      }
    }
  }

  if (Platform.OS === "ios") {
    // iOS: App Groups 컨테이너에 저장 (앱 + 위젯 공유 폴더)
    // ⚠️  아래 조건: prebuild 후 Xcode에서 App Groups 설정 완료된 경우만 동작.
    //     설정 전에는 appleSharedContainers가 비어 있어 폴백 경로로 진행된다.
    try {
      const container =
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (Paths as unknown as Record<string, Record<string, unknown>>)
          .appleSharedContainers?.[IOS_APP_GROUP];
      if (container) {
        const file = new EFSFile(container as string, "widget_data.json");
        file.write(json);
        return;
      }
    } catch {
      // App Groups 미설정 → 폴백으로 계속
    }
  }

  // 폴백: documentDirectory (Expo Go, 시뮬레이터, iOS 설정 전)
  try {
    await FileSystem.writeAsStringAsync(FALLBACK_PATH, json, {
      encoding: FileSystem.EncodingType.UTF8,
    });
  } catch {
    // 파일 쓰기 실패해도 앱 동작에는 영향 없음 — 위젯만 업데이트 안 됨
  }
}

/**
 * 위젯 데이터 파일을 읽는다 (디버그·확인용).
 * 실제 위젯은 각 플랫폼의 네이티브 코드가 직접 읽으므로 이 함수는 불필요하다.
 */
export async function readWidgetData(): Promise<WidgetData | null> {
  try {
    const info = await FileSystem.getInfoAsync(FALLBACK_PATH);
    if (!info.exists) return null;
    const raw = await FileSystem.readAsStringAsync(FALLBACK_PATH);
    return JSON.parse(raw) as WidgetData;
  } catch {
    return null;
  }
}
