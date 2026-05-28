# Fantag v3.3.0-b85 — restore accurate pending lineup behavior

This update compares against the earlier mostly-working b75 behavior and keeps the newer b82-b84 improvements, but fixes the active-hitter regression.

## Fixes
- Active ESPN-slot hitters with a game today remain Awaiting Lineup until there is real confirmed batting-lineup evidence.
- The UI no longer trusts a bare `lineup_confirmed` flag, because that can be set too early by schedule/probable-SP hydration.
- `/roster/lineup-status` now only marks a team confirmed when there is actual non-pitcher lineup evidence:
  - `in_lineup=True`, or
  - `batting_order` present, or
  - a real non-pitcher `fielding_pos`.
- Preserves the newer probable/confirmed SP matching and Active Relievers grouping.
- Removes visible color-word labels from row tone badges.

## Changed files
- `src/App.jsx`
- `app/routers/roster.py`
- `app/version.py`

## Install
```bash
cd /opt/app

sudo cp /path/to/extracted/src/App.jsx /opt/app/fantag/src/App.jsx
sudo cp /path/to/extracted/app/routers/roster.py /opt/app/fantag/app/routers/roster.py
sudo cp /path/to/extracted/app/version.py /opt/app/fantag/app/version.py

sudo chown sidscri:media /opt/app/fantag/src/App.jsx /opt/app/fantag/app/routers/roster.py /opt/app/fantag/app/version.py
sudo chmod 664 /opt/app/fantag/src/App.jsx /opt/app/fantag/app/routers/roster.py /opt/app/fantag/app/version.py

docker compose build --no-cache fantag-api fantag-ui
docker compose up -d --force-recreate --no-deps fantag-api fantag-ui
```

## Verify
```bash
curl -s http://127.0.0.1:8011/health
docker compose exec fantag-ui sh -lc 'grep -R "vq=85" -n /usr/share/nginx/html/assets 2>/dev/null | head'
curl -s http://127.0.0.1:8011/roster/lineup-status
```

Open:
`http://sidscri-services:8010/?v=b85-roster-pending-restore`
