# FANTAG Android v3.3.0-b78 stable-no-push

This Android wrapper intentionally removes Firebase/FCM push notification code so the app can launch reliably on devices while push is reworked later.

## Files changed/important

- `app/build.gradle`
  - versionCode `78`
  - versionName `3.3.0-b78-stable-no-push`
  - no Firebase dependencies
  - no Google Services plugin
  - `buildConfig true` enabled because MainActivity uses `BuildConfig.VERSION_NAME`

- `app/src/main/AndroidManifest.xml`
  - no `POST_NOTIFICATIONS` permission
  - no Firebase messaging service

- Removed/absent Kotlin push files:
  - `FantagMessagingService.kt`
  - `PushRegistrar.kt`
  - `FantagNotifications.kt`

- `app/src/main/kotlin/com/northstarlabs/fantag/FantagAndroidBridge.kt`
  - `registerPushToken()` is now a safe no-op
  - `showLineupAlert()` uses a local Toast only

- `app/src/main/kotlin/com/northstarlabs/fantag/MainActivity.kt`
  - does not request notification permission
  - does not create notification channels
  - does not register FCM tokens
  - loads `http://sidscri.from-tx.com:8010` by default

- `app/src/main/kotlin/com/northstarlabs/fantag/SettingsActivity.kt`
  - no push registration calls
  - version summary updated

- `app/src/main/res/xml/preferences.xml`
  - no notification/push settings

- `app/src/main/res/mipmap-*`
  - launcher icons refreshed from the b78 web icon asset

## Build

```bash
cd fantag-android
gradle --no-daemon assembleDebug
```

Or in Android Studio: open `fantag-android`, sync Gradle, then Build APK.
