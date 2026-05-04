package net.shuit.maildeck

import android.app.Activity
import android.content.Context
import android.util.Log
import android.webkit.WebView
import android.webkit.WebViewClient
import app.tauri.annotation.Command
import app.tauri.annotation.TauriPlugin
import app.tauri.plugin.JSObject
import app.tauri.plugin.Plugin
import app.tauri.plugin.Invoke

@TauriPlugin
class FcmPlugin(private val activity: Activity) : Plugin(activity) {

    companion object {
        private const val TAG = "MailDeckFcmPlugin"
    }

    private var webViewRef: WebView? = null
    private var pageLoaded = false

    override fun load(webView: WebView) {
        super.load(webView)
        webViewRef = webView
        Log.i(TAG, "load() called, registering with MainActivity")
        (activity as? MainActivity)?.registerFcmPlugin(this)

        // ページ読み込み完了後に保留ナビゲーションを処理
        val originalClient = webView.webViewClient
        webView.webViewClient = object : WebViewClient() {
            override fun onPageFinished(view: WebView?, url: String?) {
                super.onPageFinished(view, url)
                if (pageLoaded) return
                pageLoaded = true
                Log.i(TAG, "onPageFinished: url=$url")
                // JS側のリスナー登録を待つため少し遅延してから確認
                view?.postDelayed({
                    checkAndEmitPendingNavigation()
                }, 2000)
            }
        }
    }

    fun checkAndEmitPendingNavigation() {
        val prefs = activity.getSharedPreferences("maildeck_fcm", Context.MODE_PRIVATE)
        val configId = prefs.getString("pending_configId", null)
        val messageId = prefs.getString("pending_messageId", null)
        Log.i(TAG, "checkAndEmitPendingNavigation: configId=$configId, messageId=$messageId, hasListener=${hasListener("navigation")}")
        if (configId != null && messageId != null) {
            prefs.edit().remove("pending_configId").remove("pending_messageId").apply()
            emitNavigation(configId, messageId)
        }
    }

    @Command
    fun getFcmToken(invoke: Invoke) {
        val prefs = activity.getSharedPreferences("maildeck_fcm", Context.MODE_PRIVATE)
        val token = prefs.getString("fcm_token", null)
        val result = JSObject()
        result.put("token", token)
        invoke.resolve(result)
    }

    @Command
    fun getPendingNavigation(invoke: Invoke) {
        val prefs = activity.getSharedPreferences("maildeck_fcm", Context.MODE_PRIVATE)
        val configId = prefs.getString("pending_configId", null)
        val messageId = prefs.getString("pending_messageId", null)
        Log.i(TAG, "getPendingNavigation: configId=$configId, messageId=$messageId")
        prefs.edit().remove("pending_configId").remove("pending_messageId").apply()
        val result = JSObject()
        result.put("configId", configId)
        result.put("messageId", messageId)
        invoke.resolve(result)
    }

    @Command
    fun notifyListenerReady(invoke: Invoke) {
        val prefs = activity.getSharedPreferences("maildeck_fcm", Context.MODE_PRIVATE)
        val configId = prefs.getString("pending_configId", null)
        val messageId = prefs.getString("pending_messageId", null)
        Log.i(TAG, "notifyListenerReady: pending configId=$configId, messageId=$messageId")
        if (configId != null && messageId != null) {
            prefs.edit().remove("pending_configId").remove("pending_messageId").apply()
            activity.runOnUiThread {
                emitNavigation(configId, messageId)
            }
        }
        invoke.resolve(JSObject())
    }

    fun hasNavigationListener(): Boolean = hasListener("navigation")

    fun emitNavigation(configId: String, messageId: String) {
        Log.i(TAG, "emitNavigation: configId=$configId, messageId=$messageId, hasListener=${hasListener("navigation")}")
        val payload = JSObject()
        payload.put("configId", configId)
        payload.put("messageId", messageId)
        trigger("navigation", payload)
    }
}
