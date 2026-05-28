Fantag v3.3.0-b82 probable SP + Android F-Droid auto-version fix

What was blocking probable starters:
- b81 still had a real backend blocker in app/services/mlb_stats.py.
- The lineup parser checked only legacy top-level MLB API fields:
  homeProbablePitcher / awayProbablePitcher
- MLB schedule data is commonly returned under:
  teams.home.probablePitcher / teams.away.probablePitcher
- Result: a real scheduled probable starter could be in /roster/schedule but never get saved as DailyPlayerStatus.is_probable_starter.

What changed:
1. app/services/mlb_stats.py
   - Added _probable_pitcher(), _probable_pitcher_id(), and _probable_pitcher_name().
   - All probable starter extraction now checks both MLB API shapes.
   - Probable starter IDs are included in probable_pitcher_ids.
   - Probable starters are inserted into lineup_data even before confirmed lineups post.

2. app/routers/roster.py
   - Fixed /roster/diagnostic unpacking after get_all_lineups_today began returning 3 values.
   - /roster/diagnostic now reports probable_pitcher_ids.
   - /roster/schedule also checks both probablePitcher shapes and falls back across name fields.

3. src/App.jsx
   - Schedule overlay now checks all player team variants, not only player.team.
   - Probable SP matching checks multiple MLB ID fields and name fallback.
   - Schedule-derived probable starter evidence wins over stale daily false rows.

4. app/version.py
   - Bumped to BUILD = 82.

Install Docker/web files:
cd /opt/app
sudo cp /path/to/extracted/src/App.jsx /opt/app/fantag/src/App.jsx
sudo cp /path/to/extracted/app/services/mlb_stats.py /opt/app/fantag/app/services/mlb_stats.py
sudo cp /path/to/extracted/app/routers/roster.py /opt/app/fantag/app/routers/roster.py
sudo cp /path/to/extracted/app/version.py /opt/app/fantag/app/version.py
sudo chown sidscri:media /opt/app/fantag/src/App.jsx /opt/app/fantag/app/services/mlb_stats.py /opt/app/fantag/app/routers/roster.py /opt/app/fantag/app/version.py
sudo chmod 664 /opt/app/fantag/src/App.jsx /opt/app/fantag/app/services/mlb_stats.py /opt/app/fantag/app/routers/roster.py /opt/app/fantag/app/version.py

docker compose build --no-cache fantag-api fantag-ui
docker compose up -d --force-recreate --no-deps fantag-api fantag-ui

Then verify:
curl -s http://127.0.0.1:8011/health
curl -s http://127.0.0.1:8011/roster/diagnostic | python3 -m json.tool | less
curl -s http://127.0.0.1:8011/roster/schedule | python3 -m json.tool | grep -i -A2 -B2 probable

Open UI:
http://sidscri-services:8010/?v=b82-probable-sp-fix
