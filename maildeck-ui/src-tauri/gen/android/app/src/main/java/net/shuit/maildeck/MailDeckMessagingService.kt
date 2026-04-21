package net.shuit.maildeck

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import androidx.core.app.NotificationCompat
import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage

class MailDeckMessagingService : FirebaseMessagingService() {

    companion object {
        private const val CHANNEL_ID = "maildeck_email"
        private const val CHANNEL_NAME = "新着メール"
    }

    override fun onNewToken(token: String) {
        super.onNewToken(token)
        // トークンをSharedPreferencesに保存しておく
        // アプリ起動時にWebViewのJavaScript側からこのトークンを読み取ってAPIに登録する
        val prefs = getSharedPreferences("maildeck_fcm", Context.MODE_PRIVATE)
        prefs.edit().putString("fcm_token", token).apply()
    }

    override fun onMessageReceived(message: RemoteMessage) {
        super.onMessageReceived(message)

        val title = message.notification?.title
            ?: message.data["title"]
            ?: "MailDeck"
        val body = message.notification?.body
            ?: message.data["body"]
            ?: "新着メールがあります"
        val configId = message.data["configId"]
        val messageId = message.data["messageId"]

        showNotification(title, body, configId, messageId)
    }

    private fun showNotification(title: String, body: String, configId: String?, messageId: String?) {
        val manager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager

        // Android 8+ 用チャンネル作成
        val channel = NotificationChannel(
            CHANNEL_ID,
            CHANNEL_NAME,
            NotificationManager.IMPORTANCE_DEFAULT
        )
        manager.createNotificationChannel(channel)

        val intent = Intent(this, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP
            if (configId != null && messageId != null) {
                putExtra("configId", configId)
                putExtra("messageId", messageId)
            }
        }
        val pendingIntent = PendingIntent.getActivity(
            this, 0, intent,
            PendingIntent.FLAG_ONE_SHOT or PendingIntent.FLAG_IMMUTABLE
        )

        val notification = NotificationCompat.Builder(this, CHANNEL_ID)
            .setSmallIcon(android.R.drawable.ic_dialog_email)
            .setContentTitle(title)
            .setContentText(body)
            .setAutoCancel(true)
            .setContentIntent(pendingIntent)
            .build()

        manager.notify(System.currentTimeMillis().toInt(), notification)
    }
}
