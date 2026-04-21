package net.shuit.maildeck

import android.Manifest
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import android.os.Bundle
import androidx.activity.enableEdgeToEdge
import androidx.activity.result.contract.ActivityResultContracts
import androidx.core.content.ContextCompat

class MainActivity : TauriActivity() {

  private val requestPermissionLauncher =
    registerForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
      // 結果はログのみ。拒否されても通知なしで動作継続
    }

  override fun onCreate(savedInstanceState: Bundle?) {
    enableEdgeToEdge()
    super.onCreate(savedInstanceState)
    requestNotificationPermission()
    handleNotificationIntent(intent)
  }

  override fun onNewIntent(intent: Intent) {
    super.onNewIntent(intent)
    handleNotificationIntent(intent)
  }

  private fun handleNotificationIntent(intent: Intent?) {
    val configId = intent?.getStringExtra("configId") ?: return
    val messageId = intent.getStringExtra("messageId") ?: return
    getSharedPreferences("maildeck_fcm", Context.MODE_PRIVATE).edit()
      .putString("pending_configId", configId)
      .putString("pending_messageId", messageId)
      .apply()
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
