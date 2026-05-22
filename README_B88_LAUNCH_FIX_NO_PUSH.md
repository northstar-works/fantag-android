# FANTAG Android b88 Launch Fix - No Push

Applied fixes:

1. Fixed app startup crash risk caused by a custom Toolbar being used with a non-NoActionBar Material theme.
   - `Theme.FANTAG` now uses `Theme.Material3.DayNight.NoActionBar`.
   - `windowActionBar` / `windowNoTitle` are explicitly set to disable the decor ActionBar.

2. Added defensive toolbar setup guards in `MainActivity` and `SettingsActivity` so a theme mismatch cannot crash the app before WebView loads.

3. Verified push notification implementation remains disabled/no-op in this source tree. There are no Firebase dependencies, no FCM service declarations, and no POST_NOTIFICATIONS permission added by this patch.

Build note:
- This source package is ready for GitHub Actions or local Android Studio/Gradle build.
- The current offline container cannot download Gradle/Android dependencies, so APK/AAB generation may need to happen in your GitHub Action or Windows Android Studio environment.
