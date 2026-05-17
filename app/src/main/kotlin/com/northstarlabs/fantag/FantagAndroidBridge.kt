package com.northstarlabs.fantag

import android.content.Context
import android.webkit.JavascriptInterface
import android.widget.Toast

class FantagAndroidBridge(private val context: Context) {

    @JavascriptInterface
    fun registerPushToken() {
        // Push notifications are intentionally disabled in the b66 stable no-push build.
    }

    @JavascriptInterface
    fun showLineupAlert(color: String, title: String, body: String, playerId: String?) {
        Toast.makeText(context, "$title: $body", Toast.LENGTH_LONG).show()
    }
}
