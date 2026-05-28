FANTAG v3.3.0-b78 — built from uploaded b77 Full Version

This package keeps the b77 browser favicon / Android web shortcut icon setup intact.

Changes from b77:
- Updated build number to b78
- Replaced the top-left basic FT/FANTAG text header with the corrected banner image
- Added/updated corrected full-text banner files under /logos and /public/logos
- Rebuilt logos.zip inside the project with corrected banner files

Copy over the full fantag folder or copy these changed files:
- src/App.jsx
- app/version.py
- logos/banner-1024x392.png
- logos/banner-512x196.png
- logos/banner-320x122.png
- public/logos/banner-1024x392.png
- public/logos/banner-512x196.png
- public/logos/banner-320x122.png
- logos.zip

Rebuild:
cd /opt/app
docker compose build --no-cache fantag-api fantag-ui
docker compose up -d --force-recreate --no-deps fantag-api fantag-ui

Open with cache buster:
http://sidscri-services:8010/?v=b78-from-b77-banner
