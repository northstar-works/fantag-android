"""
Stats service — fetches today's player stats from MLB boxscores
and calculates fantasy scores based on the user's scoring rules.
"""

import asyncio
import logging
from datetime import date

import httpx

from ..config import settings

logger = logging.getLogger(__name__)
BASE    = settings.MLB_STATS_API
TIMEOUT = httpx.Timeout(30.0)


async def _get(path: str, params: dict | None = None) -> dict:
    async with httpx.AsyncClient(timeout=TIMEOUT) as client:
        r = await client.get(f"{BASE}{path}", params=params)
        r.raise_for_status()
        return r.json()


def _parse_ip(ip_str) -> float:
    """Convert '5.2' (5 2/3 innings) to float 5.667"""
    try:
        s = str(ip_str or "0")
        if "." in s:
            full, frac = s.split(".")
            return int(full) + int(frac) / 3.0
        return float(s)
    except Exception:
        return 0.0


def calculate_fantasy_score(batting: dict, pitching: dict, scoring_rules: dict) -> float:
    score = 0.0
    br = scoring_rules.get("batting",  {})
    pr = scoring_rules.get("pitching", {})

    if batting:
        hits    = batting.get("hits",        0)
        doubles = batting.get("doubles",     0)
        triples = batting.get("triples",     0)
        hr      = batting.get("homeRuns",    0)
        singles = max(0, hits - doubles - triples - hr)
        score += singles * br.get("1B",   0)
        score += doubles * br.get("2B",   0)
        score += triples * br.get("3B",   0)
        score += hr      * br.get("HR",   0)
        score += hits    * br.get("H",    0)   # some leagues score H directly
        score += batting.get("runs",          0) * br.get("R",    0)
        score += batting.get("rbi",           0) * br.get("RBI",  0)
        score += batting.get("baseOnBalls",   0) * br.get("BB",   0)
        score += batting.get("intentionalWalks",0)*br.get("IBB",  0)
        score += batting.get("strikeOuts",    0) * br.get("K",    0)
        score += batting.get("stolenBases",   0) * br.get("SB",   0)
        score += batting.get("caughtStealing",0) * br.get("CS",   0)
        score += batting.get("hitByPitch",    0) * br.get("HBP",  0)
        score += batting.get("sacBunts",      0) * br.get("SAC",  0)
        score += batting.get("groundIntoDoublePlay",0)*br.get("GIDP",0)
        # XBH = doubles + triples + HR
        score += (doubles+triples+hr) * br.get("XBH", 0)
        # Total bases
        tb = singles + 2*doubles + 3*triples + 4*hr
        score += tb * br.get("TB", 0)

    if pitching:
        ip  = _parse_ip(pitching.get("inningsPitched", 0))
        score += ip                                   * pr.get("IP",  0)
        score += pitching.get("earnedRuns",     0)    * pr.get("ER",  0)
        score += pitching.get("homeRuns",       0)    * pr.get("HR",  0)
        score += pitching.get("baseOnBalls",    0)    * pr.get("BB",  0)
        score += pitching.get("strikeOuts",     0)    * pr.get("K",   0)
        score += pitching.get("wins",           0)    * pr.get("W",   0)
        score += pitching.get("losses",         0)    * pr.get("L",   0)
        score += pitching.get("saveOpportunities",0)  * pr.get("SOP", 0)
        score += pitching.get("saves",          0)    * pr.get("SV",  0)
        score += pitching.get("blownSaves",     0)    * pr.get("BS",  0)
        score += pitching.get("holds",          0)    * pr.get("HD",  0)
        score += pitching.get("shutouts",       0)    * pr.get("SO",  0)
        score += (1 if pitching.get("completeGames",0)>0 else 0) * pr.get("CG",0)

    return round(score, 1)


def format_stat_line(batting: dict, pitching: dict, is_pitcher: bool) -> str:
    """Build a compact stat summary string like '2-4, HR, 2 RBI' or '6 IP, 2 ER, 8 K'"""
    if is_pitcher and pitching:
        ip    = pitching.get("inningsPitched","0")
        er    = pitching.get("earnedRuns",0)
        k     = pitching.get("strikeOuts",0)
        w     = pitching.get("wins",0)
        sv    = pitching.get("saves",0)
        bs    = pitching.get("blownSaves",0)
        hd    = pitching.get("holds",0)
        parts = [f"{ip} IP", f"{er} ER", f"{k} K"]
        if w:  parts.append("W")
        if sv: parts.append(f"SV")
        if bs: parts.append("BS")
        if hd: parts.append("HD")
        return ", ".join(parts)
    elif batting:
        h   = batting.get("hits", 0)
        ab  = batting.get("atBats", 0)
        hr  = batting.get("homeRuns", 0)
        rbi = batting.get("rbi", 0)
        sb  = batting.get("stolenBases", 0)
        bb  = batting.get("baseOnBalls", 0)
        k   = batting.get("strikeOuts", 0)
        parts = [f"{h}-{ab}"]
        if hr:  parts.append(f"HR")
        if rbi: parts.append(f"{rbi} RBI")
        if sb:  parts.append(f"{sb} SB")
        if bb:  parts.append(f"BB")
        if k and not (h or hr or rbi): parts.append(f"{k} K")
        return ", ".join(parts)
    return ""


async def get_pitcher_recent_game_log(mlb_id: int, days: int = 7) -> list[dict]:
    """
    Returns list of recent pitching appearances for a player.
    Each entry: {date, ip, er, k, bb, sv, hd, bs, result}
    """
    from datetime import timedelta
    from zoneinfo import ZoneInfo as _Z; from datetime import datetime as _DT
    end   = _DT.now(_Z("America/Chicago")).date()
    start = end - timedelta(days=days)
    try:
        data = await _get(
            f"/people/{mlb_id}/stats",
            {
                "stats":     "gameLog",
                "group":     "pitching",
                "season":    end.year,
                "startDate": start.strftime("%Y-%m-%d"),
                "endDate":   end.strftime("%Y-%m-%d"),
            }
        )
        splits = data.get("stats", [{}])[0].get("splits", [])
        result = []
        for split in splits:
            s = split.get("stat", {})
            ip_raw = s.get("inningsPitched", "0")
            result.append({
                "date":   split.get("date", ""),
                "ip":     _parse_ip(ip_raw),
                "er":     s.get("earnedRuns", 0),
                "k":      s.get("strikeOuts", 0),
                "bb":     s.get("baseOnBalls", 0),
                "sv":     s.get("saves", 0),
                "hd":     s.get("holds", 0),
                "bs":     s.get("blownSaves", 0),
                "wins":   s.get("wins", 0),
                "losses": s.get("losses", 0),
            })
        return result
    except Exception as e:
        logger.warning("Pitcher game log fetch failed for %s: %s", mlb_id, e)
        return []


async def get_today_stats(game_date: date | None = None) -> dict[int, dict]:
    """
    Fetch boxscores for all completed/in-progress games today.
    Returns {mlb_player_id: {batting:{}, pitching:{}, stat_line:str, game_result:str, game_final:bool}}
    """
    if game_date is None:
        game_date = date.today()

    try:
        schedule_data = await _get("/schedule", {
            "sportId": 1,
            "date": game_date.strftime("%Y-%m-%d"),
            "hydrate": "linescore,boxscore",
        })
    except Exception as e:
        logger.error("Schedule fetch failed: %s", e)
        return {}

    player_stats: dict[int, dict] = {}

    for date_obj in schedule_data.get("dates", []):
        for game in date_obj.get("games", []):
            status = game.get("status", {}).get("detailedState", "")
            is_final = "Final" in status or "Game Over" in status
            is_live  = "In Progress" in status or "Manager" in status

            if not (is_final or is_live):
                continue

            game_pk = game.get("gamePk")

            # Game score string: "PHI 5, TEX 3 Final"
            linescore = game.get("linescore", {})
            teams_ls  = linescore.get("teams", {})
            home_runs = teams_ls.get("home", {}).get("runs", "")
            away_runs = teams_ls.get("away", {}).get("runs", "")
            home_abbr = game.get("teams",{}).get("home",{}).get("team",{}).get("abbreviation","")
            away_abbr = game.get("teams",{}).get("away",{}).get("team",{}).get("abbreviation","")

            if home_runs != "" and away_runs != "":
                game_score = f"{away_abbr} {away_runs} @ {home_abbr} {home_runs}"
                if is_final:
                    game_score += " Final"
            else:
                inning = linescore.get("currentInning","")
                half   = linescore.get("inningHalf","")
                game_score = f"{half} {inning}" if inning else "In Progress"

            # Parse boxscore
            boxscore = game.get("boxscore", {})
            if not boxscore:
                continue

            for team_side in ["home", "away"]:
                team_abbr_side = home_abbr if team_side == "home" else away_abbr
                opp_abbr       = away_abbr if team_side == "home" else home_abbr
                team_runs      = home_runs if team_side=="home" else away_runs
                opp_runs       = away_runs if team_side=="home" else home_runs

                # Determine W/L for this team
                if is_final and team_runs != "" and opp_runs != "":
                    result_prefix = "W" if int(team_runs) > int(opp_runs) else "L"
                else:
                    result_prefix = ""

                team_data = boxscore.get("teams", {}).get(team_side, {})
                for pid_str, pdata in team_data.get("players", {}).items():
                    try:
                        mlb_id = int(pid_str.replace("ID", ""))
                    except Exception:
                        continue

                    stats    = pdata.get("stats", {})
                    batting  = stats.get("batting",  {})
                    pitching = stats.get("pitching", {})

                    # Skip players with absolutely no stats dicts at all
                    if not batting and not pitching:
                        continue
                    # Skip position players with zero plate appearances of any kind
                    # (keeps: BB, HBP, SAC, SAC fly, SB — i.e. any real contribution)
                    has_pa = (
                        batting.get("atBats",        0) > 0
                        or batting.get("baseOnBalls", 0) > 0
                        or batting.get("hitByPitch",  0) > 0
                        or batting.get("sacBunts",    0) > 0
                        or batting.get("sacFlies",    0) > 0
                        or batting.get("stolenBases", 0) > 0
                    )
                    if batting and not has_pa and not pitching:
                        continue

                    position = pdata.get("position", {}).get("abbreviation", "")
                    is_pitcher = position in ("P","SP","RP","LHP","RHP") or bool(pitching.get("inningsPitched"))

                    # Extract batting order from boxscore (stored as 100, 200, … 900)
                    raw_bat_order = pdata.get("battingOrder")
                    batting_order = None
                    if raw_bat_order is not None:
                        try:
                            batting_order = int(str(int(raw_bat_order))[0])
                        except Exception:
                            pass

                    player_stats[mlb_id] = {
                        "batting":       batting  if batting  else {},
                        "pitching":      pitching if pitching else {},
                        "is_pitcher":    is_pitcher,
                        "position":      position,
                        "batting_order": batting_order,
                        "stat_line":     format_stat_line(batting, pitching, is_pitcher),
                        "game_score":    game_score,
                        "game_result":   result_prefix,
                        "game_pk":       game_pk,
                        "is_final":      is_final,
                        "game_status":   status,
                    }

    return player_stats
