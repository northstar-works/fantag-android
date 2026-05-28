"""
Debug Router  /debug/*
======================
Diagnostic endpoints for troubleshooting lineup polls and player status.
These run in the API process and call the MLB Stats API directly so you
can see exactly what data comes back, independent of the scheduler.
"""

import asyncio
import logging
from datetime import datetime, date
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import Player, DailyPlayerStatus, FantasyRosterEntry

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/debug", tags=["debug"])

CDT = ZoneInfo("America/Chicago")


def _today_cdt() -> str:
    return datetime.now(CDT).strftime("%Y-%m-%d")


def _run(coro):
    loop = asyncio.new_event_loop()
    try:
        return loop.run_until_complete(coro)
    finally:
        loop.close()


@router.get("/schedule")
def debug_schedule():
    """
    Calls MLB Stats API /schedule for today and returns a summary.
    Shows whether the API is reachable, which games exist, and whether
    lineup data is returned (home_lineup_count > 0 means lineups are posted).

    Usage: GET http://sidscri-services:8011/debug/schedule
    """
    from ..services.mlb_stats import get_daily_schedule

    today = _today_cdt()
    try:
        games = _run(get_daily_schedule(date.fromisoformat(today)))
    except Exception as e:
        return {"error": str(e), "today": today, "games": [], "api_reachable": False}

    summary = []
    for g in games:
        home = g.get("teams", {}).get("home", {}).get("team", {})
        away = g.get("teams", {}).get("away", {}).get("team", {})
        lineups = g.get("lineups", {})
        home_players = lineups.get("homePlayers", [])
        away_players = lineups.get("awayPlayers", [])
        summary.append({
            "gamePk":            g.get("gamePk"),
            "status":            g.get("status", {}).get("detailedState"),
            "gameTime_utc":      g.get("gameDate"),
            "home":              home.get("abbreviation"),
            "home_id":           home.get("id"),
            "away":              away.get("abbreviation"),
            "away_id":           away.get("id"),
            "home_lineup_count": len(home_players),
            "away_lineup_count": len(away_players),
            "home_sample":       [p.get("person", {}).get("fullName") for p in home_players[:3]],
            "away_sample":       [p.get("person", {}).get("fullName") for p in away_players[:3]],
        })

    return {
        "today":        today,
        "api_reachable": True,
        "game_count":   len(games),
        "games":        summary,
    }


@router.get("/player/{name_fragment}")
def debug_player(name_fragment: str, db: Session = Depends(get_db)):
    """
    Show DB state for any player matching the name fragment.
    Shows: team_id, positions, espn_positions, DailyPlayerStatus for today.

    Usage: GET http://sidscri-services:8011/debug/player/norby
           GET http://sidscri-services:8011/debug/player/eovaldi
    """
    today = _today_cdt()
    players = db.query(Player).filter(
        Player.name.ilike(f"%{name_fragment}%")
    ).all()

    result = []
    for p in players:
        entry = db.query(FantasyRosterEntry).filter(
            FantasyRosterEntry.player_id == p.id
        ).first()

        statuses = db.query(DailyPlayerStatus).filter(
            DailyPlayerStatus.player_id == p.id,
        ).order_by(DailyPlayerStatus.date.desc()).limit(3).all()

        result.append({
            "name":          p.name,
            "team":          p.team,
            "team_id":       p.team_id,
            "mlb_id":        p.mlb_id,
            "positions":     p.positions,
            "on_roster":     entry is not None,
            "espn_positions": getattr(entry, "espn_positions", None) if entry else None,
            "statuses": [
                {
                    "date":          s.date,
                    "team_has_game": s.team_has_game,
                    "in_lineup":     s.in_lineup,
                    "game_status":   s.game_status,
                    "game_time":     s.game_time,
                    "opponent":      s.opponent,
                    "fielding_pos":  s.fielding_pos,
                }
                for s in statuses
            ]
        })
    return result


@router.get("/poll-now")
def debug_poll_now(db: Session = Depends(get_db)):
    """
    Runs poll_daily_lineups() directly in this request and returns a summary
    of what was written to the DB. Use this to see if the poll actually works.

    Usage: GET http://sidscri-services:8011/debug/poll-now
    """
    from ..services.scheduler import poll_daily_lineups

    today = _today_cdt()
    before = {
        s.player_id: (s.team_has_game, s.in_lineup)
        for s in db.query(DailyPlayerStatus)
            .filter(DailyPlayerStatus.date == today)
            .all()
    }

    try:
        poll_daily_lineups()
        error = None
    except Exception as e:
        error = str(e)

    db.expire_all()
    after_rows = db.query(DailyPlayerStatus).filter(
        DailyPlayerStatus.date == today
    ).all()

    # Summarise changes
    changed = []
    new_count = 0
    for s in after_rows:
        b = before.get(s.player_id)
        p = db.query(Player).filter(Player.id == s.player_id).first()
        if b is None:
            new_count += 1
            changed.append({
                "name":     p.name if p else s.player_id,
                "change":   "NEW",
                "team_has_game": s.team_has_game,
                "in_lineup":     s.in_lineup,
            })
        elif b != (s.team_has_game, s.in_lineup):
            changed.append({
                "name":    p.name if p else s.player_id,
                "change":  f"{b} → {(s.team_has_game, s.in_lineup)}",
            })

    return {
        "error":       error,
        "today":       today,
        "rows_before": len(before),
        "rows_after":  len(after_rows),
        "new_rows":    new_count,
        "changed":     changed,
    }


@router.get("/schedule-raw")
def debug_schedule_raw():
    """
    Returns the FIRST game from the MLB API with full raw structure.
    Use this to see exactly what fields the API returns so we can
    fix the parser to match the actual response format.
    """
    from ..services.mlb_stats import get_daily_schedule
    today = _today_cdt()
    try:
        games = _run(get_daily_schedule(date.fromisoformat(today)))
    except Exception as e:
        return {"error": str(e)}
    if not games:
        return {"error": "no games returned", "today": today}
    # Return first game in full and MIA game specifically
    mia_game = next((g for g in games
                     if g.get("teams",{}).get("home",{}).get("team",{}).get("id") == 146
                     or g.get("teams",{}).get("away",{}).get("team",{}).get("id") == 146), None)
    return {
        "first_game_keys": list(games[0].keys()),
        "first_game_teams_structure": games[0].get("teams"),
        "first_game_lineups_structure": games[0].get("lineups"),
        "mia_game_teams": mia_game.get("teams") if mia_game else None,
        "mia_game_lineups_keys": list(mia_game.get("lineups", {}).keys()) if mia_game else None,
        "mia_game_first_player": (mia_game.get("lineups", {}).get("homePlayers", [{}]) or [{}])[0] if mia_game else None,
    }


@router.get("/db-inspect")
def db_inspect(db: Session = Depends(get_db)):
    """
    Inspect the actual SQLite DB state to find why Norby has no DailyPlayerStatus rows.
    Returns tracked player count, status row counts, and per-player analysis.
    """
    from ..models import FantasyRosterEntry, PlayerResearch
    from sqlalchemy import text, func

    today = _today_cdt()

    # Count total status rows for today
    total_today = db.execute(
        text("SELECT COUNT(*) FROM daily_player_status WHERE date = :d"),
        {"d": today}
    ).scalar()

    # Count tracked players (have FantasyRosterEntry)
    tracked_count = db.query(FantasyRosterEntry).count()

    # Find ALL tracked players and their status row for today
    entries = (
        db.query(Player, FantasyRosterEntry)
        .join(FantasyRosterEntry, FantasyRosterEntry.player_id == Player.id)
        .all()
    )

    missing = []
    present = []
    for p, e in entries:
        row = db.query(DailyPlayerStatus).filter(
            DailyPlayerStatus.player_id == p.id,
            DailyPlayerStatus.date == today,
        ).first()
        info = {
            "name":    p.name,
            "team":    p.team,
            "team_id": p.team_id,
            "mlb_id":  p.mlb_id,
            "db_id":   p.id,
            "entry_player_id": e.player_id,
            "ids_match": p.id == e.player_id,
        }
        if row is None:
            missing.append(info)
        else:
            present.append({"name": p.name, "team_has_game": row.team_has_game, "in_lineup": row.in_lineup})

    return {
        "today":         today,
        "total_today":   total_today,
        "tracked_count": tracked_count,
        "missing_count": len(missing),
        "present_count": len(present),
        "missing":       missing,
        "present_sample": present[:5],
    }
