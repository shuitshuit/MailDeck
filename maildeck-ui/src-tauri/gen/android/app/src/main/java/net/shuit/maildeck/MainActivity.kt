package net.shuit.maildeck

import android.Manifest
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import android.os.Bundle
import android.util.Log
import androidx.activity.enableEdgeToEdge
import androidx.activity.result.contract.ActivityResultContracts
import androidx.core.content.ContextCompat

class MainActivity : TauriActivity() {

  companion object {
    private const val TAG = "MailDeckMain"
  }

  private val requestPermissionLauncher =
    registerForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
      Log.i(TAG, "Notification permission result: $granted")
    }

  private var fcmPlugin: FcmPlugin? = null

  fun registerFcmPlugin(plugin: FcmPlugin) {
    Log.i(TAG, "registerFcmPlugin called")
    fcmPlugin = plugin
  }

  override fun onCreate(savedInstanceState: Bundle?) {
    enableEdgeToEdge()
    super.onCreate(savedInstanceState)
    requestNotificationPermission()
    Log.i(TAG, "onCreate: intent action=${intent?.action}, extras=${intent?.extras?.keySet()?.joinToString()}")
    handleNotificationIntent(intent, fromNewIntent = false)
  }

  override fun onNewIntent(intent: Intent) {
    super.onNewIntent(intent)
    Log.i(TAG, "onNewIntent: action=${intent.action}, extras=${intent.extras?.keySet()?.joinToString()}")
    handleNotificationIntent(intent, fromNewIntent = true)
  }

  private fun handleNotificationIntent(intent: Intent?, fromNewIntent: Boolean) {
    val configId = intent?.getStringExtra("configId")
    val messageId = intent?.getStringExtra("messageId")
    Log.i(TAG, "handleNotificationIntent: fromNewIntent=$fromNewIntent, configId=$configId, messageId=$messageId, fcmPlugin=${fcmPlugin != null}")

    if (configId == null || messageId == null) return

    val plugin = fcmPlugin
    if (fromNewIntent && plugin != null) {
      Log.i(TAG, "-> emitNavigation via plugin")
      plugin.emitNavigation(configId, messageId)
    } else {
      Log.i(TAG, "-> saving to SharedPreferences (fromNewIntent=$fromNewIntent, plugin=$plugin)")
      getSharedPreferences("maildeck_fcm", Context.MODE_PRIVATE).edit()
        .putString("pending_configId", configId)
        .putString("pending_messageId", messageId)
        .apply()
    }
  }

  // Android 13 (API 33) 以上で通知パーミッションを実行時に要求
  private fun requestNotificationPermission() {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
      when {
        ContextCompat.checkSelfPermission(
          this, Manifest.permission.POST_NOTIFICATIONS
        ) == PackageManager.PERMISSION_GRANTED -> {
          // 既に許可済み
        }
        else -> {
          requestPermissionLauncher.launch(Manifest.permission.POST_NOTIFICATIONS)
        }
      }
    }
  }


  // FCMトークンをJavaScript側から読み取れるよう公開
  fun getFcmToken(): String? {
    val prefs = getSharedPreferences("maildeck_fcm", Context.MODE_PRIVATE)
    return prefs.getString("fcm_token", null)
  }
}
