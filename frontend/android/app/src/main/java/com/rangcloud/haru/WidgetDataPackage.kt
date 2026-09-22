package com.rangcloud.haru

import com.facebook.react.ReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.uimanager.ViewManager

/**
 * WidgetDataModule을 React Native 패키지로 등록하는 래퍼.
 *
 * MainApplication.kt 의 getPackages() 내부에
 *   add(WidgetDataPackage())
 * 한 줄 추가하면 JS에서 NativeModules.HaruWidgetData 로 접근 가능해진다.
 */
class WidgetDataPackage : ReactPackage {
    override fun createNativeModules(ctx: ReactApplicationContext): List<NativeModule> =
        listOf(WidgetDataModule(ctx))

    override fun createViewManagers(ctx: ReactApplicationContext): List<ViewManager<*, *>> =
        emptyList()
}
