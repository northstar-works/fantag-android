# FANTAG Android

Native Android WebView wrapper for the FANTAG fantasy baseball roster tracker.

## Requirements
- Android Studio Hedgehog (2023.1.1) or newer
- JDK 17
- Android SDK 35 (target), SDK 26 minimum (Android 8.0+)
- Your FANTAG server running (Docker Compose on Ubuntu-Services)

## Build

1. Open this folder in Android Studio (`File → Open`)
2. Let Gradle sync
3. Build → Generate Signed APK (or Build → Build APK for debug)

## Install

```bash
# Debug APK (sideload)
adb install app/build/outputs/apk/debug/app-debug.apk

# Or use Android Studio's Run button for a connected device/emulator
```

## Configuration

On first launch the app connects to:
```
https://fantag.sidneyshelton.com/
```

To change the server URL: **overflow menu → Settings → FANTAG Server URL**

### Local Network Access

If you want to use a local IP (e.g. `http://192.168.1.100:8011`) instead of the tplinkdns domain:

1. Open `app/src/main/res/xml/network_security_config.xml`
2. Add your server IP to the `<domain-config>` section:
   ```xml
   <domain includeSubdomains="false">192.168.1.100</domain>
   ```
3. Rebuild

## Features

- ⚾ Full FANTAG web UI in a native Android shell
- 🔄 Pull-to-refresh
- ← Back navigation (WebView history aware)
- 📡 Offline / error state with retry
- 📷 File chooser for screenshot imports (camera + gallery)
- ⚙️ Configurable server URL (persisted in SharedPreferences)
- 🗑️ Clear cache option in Settings
- Dark theme matching FANTAG's slate color scheme
- 🚦 Red/green/blue confirmed-lineup alert color support
- Native Android WebView wrapper versioning for F-Droid display
- Web/server content loaded from the live FANTAG server

## Version

Android wrapper: `2.0.6-b14`

Web/server target loaded by the wrapper: `3.4.4-b72`

F-Droid should display the Android wrapper version, not the web/server version. Devices update by Android `versionCode`, which is kept monotonic by the workflow.

## Distribution

GitHub Actions builds this repo, copies the APK into `northstar-works/fdroid`, and updates `metadata/com.northstarlabs.fantag.yml`. The APK filename is generated from the actual APK package/versionCode, for example `com.northstarlabs.fantag_89.apk`.


## Push Notifications

Push notifications are intentionally disabled in this stable no-push build.


## v3.3.0-b78 stable-no-push

Firebase/FCM push notification code is removed/disabled in this build so the Android wrapper launches reliably while push is rebuilt later.
