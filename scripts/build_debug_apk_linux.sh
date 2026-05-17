#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

echo "============================================================"
echo "FANTAG Android - Build Debug APK for Private F-Droid Repo"
echo "============================================================"

rm -rf app/build/outputs/apk
if [[ -x ./gradlew ]]; then
  ./gradlew assembleDebug
else
  gradle assembleDebug
fi

APK="app/build/outputs/apk/debug/app-debug.apk"
if [[ ! -f "$APK" ]]; then
  echo "ERROR: APK was not created at $APK" >&2
  exit 1
fi
SIZE=$(stat -c%s "$APK")
if [[ "$SIZE" -lt 1000000 ]]; then
  echo "ERROR: APK is only $SIZE bytes. Refusing to publish a bad tiny APK." >&2
  exit 1
fi
mkdir -p dist
cp -f "$APK" "dist/com.northstarlabs.fantag_66.apk"
echo "Built: dist/com.northstarlabs.fantag_66.apk"
echo "Size:  $SIZE bytes"
