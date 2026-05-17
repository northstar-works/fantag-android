Fantag Android b65 Duplicate MainActivity Fix
=============================================

Problem:
The project currently has two classes with the exact same Android package/class name:

- app/src/main/kotlin/com/northstarlabs/fantag/MainActivity.kt
- app/src/main/java/com/northstarlabs/fantag/MainActivity.java

Both compile into:
com.northstarlabs.fantag.MainActivity

D8 then fails with:
Type com.northstarlabs.fantag.MainActivity is defined multiple times.

Fix:
Keep the Kotlin MainActivity.kt and move the older duplicate Java MainActivity.java into a backup folder.

How to run:
1. Copy the included scripts folder into:
   C:\Users\Sidscri\Documents\GitHub\fantag-android\

2. Run:

   cd "C:\Users\Sidscri\Documents\GitHub\fantag-android"
   powershell -ExecutionPolicy Bypass -File .\scripts\fix_duplicate_mainactivity_and_build.ps1

What the script does:
- Confirms MainActivity.kt exists
- Moves duplicate MainActivity.java to:
  _backup_removed_duplicate_java_mainactivity\MainActivity.java.YYYYMMDD-HHMMSS.bak
- Runs gradlew.bat clean
- Runs gradlew.bat :app:assembleDebug
- Copies app-debug.apk to:
  dist\com.northstarlabs.fantag_65.apk
- Refuses APKs smaller than 1 MB
