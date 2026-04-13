package net.shuit.maildeck

import android.app.Activity
import android.content.Context
import app.tauri.annotation.Command
import app.tauri.annotation.TauriPlugin
import app.tauri.plugin.JSObject
import app.tauri.plugin.Plugin
import app.tauri.plugin.Invoke

@TauriPlugin
class FcmPlugin(private val activity: Activity) : Plugin(activity) {

    @Command
    fun getFcmToken(invoke: Invoke) {
        val prefs = activity.getSharedPreferences("maildeck_fcm", Context.MODE_PRIVATE)
        val token = prefs.getString("fcm_token", null)
        val result = JSObject()
        result.put("token", token)
        invoke.resolve(result)
    }
}
