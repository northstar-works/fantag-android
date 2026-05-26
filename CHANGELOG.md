# v2.0.3-b11 - Android wrapper / F-Droid alignment

- Set Android wrapper default `versionName` to `2.0.3-b11`.
- Set local/default Android `versionCode` floor to `89` so F-Droid/devices can update from prior b87/b88 publishes while still showing wrapper build `b11`.
- Updated GitHub Actions F-Droid workflow so `CurrentVersion` comes from the APK as `2.0.3-b11` and `CurrentVersionCode` comes from the monotonic APK `versionCode`.
- Kept the WebView default server URL as `https://fantag.sidneyshelton.com/`.
- Documented web/server target as `3.4.1-b69`; UI/content fixes should come from the live web server, not from bundled Android assets.

# v3.3.0-b78-stable-no-push

- Removed Firebase/FCM push notification code from Android wrapper.
- Removed notification permission/service/toggle/token registration.
- Enabled `buildConfig true` for `BuildConfig.VERSION_NAME`.
- Bumped Android versionCode to 78 and versionName to `3.3.0-b78-stable-no-push`.
- Refreshed launcher icons from the b78 web assets.

# Changelog

## v3.2.9-b65-fdroid1
- Bumped Android `versionCode` to `65` so the APK matches FANTAG build 65 and F-Droid metadata.
- Bumped Android `versionName` to `3.2.9-b65-fdroid1`.
- Changed default launch URL to `http://sidscri.from-tx.com:8010`, the Fantag UI port, instead of the root host.
- Enabled self-hosted HTTP/WebView access for the private LAN/DDNS Fantag server.
- Added private F-Droid deployment files and sanity checks to prevent another 17 KB bad APK from being published.


## v3.2.8-b64-a5 - 2026-05-13

### Added
- Native Android Firebase Cloud Messaging receiver for Fantag lineup alerts.
- Android 13+ notification permission request flow.
- High-priority `Lineup Alerts` notification channel.
- Red/green/blue notification color support for confirmed lineup classifications.
- Push-token registration to Fantag backend endpoint `POST /push/register`.
- Settings toggles for Lineup Push Alerts and manual device registration.
- WebView bridge `window.FantagAndroid` for in-app native alert/register calls.
- `PUSH_NOTIFICATIONS.md` with backend payload and Firebase setup notes.

### Changed
- Updated app version to `3.2.8-b64-a5`, `versionCode 5`.
- Updated Android WebView user-agent to include the app build version.
- Fixed `SettingsActivity` package mismatch that could prevent the app from compiling.
- Push token re-registers when the Fantag server URL changes.

### Security
- Removed plaintext signing-password helper content from the distributable package.
