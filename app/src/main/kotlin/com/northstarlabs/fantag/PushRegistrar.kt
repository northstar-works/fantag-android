package com.northstarlabs.fantag

import android.content.Context
import android.os.Build
import android.util.Log
import androidx.preference.PreferenceManager
import com.google.firebase.FirebaseApp
import com.google.firebase.messaging.FirebaseMessaging
import org.json.JSONObject
import java.io.OutputStreamWriter
import java.net.HttpURLConnection
import java.net.URL
import kotlin.concurrent.thread

object PushRegistrar {
    private const val TAG = "FantagPushRegistrar"
    private const val PREF_LAST_TOKEN = "last_fcm_token"

    fun registerCurrentToken(context: Context, force: Boolean = false) {
        val prefs = PreferenceManager.getDefaultSharedPreferences(context)
        if (!prefs.getBoolean(MainActivity.PREF_ENABLE_PUSH, true)) return

        try {
            FirebaseApp.initializeApp(context)
            FirebaseMessaging.getInstance().token
                .addOnSuccessListener { token -> registerToken(context, token, force) }
                .addOnFailureListener { err ->
                    Log.w(TAG, "FCM token unavailable. Add app/google-services.json to enable push registration.", err)
                }
        } catch (e: Exception) {
            Log.w(TAG, "Firebase is not configured yet. Add app/google-services.json to enable push notifications.", e)
        }
    }

    fun registerToken(context: Context, token: String, force: Boolean = false) {
        val appContext = context.applicationContext
        val prefs = PreferenceManager.getDefaultSharedPreferences(appContext)
        if (!prefs.getBoolean(MainActivity.PREF_ENABLE_PUSH, true)) return

        val last = prefs.getString(PREF_LAST_TOKEN, null)
        if (!force && last == token) return

        val serverUrl = (prefs.getString(MainActivity.PREF_SERVER_URL, MainActivity.DEFAULT_URL) ?: MainActivity.DEFAULT_URL).trimEnd('/')
        val endpoint = "$serverUrl/push/register"

        thread(name = "fantag-push-register") {
            try {
                val payload = JSONObject().apply {
                    put("token", token)
                    put("platform", "android")
                    put("enabled", true)
                    put("app_version", BuildConfig.VERSION_NAME)
                    put("app_version_code", BuildConfig.VERSION_CODE)
                    put("device_model", "${Build.MANUFACTURER} ${Build.MODEL}".trim())
                    put("sdk_int", Build.VERSION.SDK_INT)
                }

                val conn = (URL(endpoint).openConnection() as HttpURLConnection).apply {
                    requestMethod = "POST"
                    connectTimeout = 10_000
                    readTimeout = 10_000
                    doOutput = true
                    setRequestProperty("Content-Type", "application/json")
                    setRequestProperty("Accept", "application/json")
                    setRequestProperty("User-Agent", "FANTAGAndroid/${BuildConfig.VERSION_NAME}")
                }

                OutputStreamWriter(conn.outputStream, Charsets.UTF_8).use { writer ->
                    writer.write(payload.toString())
                }

                val code = conn.responseCode
                if (code in 200..299) {
                    prefs.edit().putString(PREF_LAST_TOKEN, token).apply()
                    Log.i(TAG, "Registered FCM token with Fantag backend")
                } else {
                    Log.w(TAG, "Backend rejected FCM token registration: HTTP $code at $endpoint")
                }
                conn.disconnect()
            } catch (e: Exception) {
                Log.w(TAG, "Unable to register FCM token with Fantag backend", e)
            }
        }
    }
}
