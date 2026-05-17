# FANTAG Android Push Notifications

This Android app now supports native Android lineup push notifications for the red/green/blue lineup alert rules.

## What the Android app does

- Requests Android 13+ notification permission.
- Creates a high-priority `Lineup Alerts` notification channel.
- Gets a Firebase Cloud Messaging token when Firebase is configured.
- POSTs the token to the configured Fantag server URL at `/push/register`.
- Displays native notifications from FCM `data` payloads.
- Supports red, green, and blue alert colors.
- Exposes a small WebView bridge named `FantagAndroid` so the web UI can register the device or show a native alert while the app is open.

## Required file not included in this zip

Firebase's `google-services.json` is private to your Firebase project and must not be committed publicly.

Create it in Firebase Console:

1. Create/open a Firebase project.
2. Add Android app package: `com.northstarlabs.fantag`.
3. Download `google-services.json`.
4. Place it at:

```text
app/google-services.json
```

This project conditionally applies the Gradle `com.google.gms.google-services` plugin only when `app/google-services.json` exists. That keeps development builds from failing without your private Firebase file, while real builds automatically enable Firebase config generation when the file is present.

## Backend endpoint expected by the app

The Android app posts to:

```text
POST {Fantag Server URL}/push/register
Content-Type: application/json
```

Payload:

```json
{
  "token": "FCM_DEVICE_TOKEN",
  "platform": "android",
  "enabled": true,
  "app_version": "3.2.8-b64-a5",
  "app_version_code": 5,
  "device_model": "Samsung SM-S...",
  "sdk_int": 35
}
```

## FCM message payload expected by Android

Send FCM data payloads like this:

```json
{
  "type": "lineup_position_alert",
  "alert_color": "red",
  "title": "Josh Jung starting at DH",
  "body": "RED: Jung is confirmed starting at DH instead of an IF/C position.",
  "player_id": "12345",
  "url_path": "/roster"
}
```

Allowed `alert_color` values:

- `red`: not starting, DH, LF, CF, RF, OF
- `green`: IF/C + OF eligible player starts at C, 1B, 2B, 3B, or SS
- `blue`: any other confirmed starting rostered player

## WebView bridge

The web app can call these while running inside the Android shell:

```js
window.FantagAndroid?.registerPushToken();
window.FantagAndroid?.showLineupAlert('red', 'Player not starting', 'RED: Player is confirmed out.', '12345');
```

The bridge is useful for in-app native alerts. True background push still requires the backend to send FCM messages.
