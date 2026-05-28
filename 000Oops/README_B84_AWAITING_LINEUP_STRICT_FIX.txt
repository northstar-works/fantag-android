Fantag v3.3.0-b84 — Awaiting Lineup Strict Fix

Why this exists:
- b83 still allowed broad team-level lineup-confirmed data to turn active ESPN-slot hitters red before the individual/team lineup source was truly confirmed.
- That made players with games later today show as ACTIVE - NOT STARTING / OUT when they should still be Awaiting Lineup.

What changed:
- src/App.jsx
  - APP_BUILD bumped to 84.
  - isLineupConfirmedForPlayer() no longer falls back to broad teamsWithLineup membership.
  - A hitter only becomes Confirmed Out / Active Not Starting when that row/source has explicit confirmed lineup evidence.
  - Active hitters with games but no explicit confirmed lineup stay Lineup Pending / Awaiting lineup.
  - Removed visible RED / GREEN / BLUE wording from line tone badges.
  - Renamed status-sort grouping labels from Red Status / Awaiting Blue to Alerts / Awaiting Lineup.
- app/version.py
  - BUILD bumped to 84.

Install:
cd /opt/app
sudo cp /path/to/extracted/src/App.jsx /opt/app/fantag/src/App.jsx
sudo cp /path/to/extracted/app/version.py /opt/app/fantag/app/version.py
sudo chown sidscri:media /opt/app/fantag/src/App.jsx /opt/app/fantag/app/version.py
sudo chmod 664 /opt/app/fantag/src/App.jsx /opt/app/fantag/app/version.py
docker compose build --no-cache fantag-ui fantag-api
docker compose up -d --force-recreate --no-deps fantag-ui fantag-api

Verify:
curl -s http://127.0.0.1:8011/health
docker compose exec fantag-ui sh -lc 'grep -R "vq=84" -n /usr/share/nginx/html/assets 2>/dev/null | head'

Open:
http://sidscri-services:8010/?v=b84-awaiting-lineup-strict
