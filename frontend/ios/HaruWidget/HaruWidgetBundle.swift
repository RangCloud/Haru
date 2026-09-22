import WidgetKit
import SwiftUI

// 위젯 익스텐션의 진입점 (@main 역할)
// 여러 위젯을 추가하려면 Group { } 안에 나열한다.
@main
struct HaruWidgetBundle: WidgetBundle {
    var body: some Widget {
        HaruWidget()
        // 향후 위젯 추가 시 여기에 추가
        // HaruSmallWidget()
    }
}
