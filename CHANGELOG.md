# Changelog

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
