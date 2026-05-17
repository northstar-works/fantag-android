package com.northstarlabs.fantag

import android.content.Context
import android.webkit.JavascriptInterface

class FantagAndroidBridge(private val context: Context) {

    @JavascriptInterface
    fun registerPushToken() {
        PushRegistrar.registerCurrentToken(context, force = true)
    }

    @JavascriptInterface
    fun showLineupAlert(color: String, title: String, body: String, playerId: String?) {
        FantagNotifications.showLineupAlert(
            context = context,
            color = color,
            title = title,
            body = body,
            playerId = playerId
        )
    }
}
