# FANTAG Android shell v2.0.7-b15 — web v3.5.0-b97 quick actions

This patch updates the Android WebView shell to expose the major web GUI features added through FANTAG web/docker v3.5.0-b97.

## What was added in the web app

- Compare Players: roster toolbar button enables compare mode, lets you select 2-3 roster/watch players, then opens a full-season comparison table. Backend endpoint: `/api/roster/compare/players`.
- Find Players: roster toolbar button opens a position-need finder for C/1B/2B/3B/SS/IF/OF/DH. It ranks available FANTAG database players not already on your roster/watch list. Backend endpoints: `/api/discover/recommend` and `/api/discover/recommend-ai`.
- Available pickup ranking: candidates show L7/L14/L30 starts, games/starts, platoon AVG vs RHP/LHP, DH days, and AI recommendation when an API key is configured.
- Watch-list sync/read features remain backend/web features through ESPN endpoints.

## Important limitation

Current Find Players means available inside FANTAG's player database minus your roster/watch list. It is not yet true ESPN league free agents/waivers across all teams unless ESPN league free-agent/waiver endpoints are added later.

## Android shell change

The Android shell remains a WebView wrapper. It now adds a native quick-action row under the top toolbar:

- Roster
- Watch
- Find
- Compare
- Add
- Status

These buttons drive the web UI with JavaScript clicks instead of duplicating the backend logic in Kotlin.

## Version

- Android shell: `2.0.7-b15`
- Default versionCode: `93`
- Web target label: `v3.5.0-b97`
- Default URL: `https://fantag.sidneyshelton.com/`

## Files changed

- `app/build.gradle`
- `app/src/main/kotlin/com/northstarlabs/fantag/MainActivity.kt`
- `app/src/main/kotlin/com/northstarlabs/fantag/SettingsActivity.kt`
- `app/src/main/res/layout/activity_main.xml`
- `app/src/main/res/values/colors.xml`

## Install

Copy these files into the root of your `fantag-android` repo, build the APK, then publish the APK to your self-hosted F-Droid repo.
