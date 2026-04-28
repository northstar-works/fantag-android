# FANTAG Android - ProGuard Rules
# WebView with JavaScript interface
-keepclassmembers class * {
    @android.webkit.JavascriptInterface <methods>;
}

# Preference library
-keep class androidx.preference.** { *; }
