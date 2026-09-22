package com.rangcloud.haru.widget

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.Context
import android.content.Intent
import android.widget.RemoteViews
import com.rangcloud.haru.MainActivity
import com.rangcloud.haru.R
import com.rangcloud.haru.WidgetDataModule
import org.json.JSONArray
import org.json.JSONObject
import java.text.SimpleDateFormat
import java.util.Locale

/**
 * 하루 홈 화면 위젯 (4×2 셀)
 *
 * 데이터 흐름:
 *   JS(widgetData.ts) → HaruWidgetData 네이티브 모듈 → SharedPreferences → 이 클래스
 *
 * 업데이트 트리거:
 *   1. 앱이 SharedPreferences에 쓴 후 ACTION_APPWIDGET_UPDATE 브로드캐스트 전송
 *   2. android:updatePeriodMillis 에 따른 시스템 주기 갱신 (30분 = 1800000ms)
 *   3. 부팅 후 BOOT_COMPLETED 브로드캐스트 (AndroidManifest에 RECEIVE_BOOT_COMPLETED 권한 있음)
 */
class HaruWidget : AppWidgetProvider() {

    override fun onUpdate(
        context: Context,
        manager: AppWidgetManager,
        appWidgetIds: IntArray
    ) {
        // 배치된 모든 위젯 인스턴스 업데이트
        appWidgetIds.forEach { id ->
            updateWidget(context, manager, id)
        }
    }

    companion object {
        /**
         * 단일 위젯 인스턴스를 SharedPreferences 데이터로 렌더링한다.
         * onUpdate 외에 네이티브 모듈의 브로드캐스트 수신 시에도 호출된다.
         */
        fun updateWidget(context: Context, manager: AppWidgetManager, widgetId: Int) {
            val views = RemoteViews(context.packageName, R.layout.haru_widget)

            // 위젯 탭 시 앱 실행 인텐트
            val launchIntent = Intent(context, MainActivity::class.java)
            val pendingIntent = PendingIntent.getActivity(
                context, 0, launchIntent,
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
            )
            views.setOnClickPendingIntent(R.id.widget_root, pendingIntent)

            // SharedPreferences에서 위젯 JSON 읽기
            val prefs = context.getSharedPreferences(
                WidgetDataModule.PREFS_NAME, Context.MODE_PRIVATE
            )
            val json = prefs.getString(WidgetDataModule.KEY_DATA, null)

            if (json != null) {
                try {
                    bindData(views, JSONObject(json))
                } catch (_: Exception) {
                    bindEmpty(views)
                }
            } else {
                // 앱 미실행 상태 — 첫 설치 또는 데이터 없음
                bindEmpty(views)
            }

            manager.updateAppWidget(widgetId, views)
        }

        /** JSON 데이터를 RemoteViews에 바인딩한다. */
        private fun bindData(views: RemoteViews, data: JSONObject) {
            // 날짜: "2025-09-22" → "9월 22일 (월)"
            val dateStr = data.optString("date", "")
            if (dateStr.isNotEmpty()) {
                try {
                    val parser = SimpleDateFormat("yyyy-MM-dd", Locale.KOREAN)
                    val formatter = SimpleDateFormat("M월 d일 (EEE)", Locale.KOREAN)
                    val formatted = formatter.format(parser.parse(dateStr)!!)
                    views.setTextViewText(R.id.widget_date, formatted)
                } catch (_: Exception) {
                    views.setTextViewText(R.id.widget_date, dateStr)
                }
            }

            // 날씨: 이모지 + 온도
            val weather = data.optJSONObject("weather")
            if (weather != null) {
                val icon = weather.optString("icon", "")
                val temp = weather.optInt("temp", 0)
                views.setTextViewText(R.id.widget_weather, "$icon ${temp}°")
            } else {
                views.setTextViewText(R.id.widget_weather, "")
            }

            // 오늘 일정 (최대 3개)
            val schedules: JSONArray? = data.optJSONArray("schedules")
            val lineIds = listOf(R.id.widget_schedule1, R.id.widget_schedule2, R.id.widget_schedule3)

            for (i in lineIds.indices) {
                if (schedules != null && i < schedules.length()) {
                    val s = schedules.getJSONObject(i)
                    val time = s.optString("time", "")
                    val title = s.optString("title", "")
                    // 종일 일정이면 시간 없이 제목만
                    val line = if (time.isNotEmpty()) "$time $title" else title
                    views.setTextViewText(lineIds[i], line)
                } else {
                    views.setTextViewText(lineIds[i], "")
                }
            }

            // 일정이 하나도 없을 때 안내 문구
            if (schedules == null || schedules.length() == 0) {
                views.setTextViewText(R.id.widget_schedule1, "오늘 일정이 없습니다")
            }
        }

        /** 데이터가 없을 때 기본 안내 메시지 표시. */
        private fun bindEmpty(views: RemoteViews) {
            views.setTextViewText(R.id.widget_date, "하루")
            views.setTextViewText(R.id.widget_weather, "")
            views.setTextViewText(R.id.widget_schedule1, "앱을 실행하면 업데이트됩니다")
            views.setTextViewText(R.id.widget_schedule2, "")
            views.setTextViewText(R.id.widget_schedule3, "")
        }
    }
}
