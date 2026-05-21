# Push notifications disabled in v3.3.0-b78-stable-no-push

This Android build intentionally does **not** include Firebase / FCM push notifications.

Why:
- The previous Android push implementation caused launch/build/runtime problems on devices.
- This build is meant to be a stable WebView wrapper first.

Removed/disabled:
- Firebase dependencies
- Google Services plugin
- `POST_NOTIFICATIONS` permission
- Firebase messaging service registration
- FCM token registration
- Notification settings screen

Files that should not exist in this no-push build:
- `app/src/main/kotlin/com/northstarlabs/fantag/FantagMessagingService.kt`
- `app/src/main/kotlin/com/northstarlabs/fantag/PushRegistrar.kt`
- `app/src/main/kotlin/com/northstarlabs/fantag/FantagNotifications.kt`
- `app/google-services.json`

Push can be rebuilt later in a clean branch after the base Android wrapper launches correctly.
