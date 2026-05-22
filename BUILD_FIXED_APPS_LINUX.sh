#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
chmod +x ./gradlew
./gradlew clean assembleDebug assembleRelease bundleRelease -PFANTAG_VERSION_CODE=88 -PFANTAG_VERSION_NAME=3.4.1-b88-launchfix
printf '\nBUILD COMPLETE.\nDebug APK: app/build/outputs/apk/debug/app-debug.apk\nRelease APK: app/build/outputs/apk/release/app-release-unsigned.apk\nAAB: app/build/outputs/bundle/release/app-release.aab\n'
