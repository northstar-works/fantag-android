Fantag Android b65 BuildConfig fix

Problem fixed:
- Kotlin compile fails with unresolved reference: BuildConfig
- AGP 8.x does not always generate BuildConfig unless buildFeatures.buildConfig = true

Install:
1. Copy app/build.gradle into:
   C:\Users\Sidscri\Documents\GitHub\fantag-android\app\build.gradle

2. Optional warning cleanup: add this line to the root gradle.properties:
   android.suppressUnsupportedCompileSdk=35

3. Rebuild:
   cd C:\Users\Sidscri\Documents\GitHub\fantag-android
   powershell -ExecutionPolicy Bypass -File .\scripts\build_debug_apk_windows_UNC_SAFE.ps1

Expected result:
- :app:compileDebugKotlin should pass the BuildConfig error.
- If another error appears, use the next build log; this means we have moved to the next real issue.
