# Fantag Android b85 F-Droid Update Files

Copy these files into `C:\Users\Sidscri\Documents\GitHub\fantag-android`.

Changed files:

- `.github/workflows/build-and-publish-fdroid.yml`
- `app/build.gradle`
- `fdroid/metadata/com.northstarlabs.fantag.yml`

This is the Android/WebView wrapper update aligned with the Fantag web/Docker b85 roster pending restore fix.

Important notes:

1. The Android app is only the WebView wrapper. The real roster logic is served from your Docker/web Fantag service.
2. This bumps the Android default to `3.3.0-b85` / `versionCode 85`.
3. The workflow auto-publishes future versions using GitHub run number, with a floor of 85, unless you use the manual workflow inputs.
4. The workflow requires stable signing secrets so F-Droid updates do not break from signer mismatch.

Required GitHub repository secrets in `fantag-android`:

- `FDROID_REPO_PAT`
- `FANTAG_KEYSTORE_BASE64`
- `FANTAG_KEYSTORE_PASSWORD`
- `FANTAG_KEY_ALIAS`
- `FANTAG_KEY_PASSWORD`

Install from Windows:

```bat
cd C:\Users\Sidscri\Documents\GitHub\fantag-android

git add .github\workflows\build-and-publish-fdroid.yml app\build.gradle fdroid\metadata\com.northstarlabs.fantag.yml
git commit -m "Update Fantag Android wrapper to b85"
git push
```

After the workflow succeeds:

1. Open F-Droid on the phone.
2. Refresh the Northstar Labs repository.
3. If the installed Fantag app was signed by an older/different key, uninstall it first, then install the new one fresh.
