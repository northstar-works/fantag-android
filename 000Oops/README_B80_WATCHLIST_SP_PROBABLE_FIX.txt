FANTAG v3.3.0 b80 watch list + SP probable fix

Changes:
- Watch List now uses the same grouped status-sort display logic as My Roster.
- Watch List uses lineupStatus + schedule fallback so watched players with games are not shown as no-game incorrectly.
- Removed the broad ESPN active SP/P slot probable fallback that incorrectly promoted active SP-only pitchers to probable starters.
- Added schedule overlay from /roster/schedule so MLB probablePitcher data marks true probable SPs like Severino.
- Added mlbId to API.adaptEntry so frontend can match MLB probable pitcher IDs directly.
