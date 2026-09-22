import SwiftUI
import WidgetKit

// MARK: - 색상 헬퍼

extension Color {
    /// hex 문자열(예: "#6B6EE7")로 Color 생성
    init(hex: String) {
        let cleaned = hex.trimmingCharacters(in: CharacterSet.alphanumerics.inverted)
        var value: UInt64 = 0
        Scanner(string: cleaned).scanHexInt64(&value)
        let r = Double((value >> 16) & 0xFF) / 255.0
        let g = Double((value >> 8)  & 0xFF) / 255.0
        let b = Double(value & 0xFF)          / 255.0
        self.init(red: r, green: g, blue: b)
    }
}

// MARK: - 위젯 뷰

/**
 * 하루 위젯 UI (systemMedium — 4×2 셀 크기)
 *
 * 구성:
 *   상단: 날짜 + 날씨
 *   구분선
 *   하단: 오늘 일정 최대 3개 (색상 도트 + 제목/시간)
 */
struct HaruWidgetView: View {
    let entry: HaruEntry

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {

            // 상단 헤더: 날짜(왼쪽) + 날씨(오른쪽)
            HStack(alignment: .center) {
                Text(entry.data.map { formatWidgetDate($0.date) } ?? "하루")
                    .font(.system(size: 13, weight: .bold))
                    .foregroundColor(Color(hex: "#1A1A2E"))
                    .lineLimit(1)

                Spacer()

                if let weather = entry.data?.weather {
                    Text("\(weather.icon) \(weather.temp)°")
                        .font(.system(size: 12))
                        .foregroundColor(Color(hex: "#6B6EE7"))
                }
            }

            // 구분선
            Rectangle()
                .fill(Color(hex: "#6B6EE7").opacity(0.15))
                .frame(height: 1)
                .padding(.vertical, 2)

            // 일정 목록
            let schedules = entry.data?.schedules ?? []

            if schedules.isEmpty {
                Text("오늘 일정이 없습니다")
                    .font(.system(size: 11))
                    .foregroundColor(.secondary)
            } else {
                ForEach(Array(schedules.prefix(3))) { schedule in
                    ScheduleRow(schedule: schedule)
                }
            }

            Spacer(minLength: 0)
        }
        .padding(14)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
    }
}

// MARK: - 일정 행

private struct ScheduleRow: View {
    let schedule: WidgetSchedule

    var body: some View {
        HStack(spacing: 5) {
            // 일정 색상 도트
            Circle()
                .fill(Color(hex: schedule.color))
                .frame(width: 5, height: 5)

            // 시간이 있으면 앞에 표시
            Text(schedule.time.isEmpty
                 ? schedule.title
                 : "\(schedule.time) \(schedule.title)")
                .font(.system(size: 11))
                .foregroundColor(Color(hex: "#1A1A2E").opacity(0.8))
                .lineLimit(1)
        }
    }
}

// MARK: - Preview

#Preview(as: .systemMedium) {
    HaruWidget()
} timeline: {
    HaruEntry(date: .now, data: WidgetDataModel(
        date: "2025-09-22",
        schedules: [
            WidgetSchedule(id: 1, title: "팀 미팅", time: "10:00", color: "#6B6EE7"),
            WidgetSchedule(id: 2, title: "점심 약속", time: "12:30", color: "#10B981"),
            WidgetSchedule(id: 3, title: "운동", time: "19:00", color: "#F59E0B"),
        ],
        weather: WidgetWeather(icon: "☀️", temp: 24, city: "현재위치"),
        updatedAt: ISO8601DateFormatter().string(from: .now)
    ))
    HaruEntry(date: .now, data: nil)
}
