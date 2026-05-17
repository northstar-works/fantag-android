FANTAG Android b65 resource color fix

Problem fixed:
Android resource linking failed because theme files reference:
- @color/fantag_accent
- @color/fantag_primary_dark

Install:
Copy app/src/main/res/values/colors.xml from this zip into your fantag-android project at:
C:\Users\Sidscri\Documents\GitHub\fantag-android\app\src\main\res\values\colors.xml

Then rebuild:
cd C:\Users\Sidscri\Documents\GitHub\fantag-android
.\scripts\build_debug_apk_windows_UNC_SAFE.ps1

Expected output:
dist\com.northstarlabs.fantag_65.apk

Do not publish if APK is under 1 MB.
