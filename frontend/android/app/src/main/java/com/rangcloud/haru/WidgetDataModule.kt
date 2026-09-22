package com.rangcloud.haru

import android.appwidget.AppWidgetManager
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.content.SharedPreferences
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

/**
 * React Native → Android SharedPreferences 브릿지 네이티브 모듈
 *
 * 위젯은 앱과 별도 프로세스에서 실행되므로 Internal Storage에 직접 접근할 수 없다.
 * SharedPreferences(MODE_PRIVATE)는 같은 패키지 내 앱·위젯이 공유할 수 있는 저장소다.
 *
 * JS에서 NativeModules.HaruWidgetData.write(json) 을 호출하면:
 *   1) SharedPreferences에 JSON 저장
 *   2) 현재 배치된 모든 HaruWidget에 업데이트 브로드캐스트 전송
 */
class WidgetDataModule(private val reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    companion object {
        // widgetData.ts 및 HaruWidget.kt 와 동일한 값 사용
        const val PREFS_NAME = "haru_widget"
        const val KEY_DATA = "widget_json"
    }

    override fun getName() = "HaruWidgetData"

    @ReactMethod
    fun write(json: String) {
        // 1) SharedPreferences에 위젯 데이터 JSON 저장
        val prefs: SharedPreferences = reactContext
            .getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        prefs.edit().putString(KEY_DATA, json).apply()

        // 2) 홈 화면에 배치된 하루 위젯 전부에 업데이트 신호 전송
        //    ComponentName을 Class.forName으로 느슨하게 참조해 빌드 순서 문제를 방지한다.
        try {
            val manager = AppWidgetManager.getInstance(reactContext)
            val cls = Class.forName("${reactContext.packageName}.widget.HaruWidget")
            val ids = manager.getAppWidgetIds(ComponentName(reactContext, cls))
            if (ids.isNotEmpty()) {
                val intent = Intent(AppWidgetManager.ACTION_APPWIDGET_UPDATE).apply {
                    putExtra(AppWidgetManager.EXTRA_APPWIDGET_IDS, ids)
                }
                reactContext.sendBroadcast(intent)
            }
        } catch (_: ClassNotFoundException) {
            // 위젯 클래스가 아직 없는 경우(초기 설치 전) — 무시
        }
    }
}
