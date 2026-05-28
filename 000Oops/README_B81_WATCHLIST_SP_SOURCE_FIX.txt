# FANTAG v3.3.0-b81 Watch List + Probable SP Source Fix

Fixes in this build:

- Watch List uses the same lineup/schedule-aware grouping as My Roster.
- Watch List now applies schedule overlays with MLB team-abbreviation aliases.
- Fixes players incorrectly showing no game when team abbreviation variants differ.
- Fixes probable SP matching when source abbreviations use ATH/OAK, AZ/ARI, CWS/CHW, etc.
- Luis Severino-type cases are matched by MLB probablePitcher ID/name plus team-alias matching, not fantasy slot guessing.
- Removed broad ESPN active SP/P fallback remains removed; active fantasy slot does not equal real probable starter.

Changed files:
- src/App.jsx
- app/routers/roster.py
- app/version.py

Install changed files into /opt/app/fantag, rebuild fantag-api and fantag-ui with --no-deps.
