FANTAG v3.3.0-b83 — Awaiting lineup red-regression fix

Fixes a b82 UI regression where active position players with games today were being marked red as ACTIVE — NOT STARTING before their actual team lineup was confirmed.

Changed files:
- src/App.jsx
- app/version.py

What changed:
- Added isLineupConfirmedForPlayer() helper.
- getDisplayStatus() now only returns Confirmed Out when the player row/team lineup is explicitly confirmed.
- playerSlotScore() uses the same confirmed-lineup helper.
- Removed the frontend shortcut that treated any team with one player already marked in-lineup as a fully confirmed team.
- Bumped frontend/backend display build to 83.

Expected behavior:
- Active-slot hitters with a game today but no confirmed lineup remain blue / Awaiting Lineup.
- They only move red when the lineup is truly confirmed and they are not starting.
- Confirmed starters remain green.
- DH or IF-slot-to-OF alerts remain red.
