@echo off
setlocal
cd /d "%~dp0"

echo Building FANTAG Android fixed launch build...
echo.
echo This will create:
echo   app\build\outputs\apk\debug\app-debug.apk
echo   app\build\outputs\apk\release\app-release-unsigned.apk, if release build completes
echo   app\build\outputs\bundle\release\app-release.aab, if bundle build completes
echo.

if not exist gradlew.bat (
  echo ERROR: gradlew.bat not found. Run this from the project root.
  pause
  exit /b 1
)

call gradlew.bat clean assembleDebug assembleRelease bundleRelease -PFANTAG_VERSION_CODE=88 -PFANTAG_VERSION_NAME=3.4.1-b88-launchfix
if errorlevel 1 (
  echo.
  echo BUILD FAILED. Copy the error text and send it back.
  pause
  exit /b 1
)

echo.
echo BUILD COMPLETE.
echo Debug APK:   app\build\outputs\apk\debug\app-debug.apk
echo Release APK: app\build\outputs\apk\release\app-release-unsigned.apk
echo AAB:         app\build\outputs\bundle\release\app-release.aab
echo.
pause
