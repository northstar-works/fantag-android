package com.northstarlabs.fantag

import android.Manifest
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.Color
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import kotlin.math.absoluteValue

object FantagNotifications {
    const val CHANNEL_LINEUP_ALERTS = "lineup_alerts"
    private const val GROUP_LINEUP_ALERTS = "fantag_lineup_alerts"

    fun createChannels(context: Context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return

        val channel = NotificationChannel(
            CHANNEL_LINEUP_ALERTS,
            "Lineup Alerts",
            NotificationManager.IMPORTANCE_HIGH
        ).apply {
            description = "Confirmed lineup alerts for rostered players"
            enableVibration(true)
            enableLights(true)
            lightColor = Color.rgb(59, 130, 246)
        }

        val manager = context.getSystemService(NotificationManager::class.java)
        manager.createNotificationChannel(channel)
    }

    fun showLineupAlert(
        context: Context,
        color: String,
        title: String,
        body: String,
        playerId: String? = null,
        urlPath: String? = null
    ) {
        createChannels(context)

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU &&
            ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED
        ) {
            return
        }

        val normalized = color.lowercase().trim()
        val accent = when (normalized) {
            "red" -> Color.rgb(239, 68, 68)
            "green" -> Color.rgb(16, 185, 129)
            else -> Color.rgb(59, 130, 246)
        }

        val intent = Intent(context, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
            putExtra("lineup_alert_color", normalized)
            putExtra("lineup_player_id", playerId)
            putExtra("lineup_url_path", urlPath)
        }

        val pendingIntent = PendingIntent.getActivity(
            context,
            (playerId ?: title).hashCode().absoluteValue,
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        val notification = NotificationCompat.Builder(context, CHANNEL_LINEUP_ALERTS)
            .setSmallIcon(R.drawable.ic_notification)
            .setContentTitle(title)
            .setContentText(body)
            .setStyle(NotificationCompat.BigTextStyle().bigText(body))
            .setColor(accent)
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setCategory(NotificationCompat.CATEGORY_STATUS)
            .setAutoCancel(true)
            .setGroup(GROUP_LINEUP_ALERTS)
            .setContentIntent(pendingIntent)
            .build()

        NotificationManagerCompat.from(context).notify(
            ("$normalized:$playerId:$title:$body").hashCode().absoluteValue,
            notification
        )
    }
}
