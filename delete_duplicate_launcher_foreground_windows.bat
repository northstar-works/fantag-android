@echo off
cd /d C:\Users\Sidscri\Documents\GitHub\fantag-android
if exist app\src\main\res\drawable\ic_launcher_foreground.png del app\src\main\res\drawable\ic_launcher_foreground.png
REM Keep existing ic_launcher_foreground.xml if present; adaptive icon now points to drawable-nodpi/fantag_icon_full_rounded.png instead.
git status --short
