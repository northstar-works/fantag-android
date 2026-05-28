"""
MLB Stats API client (free, no API key required).
Captures game time, status, venue, and dome info.
"""

import asyncio
import logging
from datetime import date, timedelta, timezone, datetime
from zoneinfo import ZoneInfo
from typing import Any

import httpx

from ..config import settings

logger = logging.getLogger(__name__)
BASE    = settings.MLB_STATS_API
TIMEOUT = httpx.Timeout(20.0)
CDT     = ZoneInfo("America/Chicago")

# Known retractable/domed stadiums by team abbreviation
DOME_TEAMS = {"ARI","HOU","MIA","MIL","SEA","TB","TEX","TOR"}


async def _get(path: str, params: dict | None = None, v: str = "v1") -> dict:
    base = BASE.replace("/v1", f"/{v}") if v != "v1" else BASE
    async with httpx.AsyncClient(timeout=TIMEOUT) as client:
        r = await client.get(f"{base}{path}", params=params)
        r.raise_for_status()
        return r.json()


async def get_daily_schedule(game_date: date | None = None) -> list[dict]:
    if game_date is None:
        game_date = date.today()
    data = await _get("/schedule", {
        "sportId": 1,
        "date":    game_date.strftime("%Y-%m-%d"),
        "hydrate": "lineups,probablePitcher(note),linescore,venue",
    })
    games = []
    for date_obj in data.get("dates", []):
        for game in date_obj.get("games", []):
            games.append(game)
    return games


def _parse_game_time(game_date_str: str) -> str:
    """Convert MLB UTC timestamp → 'H:MM AM/PM CDT'."""
    try:
        dt_utc = datetime.fromisoformat(game_date_str.replace("Z", "+00:00"))
        dt_cdt = dt_utc.astimezone(CDT)
        return dt_cdt.strftime("%-I:%M %p CDT")
    except Exception:
        return ""




def _probable_pitcher(game: dict, side: str) -> dict:
    """Return probable pitcher for home/away from either MLB API shape.

    MLB schedule responses commonly expose probable pitchers at
    teams.home.probablePitcher / teams.away.probablePitcher, while some
    hydrated/older shapes expose homeProbablePitcher / awayProbablePitcher.
    Fantag must check both or real probable SPs can be missed.
    """
    if side not in ("home", "away"):
        return {}
    nested = (((game.get("teams") or {}).get(side) or {}).get("probablePitcher") or {})
    legacy = game.get(f"{side}ProbablePitcher") or {}
    pp = nested or legacy or {}
    return pp if isinstance(pp, dict) else {}


def _probable_pitcher_id(game: dict, side: str):
    pp = _probable_pitcher(game, side)
    return pp.get("id") or pp.get("mlb_id") or pp.get("personId")


def _probable_pitcher_name(game: dict, side: str) -> str | None:
    pp = _probable_pitcher(game, side)
    return pp.get("fullName") or pp.get("name") or pp.get("displayName")


def _extract_lineups(game: dict) -> dict[int, dict]:
    """
    Returns {mlb_player_id: lineup_info} for every player in confirmed lineups.
    Also includes team_has_game=True for all players on both teams.
    Also marks probable starters (SP scheduled to pitch today).
    """
    result:    dict[int, dict] = {}
    team_sets: dict[int, dict] = {}   # team_id → game context (for team_has_game)

    # Collect probable pitcher IDs for BOTH sides so we can mark them as probable starters.
    # Check both supported MLB API shapes. b81 only checked legacy top-level keys,
    # which could block real daily probable starters from appearing.
    probable_pitcher_ids: set[int] = set()
    for side in ("home", "away"):
        pid = _probable_pitcher_id(game, side)
        if pid:
            probable_pitcher_ids.add(pid)

    lineups  = game.get("lineups", {})
    game_pk  = game.get("gamePk")
    game_dt  = game.get("gameDate", "")
    game_time = _parse_game_time(game_dt)

    raw_status   = game.get("status", {})
    game_status  = raw_status.get("detailedState", "Scheduled")

    venue     = game.get("venue", {})
    venue_name = venue.get("name", "")
    home_abbr  = game.get("teams", {}).get("home", {}).get("team", {}).get("abbreviation", "")
    away_abbr  = game.get("teams", {}).get("away", {}).get("team", {}).get("abbreviation", "")
    is_dome    = home_abbr in DOME_TEAMS

    home_team_id = game.get("teams", {}).get("home", {}).get("team", {}).get("id")
    away_team_id = game.get("teams", {}).get("away", {}).get("team", {}).get("id")

    # Base context for all players on both teams
    base_ctx = {
        "game_id":      game_pk,
        "game_time":    game_time,
        "game_status":  game_status,
        "venue_name":   venue_name,
        "is_dome":      is_dome,
        "team_has_game": True,
        "in_lineup":    False,
        "batting_order": None,
        "fielding_pos":  None,
        "sp_hand":       None,
        "sp_name":       None,
        "opponent":      None,
    }

    # Store team contexts so scheduler can mark ALL team members
    if home_team_id:
        team_sets[home_team_id] = {**base_ctx, "opponent": f"vs {away_abbr}"}
    if away_team_id:
        team_sets[away_team_id] = {**base_ctx, "opponent": f"@ {home_abbr}"}

    # Lineup players
    for side in ("homePlayers", "awayPlayers"):
        players_list = lineups.get(side, [])
        is_home = side == "homePlayers"
        opponent = f"vs {away_abbr}" if is_home else f"@ {home_abbr}"
        opp_side = "away" if is_home else "home"
        opp_pitcher = _probable_pitcher(game, opp_side)
        sp_hand = opp_pitcher.get("pitchHand", {}).get("code") if opp_pitcher else None
        sp_name = _probable_pitcher_name(game, opp_side)

        for entry in players_list:
            pid = entry.get("id")
            if not pid:
                continue
            raw_bat = entry.get("battingOrder")
            bat_num = None
            if raw_bat:
                try:
                    bat_num = int(str(int(raw_bat))[0])  # 100→1, 600→6
                except Exception:
                    bat_num = None
            result[pid] = {
                "batting_order": bat_num,
                "fielding_pos":  entry.get("position", {}).get("abbreviation"),
                "sp_hand":       sp_hand,
                "sp_name":       sp_name,
                "opponent":      opponent,
                "game_id":       game_pk,
                "game_time":     game_time,
                "game_status":   game_status,
                "venue_name":    venue_name,
                "is_dome":       is_dome,
                "team_has_game": True,
                "in_lineup":     True,
            }

    # Add probable starters as their own entries so scheduler marks is_probable_starter
    # This covers SPs who aren't yet in the official lineup card
    for side, opp_side, is_home in [
        ("home", "away", True),
        ("away", "home", False),
    ]:
        pp = _probable_pitcher(game, side)
        pid = _probable_pitcher_id(game, side)
        if not pp or not pid:
            continue
        opponent = f"vs {away_abbr}" if is_home else f"@ {home_abbr}"
        opp_pp = _probable_pitcher(game, opp_side)
        # Mark this pitcher's entry — if not already in lineup, create one
        if pid not in result:
            result[pid] = {
                "batting_order":     None,
                "fielding_pos":      "P",
                "sp_hand":           None,
                "sp_name":           _probable_pitcher_name(game, side),
                "opponent":          opponent,
                "game_id":           game_pk,
                "game_time":         game_time,
                "game_status":       game_status,
                "venue_name":        venue_name,
                "is_dome":           is_dome,
                "team_has_game":     True,
                "in_lineup":         False,  # not yet confirmed in batting lineup
                "is_probable_starter": True,
            }
        else:
            result[pid]["is_probable_starter"] = True

    return result, team_sets, probable_pitcher_ids


async def get_all_lineups_today(game_date: date | None = None) -> tuple[dict, dict, set]:
    """
    Returns (lineup_data, team_context_data, probable_pitcher_ids).
    lineup_data:          {mlb_player_id: lineup_info} for confirmed starters + probable SPs
    team_context_data:    {team_id: game_context} for ALL players on teams that play
    probable_pitcher_ids: set of mlb_ids who are the scheduled starting pitcher today
    """
    games = await get_daily_schedule(game_date)
    combined_lineups:  dict[int, dict] = {}
    combined_teams:    dict[int, dict] = {}
    combined_probable: set[int]        = set()
    for game in games:
        lineups, team_sets, prob_ids = _extract_lineups(game)
        combined_lineups.update(lineups)
        combined_teams.update(team_sets)
        combined_probable.update(prob_ids)
    return combined_lineups, combined_teams, combined_probable


async def get_transactions(start_date=None, end_date=None) -> list[dict]:
    if end_date is None:
        end_date = date.today()
    if start_date is None:
        start_date = end_date - timedelta(days=1)
    data = await _get("/transactions", {
        "sportId":   1,
        "startDate": start_date.strftime("%Y-%m-%d"),
        "endDate":   end_date.strftime("%Y-%m-%d"),
    })
    return data.get("transactions", [])


async def get_player_info(mlb_id: int) -> dict:
    data = await _get(f"/people/{mlb_id}", {"hydrate": "currentTeam"})
    people = data.get("people", [])
    return people[0] if people else {}


async def get_player_season_stats(mlb_id: int, season: int | None = None) -> dict:
    if season is None:
        season = date.today().year
    hitting, pitching = await asyncio.gather(
        _get(f"/people/{mlb_id}/stats", {"stats": "season", "group": "hitting",  "season": season}),
        _get(f"/people/{mlb_id}/stats", {"stats": "season", "group": "pitching", "season": season}),
        return_exceptions=True,
    )
    return {
        "hitting":  _first_stat_split(hitting  if not isinstance(hitting,  Exception) else {}),
        "pitching": _first_stat_split(pitching if not isinstance(pitching, Exception) else {}),
    }


def _first_stat_split(data: dict) -> dict:
    try:
        return data["stats"][0]["splits"][0]["stat"]
    except (KeyError, IndexError):
        return {}



async def get_team_pitcher_stats(team_id: int, season: int | None = None) -> dict[int, dict]:
    """
    Fetch season pitching stats for all pitchers on a team in one API call.
    Returns {mlb_player_id: {gamesStarted, gamesPlayed, gamesRelief}}
    Used by sync_team_rosters to determine SP/RP eligibility without per-player calls.

    MLB Stats API correct endpoint: /stats (not /teams/{id}/stats)
    with teamId, stats=season, group=pitching, gameType=R.
    """
    if season is None:
        season = date.today().year
    try:
        data = await _get("/stats", {
            "stats":    "season",
            "group":    "pitching",
            "gameType": "R",
            "season":   season,
            "teamId":   team_id,
        })
        result = {}
        for split in data.get("stats", [{}])[0].get("splits", []):
            pid  = split.get("player", {}).get("id")
            stat = split.get("stat", {})
            if pid:
                gp = stat.get("gamesPlayed", 0)
                gs = stat.get("gamesStarted", 0)
                result[pid] = {
                    "gamesPlayed":  gp,
                    "gamesStarted": gs,
                    "gamesRelief":  max(0, gp - gs),
                }
        logger.info("get_team_pitcher_stats: team %s → %d pitchers with stats", team_id, len(result))
        return result
    except Exception as e:
        logger.warning("Team pitcher stats fetch failed for team %s: %s", team_id, e)
        return {}

async def get_team_eligibility_stats(team_id: int) -> dict:
    """
    Fetch stats needed to compute ESPN-style position eligibility for a team.
    Returns a dict with two keys:
      "pitching": {mlb_id: {starts_2025, relief_2025, starts_2026, relief_2026}}
      "fielding":  {mlb_id: {pos_abbr: games_2026, ...}, "prev": {pos_abbr: games_2025}}

    ESPN eligibility rules:
      SP: 5+ starts in 2025 (previous season)
      RP: 8+ relief appearances in 2025
      Hitter at position: 20+ games in 2025, OR 10+ games in 2026
    """
    from datetime import date as _d
    current_year = _d.today().year
    prev_year    = current_year - 1

    async def _pitch(season):
        try:
            data = await _get("/stats", {
                "stats": "season", "group": "pitching",
                "gameType": "R", "season": season, "teamId": team_id,
            })
            result = {}
            for split in data.get("stats", [{}])[0].get("splits", []):
                pid  = split.get("player", {}).get("id")
                stat = split.get("stat", {})
                if pid:
                    gp = stat.get("gamesPlayed", 0) or 0
                    gs = stat.get("gamesStarted", 0) or 0
                    result[pid] = {"starts": gs, "relief": max(0, gp - gs)}
            return result
        except Exception as e:
            logger.warning("Pitch stats %s team %s: %s", season, team_id, e)
            return {}

    async def _field(season):
        try:
            data = await _get("/stats", {
                "stats": "season", "group": "fielding",
                "gameType": "R", "season": season, "teamId": team_id,
            })
            result = {}  # {mlb_id: {pos_abbr: games}}
            for split in data.get("stats", [{}])[0].get("splits", []):
                pid  = split.get("player", {}).get("id")
                pos  = split.get("position", {}).get("abbreviation", "")
                stat = split.get("stat", {})
                if pid and pos:
                    games = stat.get("games", 0) or 0
                    if pid not in result:
                        result[pid] = {}
                    result[pid][pos] = result[pid].get(pos, 0) + games
            return result
        except Exception as e:
            logger.warning("Field stats %s team %s: %s", season, team_id, e)
            return {}

    pitch_prev, pitch_curr, field_prev, field_curr = await asyncio.gather(
        _pitch(prev_year), _pitch(current_year),
        _field(prev_year), _field(current_year),
        return_exceptions=True,
    )
    def _safe(r): return r if isinstance(r, dict) else {}

    return {
        "pitching_prev": _safe(pitch_prev),
        "pitching_curr": _safe(pitch_curr),
        "fielding_prev": _safe(field_prev),
        "fielding_curr": _safe(field_curr),
    }


async def get_team_roster(team_id: int) -> list[dict]:
    # Hydrate allPositions (multi-position for hitters) AND career pitching stats
    # (for SP/RP eligibility — season stats are empty early in the year).
    # hydrate syntax: person(allPositions,stats(type=career,group=pitching,gameType=R))
    hydrate = "person(allPositions,stats(type=career,group=pitching,gameType=R))"
    data = await _get(f"/teams/{team_id}/roster", {"rosterType": "40Man", "hydrate": hydrate})
    roster = data.get("roster", [])
    if not roster:
        data = await _get(f"/teams/{team_id}/roster", {"rosterType": "active", "hydrate": hydrate})
        roster = data.get("roster", [])
    return roster


async def get_live_game_lineups(game_pk: int) -> dict[int, dict]:
    """
    Fetch confirmed lineups from the GUMBO live game feed.
    Returns {mlb_player_id: lineup_info} — works even before first pitch once
    the official lineup has been entered into the system (same window as /schedule lineups,
    but sometimes populates earlier and always has battingOrder once game starts).
    """
    try:
        data = await _get(f"/game/{game_pk}/feed/live", {}, v="v1.1")
        game_data  = data.get("gameData",  {})
        live_data  = data.get("liveData",  {})
        boxscore   = live_data.get("boxscore", {})
        teams_bs   = boxscore.get("teams", {})
        game_status = game_data.get("status", {}).get("detailedState", "Scheduled")
        is_live_or_final = "Progress" in game_status or "Final" in game_status or "Over" in game_status

        result: dict[int, dict] = {}

        for side in ("home", "away"):
            team_info  = game_data.get("teams", {}).get(side, {})
            abbr       = team_info.get("abbreviation", "")
            opp_abbr   = game_data.get("teams", {}).get("away" if side=="home" else "home", {}).get("abbreviation", "")
            opponent   = f"vs {opp_abbr}" if side == "home" else f"@ {opp_abbr}"
            opp_pitcher_key = "awayProbablePitcher" if side == "home" else "homeProbablePitcher"
            opp_pitcher = game_data.get(opp_pitcher_key, {})
            sp_hand    = opp_pitcher.get("pitchHand", {}).get("code") if opp_pitcher else None
            sp_name    = opp_pitcher.get("fullName") if opp_pitcher else None

            bs_team = teams_bs.get(side, {})
            players = bs_team.get("players", {})

            for pid_str, pdata in players.items():
                try:
                    mlb_id = int(pid_str.replace("ID", ""))
                except Exception:
                    continue
                bat_order = pdata.get("battingOrder")
                if not bat_order:
                    continue  # not in lineup
                try:
                    bat_num = int(str(int(bat_order))[0])  # 100→1, 200→2, etc.
                except Exception:
                    bat_num = None
                pos = pdata.get("position", {}).get("abbreviation", "")
                # Extract innings pitched for pitcher workload tracking
                pitching_stats = pdata.get("stats", {}).get("pitching", {})
                ip_raw = pitching_stats.get("inningsPitched")
                ip_pitched = None
                if ip_raw:
                    try:
                        s = str(ip_raw)
                        if "." in s:
                            full, frac = s.split(".")
                            ip_pitched = int(full) + int(frac) / 3.0
                        else:
                            ip_pitched = float(s)
                    except Exception:
                        pass

                result[mlb_id] = {
                    "batting_order":  bat_num,
                    "fielding_pos":   pos,
                    "sp_hand":        sp_hand,
                    "sp_name":        sp_name,
                    "opponent":       opponent,
                    "game_id":        game_pk,
                    "game_time":      "",
                    "game_status":    game_status,
                    "venue_name":     game_data.get("venue", {}).get("name", ""),
                    "is_dome":        abbr in DOME_TEAMS,
                    "team_has_game":  True,
                    "in_lineup":      True,
                    "ip_pitched":     ip_pitched,
                }

            # ── Starting pitcher detection (DH era — SP has no battingOrder) ──────
            # boxscore.teams.<side>.pitchers is an ordered list of player IDs;
            # the FIRST entry is always the game's starting pitcher.
            sp_pitcher_ids = bs_team.get("pitchers", [])
            if sp_pitcher_ids:
                sp_mlb_id = sp_pitcher_ids[0]
                if sp_mlb_id not in result:   # don't overwrite batting pitcher (NL edge)
                    pid_str_sp = f"ID{sp_mlb_id}"
                    pdata_sp   = players.get(pid_str_sp, {})
                    p_stats    = pdata_sp.get("stats", {}).get("pitching", {})
                    ip_raw_sp  = p_stats.get("inningsPitched")
                    ip_sp      = None
                    if ip_raw_sp:
                        try:
                            s = str(ip_raw_sp)
                            if "." in s:
                                full, frac = s.split(".")
                                ip_sp = int(full) + int(frac) / 3.0
                            else:
                                ip_sp = float(s)
                        except Exception:
                            pass
                    result[sp_mlb_id] = {
                        "batting_order":     None,
                        "fielding_pos":      "SP",
                        "sp_hand":           sp_hand,
                        "sp_name":           sp_name,
                        "opponent":          opponent,
                        "game_id":           game_pk,
                        "game_time":         "",
                        "game_status":       game_status,
                        "venue_name":        game_data.get("venue", {}).get("name", ""),
                        "is_dome":           abbr in DOME_TEAMS,
                        "team_has_game":     True,
                        "in_lineup":         True,        # confirmed from boxscore pitchers[]
                        "is_probable_starter": True,      # first in pitchers[] = today's SP
                        "ip_pitched":        ip_sp,
                    }
                    logger.debug("GUMBO SP detected: mlb_id=%s game=%s", sp_mlb_id, game_pk)
                else:
                    # SP appears in batting order (NL/interleague) — just flag them
                    result[sp_mlb_id]["is_probable_starter"] = True

        return result
    except Exception as e:
        logger.warning("GUMBO live feed failed for game %s: %s", game_pk, e)
        return {}


async def get_all_il_players() -> dict[int, str]:
    """
    Detect current IL players using TWO sources:
    1. /sports/1/players — live roster status codes (D10, D15, D60) — most reliable
    2. Transaction log (30 days) — catches edge cases
    Returns {mlb_player_id: il_type_label}.
    """
    from datetime import timedelta
    result: dict[int, str] = {}

    # Source 1: Live roster player status via season player list
    # Each player has a rosterStatus or status.description indicating IL placement
    try:
        season = date.today().year
        # /sports/1/players returns active roster players with current status
        people_data = await _get("/sports/1/players", {
            "season":   season,
            "gameType": "R",
        })
        IL_STATUS_KEYWORDS = {"injured", "il-10", "il-15", "il-60", "10-day", "15-day", "60-day"}
        for person in people_data.get("people", []):
            pid = person.get("id")
            if not pid:
                continue
            # Check rosterStatus field (most reliable)
            roster_status = (person.get("rosterStatus") or "").lower()
            # Also check status object
            status_desc   = (person.get("status", {}).get("description") or "").lower()
            for s in (roster_status, status_desc):
                if any(k in s for k in IL_STATUS_KEYWORDS):
                    result[pid] = roster_status or status_desc
                    break
    except Exception as e:
        logger.warning("IL roster status fetch failed: %s", e)

    # Source 2: Transaction log (30 days) — catches recent placements not yet in roster feed
    try:
        from zoneinfo import ZoneInfo as _Z; from datetime import datetime as _DT
        end   = _DT.now(_Z("America/Chicago")).date()
        start = end - timedelta(days=30)
        txns = await _get("/transactions", {
            "sportId":   1,
            "startDate": start.strftime("%Y-%m-%d"),
            "endDate":   end.strftime("%Y-%m-%d"),
        })
        # typeCode values observed: "IL", "DL", "IL10", "IL15", "IL60",
        # "INJL", "RECALLED", "ACTIVATION"
        IL_FRAGMENTS    = {"il", "dl", "inj", "injured"}
        RETURN_FRAGMENTS = {"activat", "recall", "reinstat"}

        # Build the latest relevant transaction per player. The MLB transaction
        # endpoint is not guaranteed to return rows in the order we need; the old
        # code could mark a player IL from an older placement even when a newer
        # activation/reinstatement existed in the same 30-day window.
        latest_relevant: dict[int, tuple[str, str]] = {}
        for txn in txns.get("transactions", []):
            pid  = txn.get("person", {}).get("id")
            if not pid:
                continue
            code = (txn.get("typeCode") or "").lower()
            desc = (txn.get("description") or "").lower()
            combined = code + " " + desc
            is_return = any(f in combined for f in RETURN_FRAGMENTS)
            is_il     = any(f in combined for f in IL_FRAGMENTS)
            if not (is_return or is_il):
                continue
            tx_date = (txn.get("date") or txn.get("effectiveDate") or txn.get("transactionDate") or "")
            kind = "return" if is_return else (code or "il")
            prev = latest_relevant.get(pid)
            if prev is None or tx_date >= prev[0]:
                latest_relevant[pid] = (tx_date, kind)

        for pid, (_tx_date, kind_or_code) in latest_relevant.items():
            if kind_or_code == "return":
                result.pop(pid, None)
            else:
                result.setdefault(pid, kind_or_code)
    except Exception as e:
        logger.warning("IL transaction fetch failed: %s", e)

    return result


async def get_all_teams() -> list[dict]:
    data = await _get("/teams", {"sportId": 1, "activeStatus": "Yes"})
    return data.get("teams", [])


# ESPN-style position eligibility groupings
# Maps MLB position abbreviations to the canonical fantasy positions they grant
_POS_ELIGIBILITY_MAP = {
    "C":   ["C"],
    "1B":  ["1B"],
    "2B":  ["2B"],
    "3B":  ["3B"],
    "SS":  ["SS"],
    "LF":  ["OF"],
    "CF":  ["OF"],
    "RF":  ["OF"],
    "OF":  ["OF"],
    "DH":  ["DH"],
    "SP":  ["SP"],
    "RP":  ["RP"],
    "P":   ["SP", "RP"],  # generic P → both SP and RP eligible (for fantasy slot purposes)
}

# ESPN eligibility thresholds
_ESPN_BATTER_PREV_GAMES = 20   # games at position in previous season
_ESPN_BATTER_CURR_GAMES = 10   # games at position in current season (mid-season)
_ESPN_SP_STARTS         = 5    # starts in previous season
_ESPN_RP_RELIEF         = 8    # relief appearances in previous season


def _build_positions(entry: dict, elig_stats: dict | None = None) -> list[str]:
    """
    Compute ESPN-style fantasy position eligibility.

    PITCHERS:
      SP eligible: >= 5 starts in previous season
      RP eligible: >= 8 relief appearances in previous season
      Falls back to current season if previous season is empty (trade, new player).

    HITTERS:
      Eligible at a position: >= 20 games there in previous season
                           OR >= 10 games there in current season
      Uses MLB fielding stats per position — NOT allPositions (which has no game counts).
      allPositions used ONLY as last-resort fallback when no fielding stats.

    elig_stats: dict from get_team_eligibility_stats(), or None for fallback-only mode.
    """
    person  = entry.get("person", {})
    primary = entry.get("position", {}).get("abbreviation", "")
    ALL_PITCHER = {"SP", "RP", "P", "CP"}
    mlb_id  = (entry.get("person") or {}).get("id")

    # ── PITCHERS ──────────────────────────────────────────────────────────────
    if primary in ALL_PITCHER:
        is_cp = primary == "CP"
        elig  = []

        if elig_stats and mlb_id:
            pp = elig_stats.get("pitching_prev", {}).get(mlb_id, {})
            pc = elig_stats.get("pitching_curr", {}).get(mlb_id, {})

            starts_prev  = pp.get("starts",  0)
            relief_prev  = pp.get("relief",  0)
            starts_curr  = pc.get("starts",  0)
            relief_curr  = pc.get("relief",  0)

            # Primary check: previous season (ESPN rule)
            if starts_prev >= _ESPN_SP_STARTS:
                elig.append("SP")
            if relief_prev >= _ESPN_RP_RELIEF or is_cp:
                elig.append("RP")

            # If no previous season data, use current season (new/traded player)
            if not elig:
                if starts_curr >= _ESPN_SP_STARTS:
                    elig.append("SP")
                if relief_curr >= _ESPN_RP_RELIEF or is_cp:
                    elig.append("RP")

        if not elig:
            # No stats at all — fall back to roster designation
            if is_cp or primary == "RP":
                return ["RP"]
            if primary == "SP":
                return ["SP"]
            return ["SP", "RP"]  # generic P, truly unknown

        return elig

    # ── HITTERS ───────────────────────────────────────────────────────────────
    if elig_stats and mlb_id:
        fp = elig_stats.get("fielding_prev", {}).get(mlb_id, {})   # {pos: games} 2025
        fc = elig_stats.get("fielding_curr", {}).get(mlb_id, {})   # {pos: games} 2026

        eligible_positions = set()
        all_positions = set(fp.keys()) | set(fc.keys())

        for pos in all_positions:
            if pos in ALL_PITCHER:
                continue
            games_prev = fp.get(pos, 0)
            games_curr = fc.get(pos, 0)
            if games_prev >= _ESPN_BATTER_PREV_GAMES or games_curr >= _ESPN_BATTER_CURR_GAMES:
                eligible_positions.add(pos)

        if eligible_positions:
            # Map raw MLB positions to fantasy positions, dedupe
            seen   = set()
            result = []
            # Primary position first
            for abbr in [primary] + sorted(eligible_positions - {primary}):
                for elig in _POS_ELIGIBILITY_MAP.get(abbr, [abbr] if abbr else []):
                    if elig and elig not in seen and elig not in ALL_PITCHER:
                        seen.add(elig)
                        result.append(elig)
            return result or [primary]

    # Fallback: allPositions (no game counts, last resort)
    all_pos_raw = person.get("allPositions") or entry.get("allPositions") or []
    abbrevs     = [p.get("abbreviation", "") for p in all_pos_raw
                   if p.get("abbreviation") and p.get("abbreviation") not in ALL_PITCHER]
    if not abbrevs:
        abbrevs = [primary] if primary and primary not in ALL_PITCHER else []

    seen   = set()
    result = []
    for abbr in abbrevs:
        for elig in _POS_ELIGIBILITY_MAP.get(abbr, [abbr] if abbr else []):
            if elig and elig not in seen:
                seen.add(elig)
                result.append(elig)

    primary_mapped = _POS_ELIGIBILITY_MAP.get(primary, [primary] if primary else [])
    for p in reversed(primary_mapped):
        if p in result:
            result.remove(p)
            result.insert(0, p)

    return result or ([primary] if primary else [])


def parse_player_from_roster_entry(entry: dict, elig_stats: dict | None = None) -> dict:
    person = entry.get("person", {})
    pos    = entry.get("position", {})
    status = entry.get("status", {}).get("description", "")
    return {
        "mlb_id":     person.get("id"),
        "name":       person.get("fullName", ""),
        "name_short": person.get("initLastName", ""),
        "positions":  _build_positions(entry, elig_stats=elig_stats),
        "active":     True,
        "_il_status": status,
    }


async def get_schedule_range(team_ids: list[int], start: date, end: date) -> list[dict]:
    """Get schedule for a set of teams across a date range (for week/projection view).
    Includes probable pitchers for future dates when available from the MLB API.
    """
    results = []
    current = start
    while current <= end:
        try:
            games = await get_daily_schedule(current)
            for game in games:
                home_id = game.get("teams", {}).get("home", {}).get("team", {}).get("id")
                away_id = game.get("teams", {}).get("away", {}).get("team", {}).get("id")
                if home_id in team_ids or away_id in team_ids:
                    # Extract probable pitchers for both sides
                    home_prob = _probable_pitcher(game, "home")
                    away_prob = _probable_pitcher(game, "away")
                    results.append({
                        "date":             current.isoformat(),
                        "game_pk":          game.get("gamePk"),
                        "home_team_id":     home_id,
                        "away_team_id":     away_id,
                        "home_abbr":        game.get("teams",{}).get("home",{}).get("team",{}).get("abbreviation",""),
                        "away_abbr":        game.get("teams",{}).get("away",{}).get("team",{}).get("abbreviation",""),
                        "game_time":        _parse_game_time(game.get("gameDate","")),
                        "game_status":      game.get("status",{}).get("detailedState",""),
                        "venue_name":       game.get("venue",{}).get("name",""),
                        # Probable pitchers (mlb_id + name, may be None if not yet announced)
                        "home_prob_sp_id":  home_prob.get("id"),
                        "home_prob_sp":     home_prob.get("fullName") or home_prob.get("name") or home_prob.get("displayName"),
                        "away_prob_sp_id":  away_prob.get("id"),
                        "away_prob_sp":     away_prob.get("fullName") or away_prob.get("name") or away_prob.get("displayName"),
                    })
        except Exception as e:
            logger.warning("Schedule fetch failed for %s: %s", current, e)
        current += timedelta(days=1)
    return results
