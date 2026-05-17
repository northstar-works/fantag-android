# Run this from Windows PowerShell inside C:\Users\<you>\Documents\GitHub\fantag-android
# Edit $SshTarget if your username or host changes.
$ErrorActionPreference = "Stop"
$SshTarget = "sidscri@sidscri-services"
$RemoteTmp = "/tmp/com.northstarlabs.fantag_66.apk"
$RemoteRepo = "/opt/appdata/fdroid/repo/com.northstarlabs.fantag_66.apk"
$Apk = "dist\com.northstarlabs.fantag_66.apk"

if (!(Test-Path $Apk)) { throw "Missing $Apk. Run scripts\build_debug_apk_windows.bat first." }
$size = (Get-Item $Apk).Length
if ($size -lt 1000000) { throw "APK is only $size bytes. Refusing to copy a bad tiny APK." }

scp $Apk "$SshTarget`:$RemoteTmp"
ssh $SshTarget "sudo mkdir -p /opt/appdata/fdroid/repo /opt/appdata/fdroid/metadata && sudo mv $RemoteTmp $RemoteRepo && sudo chown root:root $RemoteRepo && sudo chmod 0644 $RemoteRepo && ls -lah $RemoteRepo"
ssh $SshTarget "cd /opt/appdata/fdroid && fdroid update --create-metadata --verbose && ls -lah /opt/appdata/fdroid/repo | grep -E 'com.northstarlabs.fantag|index'"
