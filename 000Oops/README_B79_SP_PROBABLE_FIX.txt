# FANTAG v3.3.0-b79 SP probable-starter fix

This build removes the bad b75/b76 frontend fallback that treated any SP-only pitcher in an active ESPN SP/P fantasy slot as a probable starter.

Correct behavior:
- Today's Probable / Confirmed Starting Pitchers only includes confirmed SPs or pitchers with authoritative probable starter evidence from backend/MLB/RotoWire/ESPN probable-pitcher fields.
- Active ESPN fantasy SP/P slot no longer creates probable SP status by itself.
- Non-probable SPs with a game today remain in Other Pitchers as SP Available.
- Active Relievers sorting remains intact.

After copying files, rebuild only Fantag:
cd /opt/app
docker compose build --no-cache fantag-api fantag-ui
docker compose up -d --force-recreate --no-deps fantag-api fantag-ui

Then force refresh with ?v=b79-sp-probable-fix
