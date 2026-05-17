@echo off
setlocal
cd /d "%~dp0\.."

echo ============================================================
echo FANTAG Android - Build Debug APK for Private F-Droid Repo
echo ============================================================

echo Cleaning old APK outputs...
if exist app\build\outputs\apk rmdir /s /q app\build\outputs\apk

echo Building debug APK...
call gradlew.bat assembleDebug
if errorlevel 1 (
  echo.
  echo Build failed. Open the project in Android Studio once, let Gradle sync,
  echo then retry this script.
  exit /b 1
)

set APK=app\build\outputs\apk\debug\app-debug.apk
if not exist "%APK%" (
  echo ERROR: APK was not created at %APK%
  exit /b 1
)

for %%A in ("%APK%") do set APK_SIZE=%%~zA
if %APK_SIZE% LSS 1000000 (
  echo ERROR: APK is only %APK_SIZE% bytes. Refusing to publish a bad tiny APK.
  exit /b 1
)

if not exist dist mkdir dist
copy /y "%APK%" "dist\com.northstarlabs.fantag_66.apk" >nul

echo.
echo Built: dist\com.northstarlabs.fantag_66.apk
echo Size:  %APK_SIZE% bytes
echo.
echo Next: copy dist\com.northstarlabs.fantag_66.apk to /opt/appdata/fdroid/repo/
endlocal
