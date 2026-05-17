# FANTAG Android v3.2.9-b66 Stable No-Push Build

This build is intended to prove the Android wrapper launches cleanly from F-Droid before Firebase push notifications are added back.

Changes from b65:

- Bumped Android versionCode to 66.
- Bumped versionName to 3.2.9-b66-stable-no-push.
- Removed Firebase Cloud Messaging dependencies.
- Removed Firebase service registration from AndroidManifest.xml.
- Removed startup push-token registration from MainActivity.
- Kept the WebView wrapper pointed at http://sidscri.from-tx.com:8010.
- Kept cleartext/private HTTP support for your self-hosted Fantag server.

Expected APK name for F-Droid repo:

```text
com.northstarlabs.fantag_66.apk
```

Build from Windows PowerShell:

```powershell
cd "\\SIDSCRI-grab\Users\Sidscri\Documents\GitHub\fantag-android"
.\scripts\build_debug_apk_windows_UNC_SAFE.ps1
```

If the script still names the output `_65.apk`, rename the final built debug APK manually:

```powershell
New-Item -ItemType Directory -Force .\dist | Out-Null
Copy-Item .\app\build\outputs\apk\debug\app-debug.apk .\dist\com.northstarlabs.fantag_66.apk -Force
```

Copy to Ubuntu F-Droid repo:

```powershell
scp .\dist\com.northstarlabs.fantag_66.apk sidscri@sidscri-services:/tmp/com.northstarlabs.fantag_66.apk
```

On Ubuntu:

```bash
cd /opt/appdata/fdroid
sudo rm -f repo/com.northstarlabs.fantag_65.apk repo/com.northstarlabs.fantag_66.apk
sudo cp /tmp/com.northstarlabs.fantag_66.apk repo/com.northstarlabs.fantag_66.apk
sudo chown sidscri:sidscri repo/com.northstarlabs.fantag_66.apk
sudo chmod 664 repo/com.northstarlabs.fantag_66.apk
fdroid update --create-metadata
```

Sanity check:

```bash
ls -lh /opt/appdata/fdroid/repo/com.northstarlabs.fantag_66.apk
file /opt/appdata/fdroid/repo/com.northstarlabs.fantag_66.apk
```

Do not install if the APK is tiny. It should be several MB, not KB.
