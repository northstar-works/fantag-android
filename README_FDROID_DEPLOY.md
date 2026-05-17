# Fantag Android private F-Droid deploy: v3.2.9-b65-fdroid1

This package resets the Android wrapper to a clean, sane private-F-Droid build.

## What changed

- Android app version is now `3.2.9-b65-fdroid1`.
- Android `versionCode` is now `65`, matching Fantag build 65.
- Default server URL is now `http://sidscri.from-tx.com:8010`, the Fantag UI port.
- Cleartext HTTP is allowed for your private self-hosted Fantag URL/LAN use.
- Scripts refuse to publish any APK under 1 MB, which should prevent another 17 KB broken APK from going into the repo.

## Copy into your project

Copy the contents of this folder over:

`C:\Users\<you>\Documents\GitHub\fantag-android`

Do not copy old `.gradle`, `.idea`, or `app/build` folders back in.

## Build on Windows

From PowerShell or Command Prompt:

```bat
cd %USERPROFILE%\Documents\GitHub\fantag-android
scripts\build_debug_apk_windows.bat
```

Expected output:

`dist\com.northstarlabs.fantag_65.apk`

The APK should be multiple MB. If it is tiny, do not publish it.

## Publish to your Ubuntu F-Droid repo

From Windows PowerShell after building:

```powershell
cd $env:USERPROFILE\Documents\GitHub\fantag-android
.\scripts\copy_apk_to_services_vm_from_windows.ps1
```

Or, if building directly on Ubuntu:

```bash
cd /path/to/fantag-android
./scripts/build_debug_apk_linux.sh
./scripts/publish_to_fdroid_ubuntu.sh
```

## Phone install sanity

Because this build uses a new/fixed `versionCode` and may use a different signature from a bad previous build, uninstall the existing Fantag app first if Android refuses to update it.

Then refresh the private F-Droid repo on the phone and install `FANTAG` version `3.2.9-b65-fdroid1`.

## Server URL

The default URL is:

`http://sidscri.from-tx.com:8010`

You can change it in the Android app menu: Settings → FANTAG Server URL.
