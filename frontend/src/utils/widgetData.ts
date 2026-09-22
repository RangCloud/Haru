/**
 * 위젯 데이터 레이어
 *
 * React Native(앱) → 네이티브 위젯으로 데이터를 전달하는 다리.
 * 앱이 포그라운드에서 오늘 일정·날씨를 JSON 파일로 기록하면
 * Android/iOS 네이티브 위젯이 이 파일을 읽어 표시한다.
 *
 * 현재: expo-file-system documentDirectory에 저장 (앱 내부 저장소).
 * Bare workflow 전환 후:
 *   - Android: SharedPreferences 또는 external storage로 변경
 *   - iOS: App Groups container로 변경 (위젯과 공유 폴더)
 *
 * 이 파일의 writeWidgetData 함수는 일정·날씨 로드 후 호출한다.
 */

// expo-file-system v19+에서 documentDirectory, writeAsStringAsync 등은
// "expo-file-system/legacy"에서 불러와야 한다 (기본 export에서 제거됨).
import * as FileSystem from "expo-file-system/legacy";

// 위젯이 읽을 JSON 파일 경로
// Bare 전환 후 iOS App Group 경로로 교체: containerUrl + "widget_data.json"
const WIDGET_DATA_PATH = `${FileSystem.documentDirectory}widget_data.json`;

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
 * 오늘 일정과 날씨를 위젯 JSON 파일에 기록한다.
 * 홈 화면 마운트·포그라운드 복귀·데이터 변경 시 호출한다.
 */
export async function writeWidgetData(data: WidgetData): Promise<void> {
  try {
    await FileSystem.writeAsStringAsync(
      WIDGET_DATA_PATH,
      JSON.stringify(data),
      { encoding: FileSystem.EncodingType.UTF8 },
    );
  } catch {
    // 파일 쓰기 실패해도 앱 동작에는 영향 없음 — 위젯만 업데이트 안 됨
  }
}

/**
 * 위젯 데이터 파일을 읽는다 (디버그·확인용).
 */
export async function readWidgetData(): Promise<WidgetData | null> {
  try {
    const info = await FileSystem.getInfoAsync(WIDGET_DATA_PATH);
    if (!info.exists) return null;
    const raw = await FileSystem.readAsStringAsync(WIDGET_DATA_PATH);
    return JSON.parse(raw) as WidgetData;
  } catch {
    return null;
  }
}
