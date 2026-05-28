#!/usr/bin/env python3
"""
seed.py — populates the Player table from the MLB Stats API.

Uses the 40-man roster so IL players (e.g. Ha-Seong Kim) are included.

Usage:
    docker exec -it fantag-api python seed.py
"""

import asyncio
import sys
import os

sys.path.insert(0, "/app")

from app.database import Base, engine, SessionLocal
from app.models import Player
from app.services.mlb_stats import get_all_teams, get_team_roster, parse_player_from_roster_entry


async def seed():
    print("Creating tables...")
    Base.metadata.create_all(bind=engine)

    print("Fetching MLB teams...")
    teams = await get_all_teams()
    print(f"  Found {len(teams)} teams\n")

    db = SessionLocal()
    added = updated = skipped = il_count = 0

    for team in teams:
        team_id   = team.get("id")
        team_abbr = team.get("abbreviation", "UNK")
        team_name = team.get("name", "")

        try:
            roster = await get_team_roster(team_id)
        except Exception as e:
            print(f"  ✗  {team_abbr}: {e}")
            continue

        team_il = 0
        for entry in roster:
            data = parse_player_from_roster_entry(entry)
            if not data.get("mlb_id"):
                skipped += 1
                continue

            il_status = data.pop("_il_status", "")
            is_il = "injured" in il_status.lower() or "il" in il_status.lower()
            if is_il:
                team_il += 1
                il_count += 1

            data["team"]    = team_abbr
            data["team_id"] = team_id
            data["active"]  = True

            existing = db.query(Player).filter(Player.mlb_id == data["mlb_id"]).first()
            if existing:
                for k, v in data.items():
                    setattr(existing, k, v)
                updated += 1
            else:
                db.add(Player(**data))
                added += 1

        db.commit()
        il_note = f" ({team_il} on IL)" if team_il else ""
        print(f"  ✓  {team_abbr} ({team_name}): {len(roster)} players{il_note}")

    db.close()
    print(f"\nDone. Added: {added}  Updated: {updated}  Skipped: {skipped}")
    print(f"IL players included: {il_count}")
    print("\nAll IL players are now searchable and can be added to your roster/watch list.")


if __name__ == "__main__":
    asyncio.run(seed())
