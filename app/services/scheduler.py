"""
Scheduler — APScheduler nightly/daily jobs.
Updated to use new get_all_lineups_today() which returns (lineups, team_contexts).
"""

import asyncio
import logging
from datetime import date, timedelta, datetime, timezone

from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.cron import CronTrigger
from sqlalchemy.orm import Session, joinedload

from ..config import settings
from ..database import SessionLocal
from ..models import (
    Player, FantasyRosterEntry, DailyPlayerStatus,
    PlayerUsageStat, PlayerStatus, RosterStatus, PlayerNotification, EventLog, PlayerPositionEvent,
)

logger = logging.getLogger(__name__)
scheduler = BackgroundScheduler(timezone="America/Chicago")

from zoneinfo import ZoneInfo
_CDT = ZoneInfo("America/Chicago")

def _cdt_today() -> str:
    """Return today's date string in CDT — avoids UTC midnight drift."""
    return datetime.now(_CDT).date().isoformat()


def _run_async(coro):
    loop = asyncio.new_event_loop()
    try:
        return loop.run_until_complete(coro)
    finally:
        loop.close()



def _record_position_event(db: Session, player: Player, row_date: str, fields: dict, source: str = "fantag"):
    """Upsert one player/date position-event row used by Player Detail history."""
    try:
        existing = (
            db.query(PlayerPositionEvent)
            .filter(PlayerPositionEvent.player_id == player.id, PlayerPositionEvent.date == row_date)
            .first()
        )
        status = fields.get("status")
        status_value = getattr(status, "value", status)
        data = {
            "source": source or "fantag",
            "status": status_value,
            "in_lineup": bool(fields.get("in_lineup", False)),
            "fielding_pos": fields.get("fielding_pos"),
            "batting_order": fields.get("batting_order"),
            "opponent": fields.get("opponent"),
            "sp_hand": fields.get("sp_hand"),
            "sp_name": fields.get("sp_name"),
            "game_id": fields.get("game_id"),
            "game_status": fields.get("game_status"),
            "lineup_confirmed": bool(fields.get("lineup_confirmed", False)),
            "team_has_game": bool(fields.get("team_has_game", False)),
        }
        if existing:
            for k, v in data.items():
                setattr(existing, k, v)
        else:
            db.add(PlayerPositionEvent(player_id=player.id, date=row_date, **data))
    except Exception as exc:
        logger.warning("position event write failed for %s: %s", getattr(player, "name", player.id), exc)


# ── Lineup-position alert classification ───────────────────────────────────
INFIELD_CATCHER_POS = {"C", "1B", "2B", "3B", "SS"}
OUTFIELD_POS = {"OF", "LF", "CF", "RF"}
DH_POS = {"DH"}

def _norm_pos(value):
    return str(value or "").strip().upper()

def _effective_espn_positions(entry, player):
    raw = getattr(entry, "espn_positions", None) or getattr(player, "positions", None) or []
    return {_norm_pos(x) for x in raw if _norm_pos(x)}

def _lineup_alert_for(entry, status_row):
    """
    Classify the first confirmed lineup result for a rostered hitter.

    RED   = rostered player is not starting, or is starting at DH/OF.
    GREEN = player has both IF/C and OF eligibility and is starting at IF/C.
    BLUE  = every other confirmed starting hitter.
    """
    player = entry.player
    if not player or not status_row or entry.status != RosterStatus.roster:
        return None

    elig = _effective_espn_positions(entry, player)
    # Skip pitchers for this hitter/field-position alert set.
    if elig and elig.issubset({"P", "SP", "RP", "CP"}):
        return None

    if not bool(getattr(status_row, "team_has_game", False)) or not bool(getattr(status_row, "lineup_confirmed", False)):
        return None

    actual_pos = _norm_pos(getattr(status_row, "fielding_pos", None))
    has_if = bool(elig & INFIELD_CATCHER_POS)
    has_of = bool(elig & OUTFIELD_POS)

    if not bool(getattr(status_row, "in_lineup", False)):
        return {
            "alert_color": "red",
            "alert_type": "not_starting",
            "message": f"{player.name} is NOT starting today.",
        }

    if actual_pos in (OUTFIELD_POS | DH_POS):
        pos_label = actual_pos or "OF/DH"
        return {
            "alert_color": "red",
            "alert_type": "starting_of_or_dh",
            "message": f"{player.name} is starting at {pos_label}, not IF/C.",
        }

    if has_if and has_of and actual_pos in INFIELD_CATCHER_POS:
        return {
            "alert_color": "green",
            "alert_type": "dual_if_of_starting_if",
            "message": f"{player.name} is dual IF/OF eligible and is starting at {actual_pos}.",
        }

    if bool(getattr(status_row, "in_lineup", False)):
        return {
            "alert_color": "blue",
            "alert_type": "confirmed_starting",
            "message": f"{player.name} is confirmed starting{(' at ' + actual_pos) if actual_pos else ''}.",
        }

    return None

def _already_logged_lineup_alert(db: Session, player_id: int, row_date: str, alert_type: str) -> bool:
    rows = (
        db.query(EventLog)
        .filter(EventLog.event_type == "lineup_position_alert", EventLog.player_id == player_id)
        .order_by(EventLog.created_at.desc())
        .limit(20)
        .all()
    )
    for row in rows:
        payload = row.payload or {}
        if payload.get("date") == row_date and payload.get("alert_type") == alert_type:
            return True
    return False

def _emit_lineup_position_alerts(db: Session, row_date: str) -> int:
    """Create one in-app alert immediately when a confirmed lineup first classifies a rostered player."""
    entries = (
        db.query(FantasyRosterEntry)
        .options(joinedload(FantasyRosterEntry.player))
        .filter(FantasyRosterEntry.status == RosterStatus.roster)
        .all()
    )
    fired = 0
    for entry in entries:
        status_row = (
            db.query(DailyPlayerStatus)
            .filter(DailyPlayerStatus.player_id == entry.player_id, DailyPlayerStatus.date == row_date)
            .first()
        )
        alert = _lineup_alert_for(entry, status_row)
        if not alert:
            continue
        if _already_logged_lineup_alert(db, entry.player_id, row_date, alert["alert_type"]):
            continue
        payload = {
            **alert,
            "date": row_date,
            "rule_type": "lineup_position_alert",
            "channel": "in_app",
            "fielding_pos": getattr(status_row, "fielding_pos", None),
            "batting_order": getattr(status_row, "batting_order", None),
            "lineup_confirmed": bool(getattr(status_row, "lineup_confirmed", False)),
            "in_lineup": bool(getattr(status_row, "in_lineup", False)),
            "eligible_positions": sorted(_effective_espn_positions(entry, entry.player)),
        }
        db.add(EventLog(event_type="lineup_position_alert", player_id=entry.player_id, payload=payload))
        db.add(EventLog(event_type="notification_fired", player_id=entry.player_id, payload=payload))
        fired += 1
    if fired:
        db.commit()
    return fired


def poll_daily_lineups(target_date: str | None = None):
    """
    Poll MLB lineup data and write to DailyPlayerStatus.
    target_date: YYYY-MM-DD string. Defaults to today (CDT).
                 Pass a past date to backfill / correct historical records.
    """
    from ..services.mlb_stats import get_all_lineups_today
    is_historical = target_date is not None
    logger.info("poll_daily_lineups: starting%s", f" (backfill {target_date})" if is_historical else "")
    db: Session = SessionLocal()
    try:
        today = target_date if target_date else _cdt_today()
        from datetime import date as _date2

        # ── Stale-row cleanup (today-only — skip for historical backfills) ────────
        if not is_historical:
            yesterday = (_date2.fromisoformat(today) - timedelta(days=1)).isoformat()
            stale_count = (
                db.query(DailyPlayerStatus)
                .filter(
                    DailyPlayerStatus.date == yesterday,
                    DailyPlayerStatus.team_has_game == True,
                    DailyPlayerStatus.game_status.notin_(["Final", "Game Over", "Completed Early"]),
                )
                .update(
                    {"team_has_game": False, "game_status": "Final"},
                    synchronize_session=False,
                )
            )
            if stale_count:
                db.commit()
                logger.info("poll_daily_lineups: cleared %d stale yesterday rows", stale_count)

        lineup_data, team_contexts, probable_pitcher_ids = _run_async(
            get_all_lineups_today(_date2.fromisoformat(today))
        )

        # Build mlb_id → player lookup FIRST (needed for GUMBO coverage check)
        all_players = db.query(Player).filter(Player.active == True).all()
        mlb_to_player = {p.mlb_id: p for p in all_players}

        # GUMBO fallback: for any game where /schedule lineups returned empty,
        # fetch the live game feed which has battingOrder once lineup is official
        from ..services.mlb_stats import get_live_game_lineups, get_daily_schedule
        from datetime import date as _date
        games_today = _run_async(get_daily_schedule(_date.fromisoformat(today)))

        # Build a simple set of all team abbreviations playing today
        # Used as authoritative fallback when team_id lookup misses (new players)
        playing_abbrs_today = set()
        playing_ids_today   = set()
        game_context_by_abbr = {}
        for _g in games_today:
            _game_dt = _g.get("gameDate", "")
            try:
                _dt_utc = datetime.fromisoformat(_game_dt.replace("Z", "+00:00"))
                _game_time = _dt_utc.astimezone(_CDT).strftime("%-I:%M %p CDT")
            except Exception:
                _game_time = ""
            _status = _g.get("status", {}).get("detailedState", "Scheduled")
            _venue = _g.get("venue", {}).get("name", "")
            _home = _g.get("teams", {}).get("home", {}).get("team", {})
            _away = _g.get("teams", {}).get("away", {}).get("team", {})
            _home_abbr, _away_abbr = _home.get("abbreviation"), _away.get("abbreviation")
            if _home_abbr:
                game_context_by_abbr[_home_abbr] = {"in_lineup": False, "batting_order": None, "fielding_pos": None, "sp_hand": None, "sp_name": None, "opponent": ("vs " + (_away_abbr or "")).strip(), "game_id": _g.get("gamePk"), "game_time": _game_time, "game_status": _status, "venue_name": _venue, "is_dome": _home_abbr in {"ARI","HOU","MIA","MIL","SEA","TB","TEX","TOR"}, "team_has_game": True, "lineup_confirmed": False, "is_probable_starter": False, "ip_pitched": None}
            if _away_abbr:
                game_context_by_abbr[_away_abbr] = {"in_lineup": False, "batting_order": None, "fielding_pos": None, "sp_hand": None, "sp_name": None, "opponent": ("@ " + (_home_abbr or "")).strip(), "game_id": _g.get("gamePk"), "game_time": _game_time, "game_status": _status, "venue_name": _venue, "is_dome": _home_abbr in {"ARI","HOU","MIA","MIL","SEA","TB","TEX","TOR"}, "team_has_game": True, "lineup_confirmed": False, "is_probable_starter": False, "ip_pitched": None}
            for _side in ("home", "away"):
                _t = _g.get("teams", {}).get(_side, {}).get("team", {})
                if _t.get("abbreviation"):
                    playing_abbrs_today.add(_t["abbreviation"])
                if _t.get("id"):
                    playing_ids_today.add(_t["id"])

        for game in games_today:
            game_pk    = game.get("gamePk")
            if not game_pk:
                continue
            game_status = game.get("status", {}).get("detailedState", "")
            is_live_or_final = any(s in game_status for s in
                                   ("Progress", "Final", "Game Over", "Warmup", "Pre-Game"))
            home_id = game.get("teams", {}).get("home", {}).get("team", {}).get("id")
            away_id = game.get("teams", {}).get("away", {}).get("team", {}).get("id")

            # Always use GUMBO for in-progress/final games — it has actual batting order
            # and played position, which the /schedule lineups endpoint often omits.
            # For not-yet-started games, only use GUMBO as fallback when schedule gave nothing.
            schedule_has_lineup = any(
                mlb_to_player.get(pid) and mlb_to_player[pid].team_id in (home_id, away_id)
                for pid in lineup_data
            )
            if is_live_or_final or not schedule_has_lineup:
                gumbo_lineups = _run_async(get_live_game_lineups(game_pk))
                if gumbo_lineups:
                    lineup_data.update(gumbo_lineups)
                    logger.info("GUMBO %s: enriched %d players from game %s",
                                "override" if is_live_or_final else "fallback",
                                len(gumbo_lineups), game_pk)

        # Get all tracked players
        tracked = (
            db.query(Player, FantasyRosterEntry)
            .join(FantasyRosterEntry, FantasyRosterEntry.player_id == Player.id)
            .all()
        )

        # Public lineup-page fallback. RotoWire can confirm lineups before MLB Stats API.
        external_confirmed_abbrs = set()
        external_source_hits = []
        if not is_historical:
            try:
                from ..routers.settings import _get_setting
                from ..services.external_lineups import fetch_external_lineup_overlay
                primary_source = _get_setting(db, "lineup_source_primary", "rotowire")
                external_enabled = bool(_get_setting(db, "lineup_external_enabled", True))
                external = _run_async(fetch_external_lineup_overlay(all_players, game_context_by_abbr, _date2.fromisoformat(today), primary_source=primary_source, enabled=external_enabled))
                external_source_hits = external.source_hits
                if external.lineups:
                    lineup_data.update(external.lineups)
                    logger.info("external lineup overlay (%s): matched %d starters", primary_source, len(external.lineups))
                if external.confirmed_team_abbrs:
                    external_confirmed_abbrs = set(external.confirmed_team_abbrs)
                    for _abbr in external_confirmed_abbrs:
                        if _abbr in game_context_by_abbr:
                            game_context_by_abbr[_abbr]["lineup_confirmed"] = True
                            game_context_by_abbr[_abbr]["lineup_source"] = primary_source
                    logger.info("external lineup overlay (%s): confirmed teams=%s", primary_source, sorted(external_confirmed_abbrs))
            except Exception:
                logger.exception("external lineup overlay failed")

        updated = 0
        errors  = 0

        for player, roster_entry in tracked:
            if not player.mlb_id:
                continue

            try:
                # ── Determine game context for this player ──────────────────────
                team_plays = (
                    (player.team_id and player.team_id in team_contexts)
                    or (player.team_id and player.team_id in playing_ids_today)
                    or (player.team and player.team in playing_abbrs_today)
                )

                if player.mlb_id in lineup_data:
                    info       = lineup_data[player.mlb_id]
                    new_status = PlayerStatus.starting
                elif team_plays:
                    abbr_ctx = game_context_by_abbr.get(player.team) if player.team else None
                    id_ctx = team_contexts.get(player.team_id) if player.team_id else None
                    info = (abbr_ctx if (abbr_ctx and abbr_ctx.get("lineup_confirmed")) else None) or id_ctx or abbr_ctx or {
                        "in_lineup": False, "batting_order": None, "fielding_pos": None,
                        "sp_hand": None, "sp_name": None, "opponent": None,
                        "game_id": None, "game_time": None, "game_status": "Scheduled",
                        "venue_name": None, "is_dome": False, "team_has_game": True,
                        "lineup_confirmed": False, "is_probable_starter": False,
                        "ip_pitched": None,
                    }
                    new_status = PlayerStatus.unknown
                else:
                    info = {
                        "in_lineup": False, "batting_order": None, "fielding_pos": None,
                        "sp_hand": None, "sp_name": None, "opponent": None,
                        "game_id": None, "game_time": None, "game_status": "Off Day",
                        "venue_name": None, "is_dome": False, "team_has_game": False,
                        "lineup_confirmed": False, "is_probable_starter": False,
                        "ip_pitched": None,
                    }
                    new_status = PlayerStatus.unknown

                existing = (
                    db.query(DailyPlayerStatus)
                    .filter(
                        DailyPlayerStatus.player_id == player.id,
                        DailyPlayerStatus.date == today
                    )
                    .first()
                )

                # Once a team's lineup is confirmed for today, never downgrade the row
                # back to pending just because one provider temporarily lags or fails.
                # This prevents red Confirmed Out rows from disappearing after refresh.
                previously_confirmed = bool(getattr(existing, "lineup_confirmed", False)) if existing else False
                lineup_confirmed = bool(info.get("lineup_confirmed", False) or info.get("in_lineup", False) or previously_confirmed)
                player_is_il = (
                    roster_entry.status == RosterStatus.il
                    or (existing and existing.status == PlayerStatus.il)
                )
                player_is_dtd = (
                    not player_is_il
                    and existing is not None
                    and existing.status == PlayerStatus.dtd
                    and not bool(info.get("in_lineup", False))
                )
                resolved_status = PlayerStatus.il if player_is_il else (PlayerStatus.dtd if player_is_dtd else new_status)

                fields = {
                    "status":              resolved_status,
                    "in_lineup":           bool(info.get("in_lineup", False)),
                    "batting_order":       info.get("batting_order"),
                    "fielding_pos":        info.get("fielding_pos"),
                    "sp_hand":             info.get("sp_hand"),
                    "sp_name":             info.get("sp_name"),
                    "opponent":            info.get("opponent"),
                    "game_id":             info.get("game_id"),
                    "game_time":           info.get("game_time"),
                    "game_status":         info.get("game_status"),
                    "venue_name":          info.get("venue_name"),
                    "is_dome":             bool(info.get("is_dome", False)),
                    "team_has_game":       bool(info.get("team_has_game", False)),
                    "lineup_confirmed":    lineup_confirmed,
                    "is_probable_starter": bool(
                        info.get("is_probable_starter", False)
                        or (player.mlb_id in probable_pitcher_ids)
                    ),
                    "ip_pitched":          info.get("ip_pitched"),
                }

                if existing:
                    for k, v in fields.items():
                        setattr(existing, k, v)
                else:
                    db.add(DailyPlayerStatus(player_id=player.id, date=today, **fields))
                _record_position_event(db, player, today, fields, source=str(info.get("lineup_source") or "mlb"))

                # Commit per player — isolates failures so one bad player never
                # blocks the entire poll run
                db.flush()
                updated += 1

            except Exception as e:
                logger.error("poll_daily_lineups: FAILED for %s (id=%s mlb=%s): %s",
                             player.name, player.id, player.mlb_id, e)
                db.rollback()
                errors += 1
                # Re-open the session for subsequent players after rollback
                db = SessionLocal()
                continue

        # Single commit for all successful flushes
        try:
            db.commit()
        except Exception as e:
            logger.exception("poll_daily_lineups: final commit failed: %s", e)
            db.rollback()

        # Cascade lineup_confirmed: do this as a separate operation after main commit
        confirmed_team_ids = set(
            player.team_id for player in all_players
            if ((player.mlb_id in lineup_data) or (player.team in external_confirmed_abbrs)) and player.team_id
        )
        if confirmed_team_ids:
            try:
                from sqlalchemy import and_
                db.query(DailyPlayerStatus).filter(
                    and_(
                        DailyPlayerStatus.date == today,
                        DailyPlayerStatus.player_id.in_(
                            [p.id for p in all_players if p.team_id in confirmed_team_ids]
                        )
                    )
                ).update({"lineup_confirmed": True}, synchronize_session=False)
                db.commit()
            except Exception as e:
                logger.warning("poll_daily_lineups: lineup_confirmed cascade failed: %s", e)
                db.rollback()

        if not is_historical:
            try:
                fired_alerts = _emit_lineup_position_alerts(db, today)
                if fired_alerts:
                    logger.info("poll_daily_lineups: fired %d lineup-position alerts", fired_alerts)
            except Exception as e:
                logger.warning("poll_daily_lineups: lineup-position alerts failed: %s", e)
                db.rollback()

        logger.info("poll_daily_lineups: updated=%d errors=%d teams_confirmed=%d",
                    updated, errors, len(confirmed_team_ids))
    except Exception:
        logger.exception("poll_daily_lineups failed")
        db.rollback()
    finally:
        db.close()


def poll_transactions():
    from ..services.mlb_stats import get_transactions
    logger.info("poll_transactions: starting")
    db: Session = SessionLocal()
    try:
        today_date = datetime.now(_CDT).date()
        today = today_date.isoformat()
        # Use 30-day lookback to catch players placed on IL earlier in week/month
        from ..services.mlb_stats import get_all_il_players
        il_player_ids = _run_async(get_all_il_players())  # {mlb_id: il_type_code}

        for mlb_id, il_code in il_player_ids.items():
            player = db.query(Player).filter(Player.mlb_id == mlb_id).first()
            if not player:
                continue

            # Update DailyPlayerStatus for today
            row = (
                db.query(DailyPlayerStatus)
                .filter(DailyPlayerStatus.player_id == player.id, DailyPlayerStatus.date == today)
                .first()
            )
            if row:
                row.status = PlayerStatus.il
            else:
                db.add(DailyPlayerStatus(player_id=player.id, date=today, status=PlayerStatus.il,
                                         team_has_game=False))

            # ── CRITICAL: also stamp the FantasyRosterEntry so poll_daily_lineups
            # preserves IL status on re-poll. Without this, lineup poll overwrites
            # DailyPlayerStatus.status back to "unknown" every run.
            entry = (
                db.query(FantasyRosterEntry)
                .filter(FantasyRosterEntry.player_id == player.id)
                .first()
            )
            if entry and entry.status != RosterStatus.il:
                logger.info("poll_transactions: moving %s to IL slot (mlb_id=%s)", player.name, mlb_id)
                entry.status = RosterStatus.il

            # Log an event if transitioning to IL
            db.add(EventLog(
                event_type="il_placed", player_id=player.id,
                payload={"il_code": il_code, "source": "roster_scan"},
            ))
        db.commit()
        logger.info("poll_transactions: updated IL status for %d rostered players", len(il_player_ids))
    except Exception:
        logger.exception("poll_transactions failed")
        db.rollback()
    finally:
        db.close()


# Minimum appearances to grant eligibility (mirrors ESPN's 5-game rule)
_SP_MIN_STARTS  = 5
_RP_MIN_RELIEF  = 5

def sync_team_rosters():
    """
    Sync all 30 team 40-man rosters and compute ESPN-accurate position eligibility.

    ESPN eligibility rules applied:
      SP: >= 5 starts in previous season (2025)
      RP: >= 8 relief appearances in previous season (2025)
      Hitter at position: >= 20 games in 2025 OR >= 10 games in 2026
      Falls back to current season for new/traded players with no previous season data.

    4 API calls per team: 2025 pitching, 2026 pitching, 2025 fielding, 2026 fielding.
    """
    from ..services.mlb_stats import (
        get_all_teams, get_team_roster,
        parse_player_from_roster_entry, get_team_eligibility_stats,
    )
    from sqlalchemy.orm.attributes import flag_modified
    logger.info("sync_team_rosters: starting")
    db: Session = SessionLocal()
    try:
        teams = _run_async(get_all_teams())
        total = 0
        for team in teams:
            team_id   = team.get("id")
            team_abbr = team.get("abbreviation", "")
            try:
                roster = _run_async(get_team_roster(team_id))
            except Exception as e:
                logger.warning("Roster fetch failed for %s: %s", team_id, e)
                continue

            # Fetch ESPN eligibility data (pitching + fielding, 2 seasons) in parallel
            try:
                elig_stats = _run_async(get_team_eligibility_stats(team_id))
                pitch_p = elig_stats.get("pitching_prev", {})
                pitch_c = elig_stats.get("pitching_curr", {})
                field_p = elig_stats.get("fielding_prev", {})
                field_c = elig_stats.get("fielding_curr", {})
                logger.info(
                    "sync %s: pitch_prev=%d pitch_curr=%d field_prev=%d field_curr=%d players",
                    team_abbr, len(pitch_p), len(pitch_c), len(field_p), len(field_c)
                )
            except Exception as e:
                logger.warning("Eligibility stats failed for %s: %s", team_abbr, e)
                elig_stats = {}

            for entry in roster:
                data = parse_player_from_roster_entry(entry, elig_stats=elig_stats)
                if not data.get("mlb_id"):
                    continue
                data.pop("_il_status", None)
                data["team"]    = team_abbr
                data["team_id"] = team_id

                logger.info("sync: %s positions=%s", data.get("name"), data.get("positions"))

                existing = db.query(Player).filter(Player.mlb_id == data["mlb_id"]).first()
                if existing:
                    for k, v in data.items():
                        setattr(existing, k, v)
                    # flag_modified required — SQLAlchemy won't detect JSON list mutation
                    flag_modified(existing, "positions")
                else:
                    db.add(Player(**data))
                total += 1

        db.commit()
        logger.info("sync_team_rosters: synced %d players", total)
    except Exception:
        logger.exception("sync_team_rosters failed")
        db.rollback()
    finally:
        db.close()


def update_pitcher_ip():
    """
    After games finish, write ip_pitched for each pitcher into today's DailyPlayerStatus.
    Runs as part of the stats refresh cycle.
    """
    from ..services.stats_service import get_today_stats, _parse_ip
    logger.info("update_pitcher_ip: starting")
    db: Session = SessionLocal()
    try:
        today_date = datetime.now(_CDT).date()
        today      = today_date.isoformat()

        # Fetch today's boxscore stats
        all_stats = _run_async(get_today_stats(today_date))

        # Get all tracked pitchers
        tracked = (
            db.query(Player, FantasyRosterEntry)
            .join(FantasyRosterEntry, FantasyRosterEntry.player_id == Player.id)
            .all()
        )

        updated = 0
        for player, _ in tracked:
            if not player.mlb_id or player.mlb_id not in all_stats:
                continue
            stats = all_stats[player.mlb_id]
            pitching = stats.get("pitching", {})
            if not pitching:
                continue

            ip_raw = pitching.get("inningsPitched", "0")
            ip     = _parse_ip(ip_raw)
            if ip <= 0:
                continue

            row = (
                db.query(DailyPlayerStatus)
                .filter(DailyPlayerStatus.player_id == player.id,
                        DailyPlayerStatus.date == today)
                .first()
            )
            if row:
                row.ip_pitched = ip
                updated += 1
            else:
                db.add(DailyPlayerStatus(
                    player_id=player.id, date=today,
                    ip_pitched=ip, team_has_game=True,
                ))
                updated += 1

        db.commit()
        logger.info("update_pitcher_ip: wrote IP for %d pitchers", updated)
    except Exception:
        logger.exception("update_pitcher_ip failed")
        db.rollback()
    finally:
        db.close()


def update_fantasy_scores():
    """
    Calculate and persist fantasy_score_today for every tracked player.
    Runs after each lineup poll so historical dates show real cached scores.
    Uses the same calculate_fantasy_score() function the live view uses,
    so numbers are always consistent.
    """
    from ..services.stats_service import get_today_stats, calculate_fantasy_score
    from ..routers.settings import get_settings
    logger.info("update_fantasy_scores: starting")
    db: Session = SessionLocal()
    try:
        today_date = datetime.now(_CDT).date()
        today      = today_date.isoformat()

        # Load scoring rules from settings
        cfg           = get_settings(db)
        scoring_rules = cfg.get("scoring_rules", {})
        if not scoring_rules:
            logger.warning("update_fantasy_scores: no scoring rules configured, skipping")
            return

        # Fetch today's live boxscore stats for all games
        all_stats = _run_async(get_today_stats(today_date))
        if not all_stats:
            logger.info("update_fantasy_scores: no stats available yet (no games in progress/final)")
            return

        # Get all tracked players
        tracked = (
            db.query(Player, FantasyRosterEntry)
            .join(FantasyRosterEntry, FantasyRosterEntry.player_id == Player.id)
            .all()
        )

        updated = 0
        for player, _ in tracked:
            if not player.mlb_id or player.mlb_id not in all_stats:
                continue

            stats    = all_stats[player.mlb_id]
            batting  = stats.get("batting",  {})
            pitching = stats.get("pitching", {})

            # Skip players with zero meaningful stats (not yet played / no PA)
            if not batting and not pitching:
                continue

            score = calculate_fantasy_score(batting, pitching, scoring_rules)

            row = (
                db.query(DailyPlayerStatus)
                .filter(DailyPlayerStatus.player_id == player.id,
                        DailyPlayerStatus.date == today)
                .first()
            )
            if row:
                row.fantasy_score_today = score
                # Persist raw stat dicts so historical dates show real numbers
                if batting:
                    row.batting_stats  = batting
                if pitching:
                    row.pitching_stats = pitching
                updated += 1
            # Don't create a new row just for the score — lineup poll owns row creation

        db.commit()
        logger.info("update_fantasy_scores: wrote scores for %d players", updated)
    except Exception:
        logger.exception("update_fantasy_scores failed")
        db.rollback()
    finally:
        db.close()


def poll_future_lineups(days_ahead: int = 4):
    """
    Write DailyPlayerStatus rows for the next N days using:
      - Schedule data (game time, opponent, venue)
      - Probable pitchers from the MLB API (probablePitcher hydration)

    This gives future-date views the same rich context as today:
    pitchers show PROB SP, hitters show their team's game time and opponent.
    Rows are upserted so re-running refreshes the data as probable starters
    are announced closer to game day.
    """
    from ..services.mlb_stats import get_schedule_range
    logger.info("poll_future_lineups: starting for next %d days", days_ahead)
    db: Session = SessionLocal()
    try:
        today_dt = datetime.now(_CDT).date()
        today_str = today_dt.isoformat()

        # Get all team_ids for tracked players
        all_players = db.query(Player).filter(Player.active == True).all()
        mlb_to_player = {p.mlb_id: p for p in all_players}
        all_team_ids = list({p.team_id for p in all_players if p.team_id})

        # Tracked players on roster/watch
        tracked = (
            db.query(Player, FantasyRosterEntry)
            .join(FantasyRosterEntry, FantasyRosterEntry.player_id == Player.id)
            .all()
        )
        tracked_by_team: dict[int, list[Player]] = {}
        tracked_by_abbr: dict[str, list[Player]] = {}   # fallback for players w/ null team_id
        tracked_il_ids: set[int] = set()                # player.id values currently IL-slotted
        for player, roster_entry in tracked:
            if player.team_id:
                tracked_by_team.setdefault(player.team_id, []).append(player)
            if player.team:
                tracked_by_abbr.setdefault(player.team, []).append(player)
            if roster_entry.status == RosterStatus.il:
                tracked_il_ids.add(player.id)

        # Fetch schedule + probable pitchers for the next N days
        start = today_dt + timedelta(days=1)
        end   = today_dt + timedelta(days=days_ahead)
        schedule = _run_async(get_schedule_range(all_team_ids, start, end))

        written = 0
        for game in schedule:
            game_date   = game["date"]
            game_time   = game.get("game_time", "")
            game_status = game.get("game_status", "Scheduled")
            venue_name  = game.get("venue_name", "")

            for side in ("home", "away"):
                team_id   = game[f"{side}_team_id"]
                opp_side  = "away" if side == "home" else "home"
                opp_abbr  = game[f"{opp_side}_abbr"]
                opponent  = f"vs {opp_abbr}" if side == "home" else f"@ {opp_abbr}"

                prob_sp_id   = game.get(f"{side}_prob_sp_id")
                prob_sp_name = game.get(f"{side}_prob_sp")
                # Opposing probable pitcher (shown in sp_name field for hitters)
                opp_prob_sp  = game.get(f"{opp_side}_prob_sp")

                side_abbr = game.get(f"{side}_abbr", "")
                players_on_team = tracked_by_team.get(team_id) or tracked_by_abbr.get(side_abbr, [])
                for player in players_on_team:
                    is_prob_sp = (prob_sp_id is not None and player.mlb_id == prob_sp_id)
                    # Preserve IL status — never write "unknown" over an IL-slotted player
                    player_status = PlayerStatus.il if player.id in tracked_il_ids else PlayerStatus.unknown

                    fields = {
                        "team_has_game":      True,
                        "game_time":          game_time,
                        "game_status":        game_status,
                        "venue_name":         venue_name,
                        "opponent":           opponent,
                        "in_lineup":          False,          # never confirmed for future
                        "is_probable_starter": is_prob_sp,
                        "lineup_confirmed":   False,
                        "sp_name":            opp_prob_sp,   # opposing pitcher name
                        "sp_hand":            None,           # hand not in schedule API
                        "status":             player_status,
                    }

                    existing = (
                        db.query(DailyPlayerStatus)
                        .filter(
                            DailyPlayerStatus.player_id == player.id,
                            DailyPlayerStatus.date == game_date,
                        )
                        .first()
                    )
                    if existing:
                        for k, v in fields.items():
                            setattr(existing, k, v)
                    else:
                        db.add(DailyPlayerStatus(
                            player_id=player.id,
                            date=game_date,
                            **fields,
                        ))
                    written += 1

            # Players on teams with no game this date — write explicit no-game row
            # so frontend shows "No game" instead of blank
            all_game_team_ids = {game.get("home_team_id"), game.get("away_team_id")}

        # Write explicit no-game rows for tracked players whose team has no game
        for fut_offset in range(1, days_ahead + 1):
            fut_date = (today_dt + timedelta(days=fut_offset)).isoformat()
            playing_team_ids = {
                g[f"{s}_team_id"]
                for g in schedule if g["date"] == fut_date
                for s in ("home", "away")
            }
            playing_team_abbrs = {
                g[f"{s}_abbr"]
                for g in schedule if g["date"] == fut_date
                for s in ("home", "away")
            }
            for player, roster_entry in tracked:
                team_has_game = (
                    (player.team_id and player.team_id in playing_team_ids)
                    or (player.team and player.team in playing_team_abbrs)
                )
                if not team_has_game:
                    existing = (
                        db.query(DailyPlayerStatus)
                        .filter(
                            DailyPlayerStatus.player_id == player.id,
                            DailyPlayerStatus.date == fut_date,
                        )
                        .first()
                    )
                    no_game_fields = {
                        "team_has_game": False,
                        "game_status":   "Off Day",
                        "in_lineup":     False,
                        "is_probable_starter": False,
                        "status":        PlayerStatus.il if player.id in tracked_il_ids else PlayerStatus.unknown,
                    }
                    if existing:
                        for k, v in no_game_fields.items():
                            setattr(existing, k, v)
                    else:
                        db.add(DailyPlayerStatus(
                            player_id=player.id,
                            date=fut_date,
                            **no_game_fields,
                        ))

        db.commit()
        logger.info("poll_future_lineups: wrote %d player-date rows", written)
    except Exception:
        logger.exception("poll_future_lineups failed")
        db.rollback()
    finally:
        db.close()


def run_pattern_engine():
    from ..services.pattern_engine import run_pattern_engine_for_all
    logger.info("run_pattern_engine: starting")
    db: Session = SessionLocal()
    try:
        n = run_pattern_engine_for_all(db)
        logger.info("run_pattern_engine: updated %d players", n)
    except Exception:
        logger.exception("run_pattern_engine failed")
    finally:
        db.close()


def fire_notifications():
    from datetime import datetime, timezone
    logger.info("fire_notifications: starting")
    db: Session = SessionLocal()
    try:
        today = _cdt_today()
        rules = db.query(PlayerNotification).filter(PlayerNotification.enabled == True).all()
        fired = 0
        for rule in rules:
            today_status = (
                db.query(DailyPlayerStatus)
                .filter(DailyPlayerStatus.player_id == rule.player_id, DailyPlayerStatus.date == today)
                .first()
            )
            triggered = False
            message   = ""
            if rule.rule_type == "lineup_confirmed" and today_status and today_status.in_lineup:
                triggered = True
                message = f"Confirmed in lineup (batting {today_status.batting_order}, {today_status.fielding_pos})"
            elif rule.rule_type == "il_placed" and today_status and today_status.status == PlayerStatus.il:
                triggered = True
                message = "Placed on IL"
            if triggered:
                db.add(EventLog(
                    event_type="notification_fired", player_id=rule.player_id,
                    payload={"rule_id": rule.id, "rule_type": rule.rule_type, "message": message, "channel": rule.channel.value},
                ))
                rule.last_fired = datetime.now(timezone.utc)
                fired += 1
        db.commit()
        logger.info("fire_notifications: fired %d alerts", fired)
    except Exception:
        logger.exception("fire_notifications failed")
        db.rollback()
    finally:
        db.close()


def refresh_player_research():
    """
    Daily job: refresh Claude web-search research for all rostered players.
    Skips players researched within the last 6 hours.
    Runs at 7:15am CDT (after probable SP poll at 7:30am so lineup context is fresh).
    """
    import urllib.request, urllib.error
    import json as _json
    from ..models import PlayerResearch, FantasyRosterEntry
    from datetime import timedelta, timezone
    from ..routers.research import _call_research, _upsert_research, STALE_HOURS

    logger.info("refresh_player_research: starting")
    db: Session = SessionLocal()
    try:
        from ..routers.settings import get_settings
        cfg = get_settings(db)
        openai_key    = cfg.get("openai_api_key")    or __import__("os").environ.get("OPENAI_API_KEY",    "")
        anthropic_key = cfg.get("anthropic_api_key") or __import__("os").environ.get("ANTHROPIC_API_KEY", "")
        provider      = cfg.get("ocr_provider", "openai")
        keys = {"openai": openai_key, "anthropic": anthropic_key, "provider": provider}
        if not openai_key and not anthropic_key:
            logger.warning("refresh_player_research: no API key configured, skipping")
            return

        entries = (
            db.query(FantasyRosterEntry)
            .join(FantasyRosterEntry.player)
            .filter(FantasyRosterEntry.status.in_(["roster", "watch"]))
            .all()
        )
        cutoff  = datetime.now(timezone.utc) - timedelta(hours=STALE_HOURS)
        updated = skipped = failed = 0

        for entry in entries:
            p = entry.player
            if not p or not p.mlb_id:
                continue
            existing = db.query(PlayerResearch).filter(
                PlayerResearch.mlb_id == p.mlb_id
            ).first()
            if existing and existing.researched_at:
                ts = existing.researched_at.replace(tzinfo=timezone.utc)
                if ts > cutoff:
                    skipped += 1
                    continue
            try:
                result = _call_research(p.name, p.team or "", keys)
                _upsert_research(db, p.mlb_id, p.name, p.team or "", result)
                updated += 1
                logger.info("Research: %s vsR=%s vsL=%s platoon=%s",
                            p.name, result.get("position_vsR"),
                            result.get("position_vsL"), result.get("platoon"))
            except Exception as e:
                logger.warning("Research failed %s: %s", p.name, e)
                failed += 1

        logger.info("refresh_player_research: updated=%d skipped=%d failed=%d",
                    updated, skipped, failed)
    except Exception:
        logger.exception("refresh_player_research failed")
    finally:
        db.close()



def sync_espn_roster_job():
    """Scheduled read-only ESPN roster/eligibility refresh."""
    logger.info("sync_espn_roster_job: starting")
    db: Session = SessionLocal()
    try:
        from ..routers.settings import _get_setting
        from ..services.espn_fantasy import EspnFantasyClient, extract_team_roster, sync_espn_roster
        if not bool(_get_setting(db, "espn_enabled", False)):
            logger.info("sync_espn_roster_job: ESPN sync disabled")
            return
        league_id = str(_get_setting(db, "espn_league_id", "") or "").strip()
        swid = str(_get_setting(db, "espn_swid", "") or "").strip()
        s2 = str(_get_setting(db, "espn_s2", "") or "").strip()
        if not league_id or not swid or not s2:
            logger.warning("sync_espn_roster_job: ESPN config incomplete")
            return
        client = EspnFantasyClient(
            sport=str(_get_setting(db, "espn_sport", "baseball") or "baseball"),
            season=int(_get_setting(db, "espn_season", datetime.now(_CDT).year)),
            league_id=int(league_id),
            swid=swid,
            espn_s2=s2,
        )
        league = client.fetch_league()
        team_id_raw = str(_get_setting(db, "espn_team_id", "") or "").strip()
        team_id = int(team_id_raw) if team_id_raw else None
        team, roster = extract_team_roster(league, team_id)
        result = sync_espn_roster(db, roster, reconcile=True)
        logger.info("sync_espn_roster_job: team=%s added=%s updated=%s removed=%s unmatched=%s", team.get("id"), result["summary"]["added"], result["summary"]["updated"], result["summary"].get("removed", 0), result["summary"]["unmatched"])
    except Exception:
        logger.exception("sync_espn_roster_job failed")
        db.rollback()
    finally:
        db.close()
def start_scheduler():
    from ..routers.settings import _get_setting
    db = SessionLocal()
    try:
        h  = _get_setting(db, "daily_poll_hour",     6)
        m  = _get_setting(db, "daily_poll_minute",   0)
        mh = _get_setting(db, "midday_poll_hour",    11)
        ph = _get_setting(db, "pattern_engine_hour", 3)
        nh = _get_setting(db, "notifications_hour",  11)
        rd = _get_setting(db, "roster_sync_day",     "sun")
    finally:
        db.close()

    scheduler.add_job(poll_daily_lineups, CronTrigger(hour=h,  minute=m),   id="lineups_morning")
    scheduler.add_job(poll_daily_lineups, CronTrigger(hour=mh, minute=0),   id="lineups_midday")
    scheduler.add_job(poll_daily_lineups, CronTrigger(hour=17, minute=0),   id="lineups_afternoon")   # 5pm CDT
    scheduler.add_job(poll_daily_lineups, CronTrigger(hour=20, minute=0),   id="lineups_evening")     # 8pm CDT
    scheduler.add_job(poll_daily_lineups, CronTrigger(hour=22, minute=0),   id="lineups_late")        # 10pm CDT
    scheduler.add_job(poll_daily_lineups, CronTrigger(hour="12-23", minute="*/3"), id="lineups_watch")       # every 3 min during lineup-lock window
    scheduler.add_job(sync_espn_roster_job, CronTrigger(hour="6,12,18", minute=10), id="espn_sync")
    scheduler.add_job(update_pitcher_ip,      CronTrigger(hour=mh, minute=30),  id="pitcher_ip")
    scheduler.add_job(update_pitcher_ip,      CronTrigger(hour=22, minute=30),  id="pitcher_ip_evening")
    scheduler.add_job(update_fantasy_scores,  CronTrigger(hour=20, minute=30),  id="fantasy_scores")       # 8:30pm CDT — after evening games
    scheduler.add_job(poll_future_lineups,    CronTrigger(hour=7,  minute=30),  id="future_lineups")        # 7:30am CDT — after morning poll
    scheduler.add_job(poll_transactions,  CronTrigger(hour=h,  minute=15),  id="transactions")
    scheduler.add_job(run_pattern_engine, CronTrigger(hour=ph, minute=0),   id="patterns")
    scheduler.add_job(fire_notifications, CronTrigger(hour=nh, minute=30),  id="notifications")
    scheduler.add_job(sync_team_rosters,    CronTrigger(day_of_week=rd, hour=4, minute=0),  id="rosters")
    scheduler.add_job(refresh_player_research, CronTrigger(hour=7, minute=15), id="research_roster")  # 7:15am — research all rostered players daily
    scheduler.add_job(pre_game_setup,     CronTrigger(hour=h,  minute=m+5 if m<=54 else 0), id="pre_game_setup")
    scheduler.start()
    logger.info("Scheduler started — lineup poll at %02d:%02d CST", h, m)
    # Schedule today's pre-game polls immediately on startup
    try:
        schedule_pre_game_polls()
    except Exception as e:
        logger.warning("Initial pre-game setup failed: %s", e)


def stop_scheduler():
    if scheduler.running:
        scheduler.shutdown(wait=False)


# ─── Pre-game auto-poll scheduler ────────────────────────────────────────────

def schedule_pre_game_polls(db=None):
    """
    Fetch today's MLB schedule and add one-shot APScheduler jobs
    that fire `pre_game_poll_minutes` before each distinct game start group.
    Old pre-game jobs are removed first.
    """
    from ..routers.settings import _get_setting
    from ..database import SessionLocal
    from ..services.mlb_stats import get_daily_schedule
    from apscheduler.triggers.date import DateTrigger
    from datetime import datetime, timedelta
    from zoneinfo import ZoneInfo

    CDT = ZoneInfo("America/Chicago")

    _db = db or SessionLocal()
    try:
        enabled = _get_setting(_db, "pre_game_poll_enabled", True)
        minutes = _get_setting(_db, "pre_game_poll_minutes", 30)
    finally:
        if db is None:
            _db.close()

    # Remove old pre-game jobs
    for job in list(scheduler.get_jobs()):
        if job.id.startswith("pre_game_"):
            scheduler.remove_job(job.id)

    if not enabled:
        logger.info("Pre-game polling disabled")
        return

    try:
        games = _run_async(get_daily_schedule())
    except Exception as e:
        logger.warning("Pre-game schedule fetch failed: %s", e)
        return

    # Collect distinct start times (rounded to 5-min buckets to group back-to-back games)
    start_times = set()
    for game in games:
        game_dt_str = game.get("gameDate", "")
        if not game_dt_str:
            continue
        try:
            dt_utc = datetime.fromisoformat(game_dt_str.replace("Z", "+00:00"))
            dt_cdt = dt_utc.astimezone(CDT)
            # Round down to nearest 15 minutes to group close games together
            bucket = dt_cdt.replace(minute=(dt_cdt.minute // 15)*15, second=0, microsecond=0)
            start_times.add(bucket)
        except Exception:
            continue

    now = datetime.now(CDT)
    added = 0
    for game_start in sorted(start_times):
        fire_at = game_start - timedelta(minutes=minutes)
        if fire_at <= now:
            continue  # already past
        job_id = f"pre_game_{game_start.strftime('%H%M')}"
        try:
            scheduler.add_job(
                poll_daily_lineups,
                trigger=DateTrigger(run_date=fire_at),
                id=job_id,
                replace_existing=True,
            )
            logger.info("Pre-game poll scheduled at %s CDT (game group: %s)", fire_at.strftime("%H:%M"), game_start.strftime("%H:%M"))
            added += 1
        except Exception as e:
            logger.warning("Could not schedule pre-game job: %s", e)

    logger.info("Pre-game setup: %d poll(s) scheduled for today", added)


def pre_game_setup():
    """Daily job — sets up today's pre-game polls. Runs at the morning poll time."""
    from ..database import SessionLocal
    db = SessionLocal()
    try:
        schedule_pre_game_polls(db)
    finally:
        db.close()
