$ErrorActionPreference = "Stop"

Write-Host "============================================================"
Write-Host "FANTAG Android - Build Debug APK for Private F-Droid Repo"
Write-Host "============================================================"

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$ProjectRoot = Resolve-Path (Join-Path $ScriptDir "..")
Push-Location $ProjectRoot

try {
    Write-Host "Project root: $ProjectRoot"

    if (Test-Path ".\gradlew.bat") {
        $GradleCmd = ".\gradlew.bat"
        Write-Host "Using project Gradle wrapper: gradlew.bat"
    } elseif (Get-Command gradle -ErrorAction SilentlyContinue) {
        $GradleCmd = "gradle"
        Write-Host "Using system Gradle from PATH"
    } else {
        throw "No Gradle found. Open this project in Android Studio and build APK, or install Gradle with: winget install Gradle.Gradle"
    }

    Write-Host "Cleaning old APK outputs..."
    New-Item -ItemType Directory -Force -Path ".\dist" | Out-Null
    Remove-Item ".\dist\*.apk" -Force -ErrorAction SilentlyContinue

    Write-Host "Building debug APK..."
    & $GradleCmd ":app:assembleDebug"
    if ($LASTEXITCODE -ne 0) { throw "Gradle build failed." }

    $BuiltApk = ".\app\build\outputs\apk\debug\app-debug.apk"
    if (!(Test-Path $BuiltApk)) {
        throw "APK was not found at $BuiltApk"
    }

    $OutApk = ".\dist\com.northstarlabs.fantag_65.apk"
    Copy-Item $BuiltApk $OutApk -Force

    $Apk = Get-Item $OutApk
    Write-Host "APK created: $($Apk.FullName)"
    Write-Host "APK size: $([math]::Round($Apk.Length / 1MB, 2)) MB"

    if ($Apk.Length -lt 1MB) {
        throw "APK is smaller than 1 MB. Refusing to publish because this looks like the bad tiny APK artifact."
    }

    Write-Host "SUCCESS: Build completed. Publish this APK to your private F-Droid repo."
}
finally {
    Pop-Location
}
