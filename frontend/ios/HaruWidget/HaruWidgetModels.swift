import Foundation
import WidgetKit

// widgetData.ts 의 WidgetData 인터페이스와 1:1 매핑되는 Swift 구조체

struct WidgetSchedule: Codable, Identifiable {
    let id: Int
    let title: String
    let time: String   // "HH:MM" 또는 "" (종일)
    let color: String  // hex 색상 (예: "#6B6EE7")
}

struct WidgetWeather: Codable {
    let icon: String   // 이모지 (예: "☀️")
    let temp: Int
    let city: String   // "현재위치" or "서울"
}

struct WidgetDataModel: Codable {
    let date: String               // "YYYY-MM-DD"
    let schedules: [WidgetSchedule]
    let weather: WidgetWeather?
    let updatedAt: String          // ISO 8601
}

// 타임라인 엔트리: 위젯 렌더링 시점 + 데이터
struct HaruEntry: TimelineEntry {
    let date: Date
    let data: WidgetDataModel?
}

// MARK: - App Groups 데이터 읽기

/**
 * App Groups 컨테이너에서 위젯 JSON 파일을 읽는다.
 *
 * 저장 경로: widgetData.ts 의 iOS 분기에서
 *   Paths.appleSharedContainers["group.com.rangcloud.haru"] + "widget_data.json"
 * 으로 기록한다.
 *
 * App Groups가 설정되지 않았거나 앱이 아직 실행되지 않은 경우 nil을 반환한다.
 */
func readWidgetData() -> WidgetDataModel? {
    let appGroupID = "group.com.rangcloud.haru"
    guard let container = FileManager.default
        .containerURL(forSecurityApplicationGroupIdentifier: appGroupID) else {
        // App Groups 미설정 — Xcode에서 Capability 추가 필요
        return nil
    }
    let fileURL = container.appendingPathComponent("widget_data.json")
    guard let data = try? Data(contentsOf: fileURL) else { return nil }
    return try? JSONDecoder().decode(WidgetDataModel.self, from: data)
}

// MARK: - 날짜 포맷 헬퍼

/// "YYYY-MM-DD" → "M월 d일 (요일)" 변환
func formatWidgetDate(_ str: String) -> String {
    let input = DateFormatter()
    input.locale = Locale(identifier: "ko_KR")
    input.dateFormat = "yyyy-MM-dd"
    guard let date = input.date(from: str) else { return str }
    let output = DateFormatter()
    output.locale = Locale(identifier: "ko_KR")
    output.dateFormat = "M월 d일 (EEE)"
    return output.string(from: date)
}
