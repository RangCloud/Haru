import WidgetKit
import SwiftUI

// MARK: - 타임라인 프로바이더

/**
 * 위젯 데이터 공급자.
 * App Groups 컨테이너에서 JSON을 읽어 타임라인 엔트리를 생성한다.
 * 30분마다 시스템이 재요청하고, 앱이 데이터를 갱신하면 WidgetKit.reloadAllTimelines()로
 * 즉시 갱신할 수도 있다 (향후 확장 시 앱에서 호출).
 */
struct HaruProvider: TimelineProvider {

    /// placeholder: 위젯 갤러리에서 미리보기 표시용 (데이터 없이 뼈대만)
    func placeholder(in context: Context) -> HaruEntry {
        HaruEntry(date: Date(), data: nil)
    }

    /// snapshot: 위젯 추가 화면의 미리보기 (가능하면 실제 데이터 사용)
    func getSnapshot(in context: Context, completion: @escaping (HaruEntry) -> Void) {
        completion(HaruEntry(date: Date(), data: readWidgetData()))
    }

    /// timeline: 실제 렌더링 일정 결정
    func getTimeline(in context: Context, completion: @escaping (Timeline<HaruEntry>) -> Void) {
        let entry = HaruEntry(date: Date(), data: readWidgetData())
        // 30분 후 다음 타임라인을 시스템에 요청
        let nextUpdate = Calendar.current.date(byAdding: .minute, value: 30, to: Date()) ?? Date()
        let timeline = Timeline(entries: [entry], policy: .after(nextUpdate))
        completion(timeline)
    }
}

// MARK: - 위젯 진입점

/**
 * HaruWidget — 하루 앱의 홈 화면 위젯
 *
 * 크기: systemMedium (4×2 셀)
 * 위젯 추가 시 이름: "하루"
 * 설명: "오늘의 일정과 날씨를 한눈에"
 *
 * 설정 요구사항:
 *   1. Xcode → Targets → HaruWidgetExtension → Signing & Capabilities
 *      → "+ Capability" → "App Groups" → "group.com.rangcloud.haru" 추가
 *   2. 메인 앱 타겟(haru)에도 동일한 App Groups 추가
 *   3. 두 타겟 모두 같은 팀·프로비저닝 프로파일 사용
 */
struct HaruWidget: Widget {
    let kind = "HaruWidget"

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: HaruProvider()) { entry in
            HaruWidgetView(entry: entry)
                // iOS 17+: 위젯 배경색 설정
                .containerBackground(
                    Color(red: 0.96, green: 0.96, blue: 1.0), // #F5F5FF
                    for: .widget
                )
        }
        .configurationDisplayName("하루")
        .description("오늘의 일정과 날씨를 한눈에")
        .supportedFamilies([.systemMedium])
    }
}
