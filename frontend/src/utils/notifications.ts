/**
 * 알림 유틸리티
 *
 * expo-notifications 기반.
 * 일정 시간 알림 예약 / 취소 / 권한 요청을 담당한다.
 *
 * 사용 흐름:
 * 1. 앱 시작 시 requestNotificationPermission() 호출
 * 2. 일정 추가 시 scheduleEventNotification() 호출 → scheduleId 반환
 * 3. 일정 삭제 시 cancelNotification(scheduleId) 호출
 */

import * as Notifications from "expo-notifications";
import { Platform } from "react-native";

// 알림이 포그라운드에서도 표시되도록 핸들러 설정
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

/**
 * 알림 권한을 요청한다.
 * 이미 허용된 경우 바로 true 반환, 거부된 경우 false 반환.
 * Android 13+ (API 33+)에서는 POST_NOTIFICATIONS 권한이 필요하다.
 */
export async function requestNotificationPermission(): Promise<boolean> {
  try {
    // Android에서는 채널을 먼저 생성해야 알림이 표시된다
    if (Platform.OS === "android") {
      await Notifications.setNotificationChannelAsync("haru-events", {
        name: "일정 알림",
        importance: Notifications.AndroidImportance.HIGH,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: "#6B6EE7",
      });
    }

    const { status: existing } = await Notifications.getPermissionsAsync();
    if (existing === "granted") return true;

    const { status } = await Notifications.requestPermissionsAsync();
    return status === "granted";
  } catch {
    return false;
  }
}

/**
 * 일정 알림을 예약한다.
 *
 * @param title   일정 제목
 * @param date    날짜 문자열 "YYYY-MM-DD"
 * @param time    시간 문자열 "HH:MM" (없으면 당일 오전 9시)
 * @returns       scheduleId (삭제 시 필요) 또는 null (과거 일정이면 예약 안 함)
 */
export async function scheduleEventNotification(
  title: string,
  date: string,
  time: string,
): Promise<string | null> {
  try {
    // 날짜·시간 파싱
    const [y, m, d] = date.split("-").map(Number);
    const [h, min] = time ? time.split(":").map(Number) : [9, 0];

    // 알림 발생 시각: 일정 시간 10분 전
    const notifyAt = new Date(y, m - 1, d, h, min - 10);

    // 과거 시각이면 예약 생략
    if (notifyAt.getTime() <= Date.now()) return null;

    const id = await Notifications.scheduleNotificationAsync({
      content: {
        title: "📅 일정 알림",
        body: title,
        sound: true,
        // Android 채널
        ...(Platform.OS === "android" && { channelId: "haru-events" }),
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: notifyAt,
      },
    });

    return id;
  } catch {
    // 권한 없거나 예약 실패 시 알림 없이 일정만 저장되도록 null 반환
    return null;
  }
}

/**
 * 예약된 알림을 취소한다.
 * 일정 삭제 시 호출한다.
 */
export async function cancelNotification(scheduleId: string): Promise<void> {
  try {
    await Notifications.cancelScheduledNotificationAsync(scheduleId);
  } catch {
    // 이미 발생한 알림이거나 잘못된 id면 무시
  }
}
