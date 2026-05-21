# FANTAG Android v3.3.0-b79 stable-no-push

This is the Android WebView wrapper update aligned to Fantag web/backend build 79.

Changes:
- Keeps Firebase/push notifications removed.
- Keeps browser/app icons and color resources fixes.
- Bumps Android versionCode to 79.
- Bumps versionName to 3.3.0-b79-stable-no-push.

The SP/probable-starter sorting fix is in the web/backend files. The Android app loads the server UI, so update the Docker Fantag service first, then clear Android WebView cache if the old UI persists.
