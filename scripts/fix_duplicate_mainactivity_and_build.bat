@echo off
setlocal
powershell -ExecutionPolicy Bypass -File "%~dp0fix_duplicate_mainactivity_and_build.ps1"
exit /b %ERRORLEVEL%
