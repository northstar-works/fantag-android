package com.northstarlabs.fantag

import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage

class FantagMessagingService : FirebaseMessagingService() {

    override fun onNewToken(token: String) {
        super.onNewToken(token)
        PushRegistrar.registerToken(this, token, force = true)
    }

    override fun onMessageReceived(message: RemoteMessage) {
        super.onMessageReceived(message)

        val data = message.data
        val color = data["alert_color"] ?: data["color"] ?: "blue"
        val title = data["title"] ?: message.notification?.title ?: "FANTAG Lineup Alert"
        val body = data["body"] ?: message.notification?.body ?: "Roster status changed."
        val playerId = data["player_id"] ?: data["espn_player_id"]
        val urlPath = data["url_path"] ?: data["path"]

        FantagNotifications.showLineupAlert(
            context = this,
            color = color,
            title = title,
            body = body,
            playerId = playerId,
            urlPath = urlPath
        )
    }
}
