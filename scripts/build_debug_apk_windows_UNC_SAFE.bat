@echo off
setlocal
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0build_debug_apk_windows_UNC_SAFE.ps1"
exit /b %ERRORLEVEL%
