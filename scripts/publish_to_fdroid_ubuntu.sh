#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

APK="dist/com.northstarlabs.fantag_66.apk"
FDROID_ROOT="/opt/appdata/fdroid"
FDROID_REPO="$FDROID_ROOT/repo"
FDROID_META="$FDROID_ROOT/metadata"

if [[ ! -f "$APK" ]]; then
  echo "ERROR: Missing $APK. Run scripts/build_debug_apk_linux.sh first, or copy the Windows-built APK into dist/." >&2
  exit 1
fi
SIZE=$(stat -c%s "$APK")
if [[ "$SIZE" -lt 1000000 ]]; then
  echo "ERROR: $APK is only $SIZE bytes. Refusing to publish a bad tiny APK." >&2
  exit 1
fi

sudo mkdir -p "$FDROID_REPO" "$FDROID_META"
sudo cp -f "$APK" "$FDROID_REPO/com.northstarlabs.fantag_66.apk"
sudo cp -f "fdroid/metadata/com.northstarlabs.fantag.yml" "$FDROID_META/com.northstarlabs.fantag.yml"

cd "$FDROID_ROOT"
fdroid update --create-metadata --verbose

echo "Published Fantag Android v3.2.9-b65-fdroid1 to $FDROID_REPO"
ls -lah "$FDROID_REPO" | grep -E 'com.northstarlabs.fantag|index'
