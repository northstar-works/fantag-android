param(
    [string]$ProjectRoot = ""
)

Write-Host "============================================================"
Write-Host "FANTAG Android - Duplicate MainActivity Fix + Clean Rebuild"
Write-Host "============================================================"

if ([string]::IsNullOrWhiteSpace($ProjectRoot)) {
    $ProjectRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
}

Write-Host "Project root: $ProjectRoot"
Push-Location $ProjectRoot

$javaMain = Join-Path $ProjectRoot "app\src\main\java\com\northstarlabs\fantag\MainActivity.java"
$kotlinMain = Join-Path $ProjectRoot "app\src\main\kotlin\com\northstarlabs\fantag\MainActivity.kt"

if (Test-Path $kotlinMain) {
    Write-Host "Kotlin MainActivity found:"
    Write-Host "  $kotlinMain"
} else {
    Write-Host "ERROR: Kotlin MainActivity.kt was not found. Stop before deleting anything."
    Pop-Location
    exit 1
}

if (Test-Path $javaMain) {
    $backupDir = Join-Path $ProjectRoot "_backup_removed_duplicate_java_mainactivity"
    New-Item -ItemType Directory -Force -Path $backupDir | Out-Null

    $stamp = Get-Date -Format "yyyyMMdd-HHmmss"
    $backupFile = Join-Path $backupDir "MainActivity.java.$stamp.bak"

    Write-Host "Duplicate Java MainActivity found. Moving it to backup:"
    Write-Host "  FROM: $javaMain"
    Write-Host "  TO:   $backupFile"

    Move-Item -Force $javaMain $backupFile
} else {
    Write-Host "No duplicate Java MainActivity.java found. Continuing."
}

Write-Host "Cleaning Gradle build folders..."
if (Test-Path ".\gradlew.bat") {
    .\gradlew.bat clean
    if ($LASTEXITCODE -ne 0) { throw "Gradle clean failed." }

    Write-Host "Building debug APK..."
    .\gradlew.bat :app:assembleDebug
    if ($LASTEXITCODE -ne 0) { throw "Gradle build failed." }
} else {
    Write-Host "ERROR: gradlew.bat not found in project root."
    Pop-Location
    exit 1
}

$apk = Join-Path $ProjectRoot "app\build\outputs\apk\debug\app-debug.apk"
$distDir = Join-Path $ProjectRoot "dist"
$distApk = Join-Path $distDir "com.northstarlabs.fantag_65.apk"

if (!(Test-Path $apk)) {
    Write-Host "ERROR: Build completed but APK was not found at:"
    Write-Host $apk
    Pop-Location
    exit 1
}

New-Item -ItemType Directory -Force -Path $distDir | Out-Null
Copy-Item -Force $apk $distApk

$size = (Get-Item $distApk).Length
Write-Host "APK copied to:"
Write-Host "  $distApk"
Write-Host "APK size bytes: $size"

if ($size -lt 1000000) {
    Write-Host "ERROR: APK is under 1 MB. Refusing to treat it as valid."
    Pop-Location
    exit 1
}

Write-Host "SUCCESS: Real APK built and copied to dist."
Pop-Location
