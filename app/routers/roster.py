"""
Roster router — returns entries with today_status AND live stats embedded.
"""
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session, joinedload
from typing import Optional, List
from datetime import date, timedelta, datetime
from zoneinfo import ZoneInfo
import asyncio

CDT = ZoneInfo("America/Chicago")

def get_cdt_today() -> str:
    """Return today's date in CDT — matches what the scheduler and frontend use."""
    return datetime.now(CDT).date().isoformat()

from ..database import get_db
from ..models import (
    FantasyRosterEntry, Player, DailyPlayerStatus,
    RosterStatus, PlayerStatus, PlayerUsageStat, EventLog, PlayerPositionEvent
)
from ..schemas import (
    RosterEntryCreate, RosterEntryUpdate, PlayerDetailOut,
    StatsOut, MessageOut
)

router = APIRouter(prefix="/roster", tags=["roster"])


_TEAM_ABBR_ALIASES = {
    "ARI": {"AZ"}, "AZ": {"ARI"},
    "ATH": {"OAK"}, "OAK": {"ATH"},
    "CHW": {"CWS"}, "CWS": {"CHW"},
    "WSH": {"WAS"}, "WAS": {"WSH"},
    "SFG": {"SF"}, "SF": {"SFG"},
    "KCR": {"KC"}, "KC": {"KCR"},
    "SDP": {"SD"}, "SD": {"SDP"},
    "TBR": {"TB"}, "TB": {"TBR"},
    "LAD": {"LA"}, "LA": {"LAD"},
}

def _team_variants(abbr: str | None) -> set[str]:
    base = (abbr or "").upper().replace(".", "").replace(" ", "").strip()
    if not base:
        return set()
    out = {base}
    out.update(_TEAM_ABBR_ALIASES.get(base, set()))
    return out

def _team_match(a: str | None, b: str | None) -> bool:
    return bool(_team_variants(a) & _team_variants(b))


def _load_entry(entry_id: int, db: Session) -> FantasyRosterEntry:
    entry = (
        db.query(FantasyRosterEntry)
        .options(joinedload(FantasyRosterEntry.player))
        .filter(FantasyRosterEntry.id == entry_id)
        .first()
    )
    if not entry:
        raise HTTPException(404, "Roster entry not found")
    return entry


def _today_status(player_id: int, date_str: str, db: Session):
    return (
        db.query(DailyPlayerStatus)
        .filter(
            DailyPlayerStatus.player_id == player_id,
            DailyPlayerStatus.date == date_str,
        )
        .first()
    )


def _status_to_dict(s) -> dict | None:
    if s is None:
        return None
    return {
        "id":            s.id,
        "player_id":     s.player_id,
        "date":          s.date,
        "status":        s.status.value if s.status else "unknown",
        "in_lineup":     s.in_lineup or False,
        "batting_order": s.batting_order,
        "fielding_pos":  s.fielding_pos,
        "opponent":      s.opponent,
        "sp_hand":       s.sp_hand,
        "sp_name":       s.sp_name,
        "game_id":       s.game_id,
        "game_time":     getattr(s, "game_time", None),
        "game_status":   getattr(s, "game_status", None),
        "venue_name":    getattr(s, "venue_name", None),
        "is_dome":          getattr(s, "is_dome", False) or False,
        "team_has_game":    getattr(s, "team_has_game", False) or False,
        "lineup_confirmed":    getattr(s, "lineup_confirmed", False) or False,
        "is_probable_starter": getattr(s, "is_probable_starter", False) or False,
    }


def _usage_starts(player_id: int, usage_map: dict | None) -> dict:
    """Extract l7/l14/l30 start counts from usage map."""
    if not usage_map or player_id not in usage_map:
        return {"l7": 0, "l14": 0, "l30": 0}
    u = usage_map[player_id]
    return {
        "l7":  u.l7_starts  or 0,
        "l14": u.l14_starts or 0,
        "l30": u.l30_starts or 0,
    }

def _entry_to_dict(entry, date_str: str, db: Session, live_stats: dict | None = None, usage_map: dict | None = None) -> dict:
    p  = entry.player
    ts = _today_status(p.id, date_str, db)

    # Look up live stats for this player
    player_stats = {}
    if live_stats and p.mlb_id and p.mlb_id in live_stats:
        player_stats = live_stats[p.mlb_id]
    elif ts and (ts.batting_stats or ts.pitching_stats):
        # Historical date or stats not yet live — serve cached DB stats
        from ..services.stats_service import format_stat_line, calculate_fantasy_score
        batting  = ts.batting_stats  or {}
        pitching = ts.pitching_stats or {}
        is_pitcher = bool(pitching) and not bool(batting)
        player_stats = {
            "batting":       batting,
            "pitching":      pitching,
            "is_pitcher":    is_pitcher,
            "position":      ts.fielding_pos or "",
            "stat_line":     format_stat_line(batting, pitching, is_pitcher),
            "game_score":    "",
            "game_result":   "",
            "game_pk":       ts.game_id,
            "is_final":      ts.game_status in ("Final", "Game Over") if ts.game_status else False,
            "game_status":   ts.game_status or "",
        }

    # espn_positions overrides computed Player.positions when set by the user
    espn_pos = getattr(entry, "espn_positions", None)
    effective_positions = espn_pos if espn_pos else (p.positions or [])

    return {
        "id":             entry.id,
        "player_id":      p.id,
        "status":         entry.status.value,
        "fantasy_pos":    entry.fantasy_pos,
        "notes":          entry.notes,
        "espn_positions": espn_pos,          # user-set override (None = use computed)
        "added_at":       entry.added_at.isoformat() if entry.added_at else None,
        "player": {
            "id":         p.id,
            "mlb_id":     p.mlb_id,
            "name":       p.name,
            "name_short": p.name_short,
            "team":       p.team,
            "team_id":    p.team_id,
            "positions":  effective_positions,   # ESPN override if set, else MLB-computed
            "bats":       p.bats,
            "throws":     p.throws,
            "active":     p.active,
        },
        "today_status": _status_to_dict(ts),
        "live_stats":   {
            **player_stats,
            "usage_starts": _usage_starts(p.id, usage_map),
        },
    }


def _fetch_live_stats_sync(game_date: date) -> dict:
    """Synchronously fetch today's boxscore stats."""
    try:
        from ..services.stats_service import get_today_stats
        loop = asyncio.new_event_loop()
        try:
            return loop.run_until_complete(get_today_stats(game_date))
        finally:
            loop.close()
    except Exception as e:
        import logging
        logging.getLogger(__name__).warning("Live stats fetch failed: %s", e)
        return {}


@router.get("/")
def list_roster(
    status: Optional[RosterStatus] = Query(None),
    include_stats: bool = Query(True),
    db: Session = Depends(get_db),
):
    today_str = get_cdt_today()

    q = db.query(FantasyRosterEntry).options(joinedload(FantasyRosterEntry.player))
    if status:
        q = q.filter(FantasyRosterEntry.status == status)
    entries = q.order_by(FantasyRosterEntry.added_at.desc()).all()

    # Fetch live stats from MLB boxscores
    live_stats = _fetch_live_stats_sync(date.fromisoformat(today_str)) if include_stats else {}

    # Fetch usage stats for all roster players to include l7/l14/l30 start frequencies
    player_ids = [e.player_id for e in entries]
    usage_rows = (
        db.query(PlayerUsageStat)
        .filter(PlayerUsageStat.player_id.in_(player_ids))
        .all()
    ) if player_ids else []
    usage_map = {u.player_id: u for u in usage_rows}

    return [_entry_to_dict(e, today_str, db, live_stats, usage_map) for e in entries]


@router.get("/date/{view_date}")
def list_roster_for_date(view_date: str, db: Session = Depends(get_db)):
    try:
        parsed = date.fromisoformat(view_date)
    except ValueError:
        raise HTTPException(400, "Invalid date format — use YYYY-MM-DD")

    entries = (
        db.query(FantasyRosterEntry)
        .options(joinedload(FantasyRosterEntry.player))
        .all()
    )

    # Only fetch live stats for today or past dates
    live_stats = {}
    if parsed <= date.fromisoformat(get_cdt_today()):
        live_stats = _fetch_live_stats_sync(parsed)

    player_ids = [e.player_id for e in entries]
    usage_rows = (
        db.query(PlayerUsageStat)
        .filter(PlayerUsageStat.player_id.in_(player_ids))
        .all()
    ) if player_ids else []
    usage_map = {u.player_id: u for u in usage_rows}

    return [_entry_to_dict(e, view_date, db, live_stats, usage_map) for e in entries]


@router.post("/", status_code=201)
def add_to_roster(payload: RosterEntryCreate, db: Session = Depends(get_db)):
    player = db.query(Player).filter(Player.id == payload.player_id).first()
    if not player:
        raise HTTPException(404, "Player not found")
    existing = (
        db.query(FantasyRosterEntry)
        .filter(FantasyRosterEntry.player_id == payload.player_id)
        .first()
    )
    if existing:
        raise HTTPException(409, f"Player already on {existing.status.value}")
    entry = FantasyRosterEntry(**payload.model_dump())
    db.add(entry)
    db.add(EventLog(event_type="roster_add", player_id=payload.player_id,
                    payload={"status": payload.status.value}))
    db.commit()
    db.refresh(entry)
    return _entry_to_dict(entry, get_cdt_today(), db, {})


@router.patch("/{entry_id}")
def update_entry(entry_id: int, payload: RosterEntryUpdate, db: Session = Depends(get_db)):
    entry = _load_entry(entry_id, db)
    old_status = entry.status
    for field, value in payload.model_dump(exclude_none=True).items():
        setattr(entry, field, value)
    if payload.espn_positions is not None:
        entry.espn_positions = payload.espn_positions if payload.espn_positions else None
        from sqlalchemy.orm.attributes import flag_modified
        flag_modified(entry, "espn_positions")

    if payload.status and payload.status != old_status:
        db.add(EventLog(
            event_type="roster_status_change", player_id=entry.player_id,
            payload={"from": old_status.value, "to": payload.status.value},
        ))
    db.commit()
    db.refresh(entry)
    return _entry_to_dict(entry, get_cdt_today(), db, {})



@router.post("/bulk-delete")
def bulk_delete_roster_entries(payload: dict, db: Session = Depends(get_db)):
    """Remove multiple FANTAG roster/watch/IL entries at once. This does not touch ESPN."""
    raw_ids = payload.get("entry_ids") or []
    try:
        entry_ids = sorted({int(x) for x in raw_ids})
    except Exception:
        raise HTTPException(400, "entry_ids must be a list of integers")
    if not entry_ids:
        raise HTTPException(400, "No entry_ids supplied")
    if len(entry_ids) > 200:
        raise HTTPException(400, "Bulk delete limit is 200 entries at a time")
    entries = db.query(FantasyRosterEntry).options(joinedload(FantasyRosterEntry.player)).filter(FantasyRosterEntry.id.in_(entry_ids)).all()
    found_ids = {e.id for e in entries}
    missing = [i for i in entry_ids if i not in found_ids]
    removed = []
    for entry in entries:
        removed.append({"entry_id": entry.id, "player_id": entry.player_id, "name": entry.player.name if entry.player else None, "status": entry.status.value})
        db.add(EventLog(event_type="roster_bulk_remove", player_id=entry.player_id, payload={"entry_id": entry.id, "status": entry.status.value}))
        db.delete(entry)
    db.commit()
    return {"message": f"Removed {len(removed)} player(s)", "removed_count": len(removed), "missing_ids": missing, "removed": removed}

@router.delete("/{entry_id}", response_model=MessageOut)
def remove_from_roster(entry_id: int, db: Session = Depends(get_db)):
    entry = _load_entry(entry_id, db)
    db.add(EventLog(event_type="roster_remove", player_id=entry.player_id,
                    payload={"status": entry.status.value}))
    db.delete(entry)
    db.commit()
    return {"message": "Removed"}


@router.get("/stats", response_model=StatsOut)
def get_stats(db: Session = Depends(get_db)):
    today = get_cdt_today()
    roster_ids = [
        r.player_id for r in
        db.query(FantasyRosterEntry).filter(FantasyRosterEntry.status.in_([RosterStatus.roster, RosterStatus.il])).all()
    ]
    today_statuses = (
        db.query(DailyPlayerStatus)
        .filter(DailyPlayerStatus.date == today, DailyPlayerStatus.player_id.in_(roster_ids))
        .all()
    ) if roster_ids else []
    status_map = {s.player_id: s for s in today_statuses}
    # IL count: check daily status OR roster entry slot (il slot = definitely on IL)
    il_entry_ids = {
        e.player_id for e in
        db.query(FantasyRosterEntry).filter(FantasyRosterEntry.status == RosterStatus.il).all()
    }
    on_il_count = sum(
        1 for pid in roster_ids
        if pid in il_entry_ids
        or (status_map.get(pid) and status_map[pid].status == PlayerStatus.il)
    )

    return StatsOut(
        roster_count=len(roster_ids),
        watch_count=db.query(FantasyRosterEntry).filter(FantasyRosterEntry.status == RosterStatus.watch).count(),
        starting_today=sum(1 for s in today_statuses if s.in_lineup),
        on_il=on_il_count,
        dtd_count=sum(1 for pid in roster_ids if status_map.get(pid) and status_map[pid].status == PlayerStatus.dtd),
    )


@router.get("/lineup-status")
def get_lineup_status(db: Session = Depends(get_db)):
    """
    Returns teams that have an actual posted/confirmed batting lineup today.

    b85 regression fix:
    Do not treat a team as lineup-confirmed just because any DailyPlayerStatus row
    has lineup_confirmed=True. Probable starting-pitcher rows and schedule hydration
    can set that flag before the hitting lineup is posted, which made active hitters
    show as red "not starting" too early.

    A team is confirmed only when at least one non-pitcher batting-row style status
    exists for today: in_lineup=True, a batting_order, or a real fielding_pos.
    """
    today = get_cdt_today()

    confirmed_rows = (
        db.query(Player.team)
        .join(DailyPlayerStatus, DailyPlayerStatus.player_id == Player.id)
        .filter(
            DailyPlayerStatus.date == today,
            DailyPlayerStatus.lineup_confirmed == True,  # noqa: E712
            (
                (DailyPlayerStatus.in_lineup == True) |  # noqa: E712
                (DailyPlayerStatus.batting_order.isnot(None)) |
                (
                    DailyPlayerStatus.fielding_pos.isnot(None) &
                    (DailyPlayerStatus.fielding_pos.notin_(["", "—", "-", "P", "SP", "RP", "CP", "BN", "BENCH", "OUT", "IL"]))
                )
            ),
        )
        .distinct()
        .all()
    )
    confirmed_teams = [row[0] for row in confirmed_rows if row[0]]

    # Also find teams that play today (team_has_game) for context
    playing_rows = (
        db.query(Player.team)
        .join(DailyPlayerStatus, DailyPlayerStatus.player_id == Player.id)
        .filter(
            DailyPlayerStatus.date == today,
            DailyPlayerStatus.team_has_game == True,  # noqa: E712
        )
        .distinct()
        .all()
    )
    playing_teams = [row[0] for row in playing_rows if row[0]]

    return {
        "lineup_confirmed_teams": confirmed_teams,
        "teams_playing_today":    playing_teams,
        "date":                   today,
    }




@router.get("/daily-status")
def get_daily_roster_status(view_date: Optional[str] = Query(None), db: Session = Depends(get_db)):
    """Flat sanity-check view of FANTAG roster + DailyPlayerStatus for a date."""
    day = view_date or get_cdt_today()
    try:
        date.fromisoformat(day)
    except ValueError:
        raise HTTPException(400, "Invalid date format — use YYYY-MM-DD")

    entries = (
        db.query(FantasyRosterEntry)
        .options(joinedload(FantasyRosterEntry.player))
        .all()
    )
    rows = []
    for entry in entries:
        p = entry.player
        ts = _today_status(p.id, day, db) if p else None
        positions = (entry.espn_positions or (p.positions if p else []) or [])
        rows.append({
            "entry_id": entry.id,
            "player_id": p.id if p else None,
            "mlb_id": p.mlb_id if p else None,
            "name": p.name if p else None,
            "team": p.team if p else None,
            "positions": positions,
            "is_pitcher": bool(any(pos in ["SP", "RP", "P", "CP"] for pos in positions)),
            "fantag_roster_status": entry.status.value if entry.status else None,
            "espn_slot": entry.fantasy_pos,
            "daily_status": _status_to_dict(ts),
        })
    return {"date": day, "count": len(rows), "rows": rows}


@router.get("/rp-workload")
def get_rp_workload(db: Session = Depends(get_db)):
    """
    For each RP/closer on the roster, return recent game appearances (last 7 days),
    days of rest, total recent IP, and an availability score (0-100).
    Higher score = more available (well-rested, low recent workload).
    """
    from ..services.stats_service import get_pitcher_recent_game_log, _parse_ip
    from datetime import timedelta

    today = get_cdt_today()
    today_date = date.fromisoformat(today)

    # Get all rostered pitchers
    entries = (
        db.query(FantasyRosterEntry)
        .options(joinedload(FantasyRosterEntry.player))
        .filter(FantasyRosterEntry.status == RosterStatus.roster)
        .all()
    )

    result = []
    for entry in entries:
        p = entry.player
        pos = p.positions or []
        # Only process RPs (pure RP/CP, no SP eligibility)
        if not any(x in pos for x in ["RP", "CP"]):
            continue
        if any(x in pos for x in ["SP"]):
            continue  # skip true two-way pitchers (handled as SP)

        if not p.mlb_id:
            continue

        # Read last 7 days of DailyPlayerStatus for this pitcher
        seven_days_ago = (today_date - timedelta(days=7)).isoformat()
        recent_rows = (
            db.query(DailyPlayerStatus)
            .filter(
                DailyPlayerStatus.player_id == p.id,
                DailyPlayerStatus.date >= seven_days_ago,
                DailyPlayerStatus.date < today,  # exclude today (not yet final)
            )
            .order_by(DailyPlayerStatus.date.desc())
            .all()
        )

        # Compute workload from stored ip_pitched
        appearances = []
        total_ip_3d = 0.0
        total_ip_7d = 0.0
        last_pitched_date = None
        three_days_ago = (today_date - timedelta(days=3)).isoformat()

        for row in recent_rows:
            ip = row.ip_pitched or 0.0
            if ip > 0:
                appearances.append({"date": row.date, "ip": ip})
                total_ip_7d += ip
                if row.date >= three_days_ago:
                    total_ip_3d += ip
                if last_pitched_date is None:
                    last_pitched_date = row.date

        # Days of rest since last appearance
        days_rest = None
        if last_pitched_date:
            days_rest = (today_date - date.fromisoformat(last_pitched_date)).days

        # Availability score (0-100)
        # Start at 80 (baseline for any RP with team playing)
        # Subtract for recent heavy use, add for rest
        score = 80
        if total_ip_3d >= 3.0:   score -= 40   # pitched a lot in last 3 days
        elif total_ip_3d >= 2.0:  score -= 25
        elif total_ip_3d >= 1.0:  score -= 10
        if days_rest is not None:
            if days_rest == 0:    score -= 20   # pitched yesterday (today = 0 rest)
            elif days_rest == 1:  score += 0    # normal
            elif days_rest >= 2:  score += 10   # well-rested
            elif days_rest >= 4:  score += 15   # very well-rested
        score = max(0, min(100, score))

        # Check if team plays today
        ts = _today_status(p.id, today, db)
        team_plays = bool(ts and ts.team_has_game) if ts else False

        # Bullpen role: Closer / Setup / Middle
        # CP position code = designated closer on their roster
        pos = p.positions or []
        is_closer_by_pos = "CP" in pos

        # Use season saves/holds from recent game log if available
        # (ip_pitched stored in DailyPlayerStatus, but sv/hd not — derive from stats cache)
        sv_7d = 0
        hd_7d = 0
        for row in recent_rows:
            if row.pitching_stats:
                sv_7d += row.pitching_stats.get("saves", 0)
                hd_7d += row.pitching_stats.get("holds", 0)

        if is_closer_by_pos or sv_7d > 0:
            role = "Closer"
        elif hd_7d > 0:
            role = "Setup"
        else:
            role = "Middle"

        result.append({
            "player_id":         p.id,
            "mlb_id":            p.mlb_id,
            "name":              p.name,
            "team":              p.team,
            "team_plays_today":  team_plays,
            "days_rest":         days_rest,
            "total_ip_3d":       round(total_ip_3d, 1),
            "total_ip_7d":       round(total_ip_7d, 1),
            "appearances":       appearances,
            "availability_score": score,
            "role":              role,
            "sv_7d":             sv_7d,
            "hd_7d":             hd_7d,
            "recommendation":    (
                "⚡ High availability — well rested" if score >= 75 else
                "✓ Normal — use as needed"          if score >= 60 else
                "⚠ Moderate fatigue — monitor"      if score >= 45 else
                "🔴 Fatigued — avoid if possible"
            ),
        })

    result.sort(key=lambda x: x["availability_score"], reverse=True)
    return result


@router.get("/diagnostic")
def diagnostic(db: Session = Depends(get_db)):
    """
    Debug endpoint: shows today's DailyPlayerStatus rows for all rostered players.
    Use this to verify the lineup poll is working.
    """
    import asyncio as _asyncio
    from ..services.mlb_stats import get_all_lineups_today, get_all_il_players
    from ..services.stats_service import get_today_stats
    today = get_cdt_today()

    # What's in the DB right now
    entries = db.query(FantasyRosterEntry).options(joinedload(FantasyRosterEntry.player)).all()
    db_rows = []
    for e in entries:
        ts = _today_status(e.player_id, today, db)
        db_rows.append({
            "name":          e.player.name,
            "mlb_id":        e.player.mlb_id,
            "team":          e.player.team,
            "has_status_row": ts is not None,
            "in_lineup":     ts.in_lineup if ts else None,
            "batting_order": ts.batting_order if ts else None,
            "fielding_pos":  ts.fielding_pos if ts else None,
            "status":        ts.status.value if ts else None,
            "team_has_game": ts.team_has_game if ts else None,
            "lineup_confirmed": getattr(ts, "lineup_confirmed", None) if ts else None,
            "game_time":     ts.game_time if ts else None,
        })

    # Live MLB API call
    loop = asyncio.new_event_loop()
    try:
        lineup_data, team_contexts, probable_pitcher_ids = loop.run_until_complete(get_all_lineups_today())
        il_data = loop.run_until_complete(get_all_il_players())
    finally:
        loop.close()

    mlb_ids = {e.player.mlb_id for e in entries if e.player.mlb_id}
    live_status = {}
    for mid in mlb_ids:
        if mid in lineup_data:
            live_status[mid] = {"source": "lineup", "in_lineup": True,
                                "batting_order": lineup_data[mid].get("batting_order"),
                                "fielding_pos": lineup_data[mid].get("fielding_pos")}
        elif mid in il_data:
            live_status[mid] = {"source": "il_txn", "il_code": il_data[mid]}
        else:
            live_status[mid] = {"source": "none"}

    return {
        "cdt_today":      today,
        "db_rows":        db_rows,
        "mlb_live_count": len(lineup_data),
        "probable_pitcher_ids": sorted(list(probable_pitcher_ids)),
        "team_contexts":  len(team_contexts),
        "il_detected":    len(il_data),
        "per_player":     live_status,
    }


@router.get("/schedule")
def get_roster_schedule(
    days_ahead: int = Query(4, le=7),
    days_back:  int = Query(7, le=14),
    db: Session = Depends(get_db),
):
    from ..services.mlb_stats import get_schedule_range, get_daily_schedule, _parse_game_time
    entries = db.query(FantasyRosterEntry).options(joinedload(FantasyRosterEntry.player)).all()
    team_ids = list({e.player.team_id for e in entries if e.player and e.player.team_id})
    tracked_abbrs = set()
    for e in entries:
        if e.player and e.player.team:
            tracked_abbrs.update(_team_variants(e.player.team))
    today = date.fromisoformat(get_cdt_today())
    start = today - timedelta(days=days_back)
    end   = today + timedelta(days=days_ahead)

    async def _fetch_schedule():
        # First use the existing team-id path. Then overlay abbreviation-matched games.
        # This fixes cases where ESPN/Fantag uses ATH/AZ/CWS while MLB schedule uses
        # OAK/ARI/CHW variants, and cases where watch-list players have a missing team_id.
        rows = await get_schedule_range(team_ids, start, end)
        seen = {(r.get("date"), r.get("game_pk")) for r in rows}
        current = start
        while current <= end:
            try:
                games = await get_daily_schedule(current)
                for game in games:
                    home = game.get("teams", {}).get("home", {}).get("team", {}) or {}
                    away = game.get("teams", {}).get("away", {}).get("team", {}) or {}
                    home_abbr = home.get("abbreviation", "")
                    away_abbr = away.get("abbreviation", "")
                    home_id = home.get("id")
                    away_id = away.get("id")
                    if not (home_id in team_ids or away_id in team_ids or any(_team_match(home_abbr, t) or _team_match(away_abbr, t) for t in tracked_abbrs)):
                        continue
                    key = (current.isoformat(), game.get("gamePk"))
                    if key in seen:
                        continue
                    home_prob = game.get("teams", {}).get("home", {}).get("probablePitcher", {}) or game.get("homeProbablePitcher", {}) or {}
                    away_prob = game.get("teams", {}).get("away", {}).get("probablePitcher", {}) or game.get("awayProbablePitcher", {}) or {}
                    rows.append({
                        "date":             current.isoformat(),
                        "game_pk":          game.get("gamePk"),
                        "home_team_id":     home_id,
                        "away_team_id":     away_id,
                        "home_abbr":        home_abbr,
                        "away_abbr":        away_abbr,
                        "game_time":        _parse_game_time(game.get("gameDate", "")),
                        "game_status":      game.get("status", {}).get("detailedState", ""),
                        "venue_name":       game.get("venue", {}).get("name", ""),
                        "home_prob_sp_id":  home_prob.get("id"),
                        "home_prob_sp":     home_prob.get("fullName") or home_prob.get("name") or home_prob.get("displayName"),
                        "away_prob_sp_id":  away_prob.get("id"),
                        "away_prob_sp":     away_prob.get("fullName") or away_prob.get("name") or away_prob.get("displayName"),
                    })
                    seen.add(key)
            except Exception:
                pass
            current += timedelta(days=1)
        return rows

    loop = asyncio.new_event_loop()
    try:
        return loop.run_until_complete(_fetch_schedule())
    finally:
        loop.close()


@router.get("/{entry_id}/detail", response_model=PlayerDetailOut)
def get_player_detail(entry_id: int, db: Session = Depends(get_db)):
    entry = _load_entry(entry_id, db)
    today = get_cdt_today()
    today_date = date.fromisoformat(today)
    today_status = _today_status(entry.player_id, today, db)
    usage = db.query(PlayerUsageStat).filter(PlayerUsageStat.player_id == entry.player_id).first()
    game_log = (
        db.query(DailyPlayerStatus)
        .filter(DailyPlayerStatus.player_id == entry.player_id)
        .order_by(DailyPlayerStatus.date.desc())
        .limit(90)
        .all()
    )

    # When a player profile is viewed, make sure any existing daily-status rows
    # are also saved into the durable position-event table. This lets the profile
    # tabs populate even if the event table was added after earlier lineup polls.
    try:
        for g in game_log:
            existing_ev = (
                db.query(PlayerPositionEvent)
                .filter(PlayerPositionEvent.player_id == entry.player_id, PlayerPositionEvent.date == g.date)
                .first()
            )
            ev_data = {
                "source": "profile_backfill",
                "status": getattr(g.status, "value", g.status),
                "in_lineup": bool(g.in_lineup),
                "fielding_pos": g.fielding_pos,
                "batting_order": g.batting_order,
                "opponent": g.opponent,
                "sp_hand": g.sp_hand,
                "sp_name": g.sp_name,
                "game_id": g.game_id,
                "game_status": g.game_status,
                "lineup_confirmed": bool(g.lineup_confirmed),
                "team_has_game": bool(g.team_has_game),
            }
            if existing_ev:
                for k,v in ev_data.items():
                    if v is not None or k in ("in_lineup","lineup_confirmed","team_has_game"):
                        setattr(existing_ev, k, v)
            else:
                db.add(PlayerPositionEvent(player_id=entry.player_id, date=g.date, **ev_data))
        db.commit()
    except Exception:
        db.rollback()

    # Compute live start frequency from game log — always recalculate so it's never stale
    d7  = (today_date - timedelta(days=7)).isoformat()
    d14 = (today_date - timedelta(days=14)).isoformat()
    d30 = (today_date - timedelta(days=30)).isoformat()
    started_rows = [g for g in game_log if g.in_lineup]
    computed_starts = {
        "l7":  sum(1 for g in started_rows if g.date >= d7),
        "l14": sum(1 for g in started_rows if g.date >= d14),
        "l30": sum(1 for g in started_rows if g.date >= d30),
    }
    if usage is not None:
        usage.l7_starts  = computed_starts["l7"]
        usage.l14_starts = computed_starts["l14"]
        usage.l30_starts = computed_starts["l30"]

    # Fetch live boxscore stats for this player
    live_stats: dict = {}
    if entry.player.mlb_id:
        all_stats = _fetch_live_stats_sync(today_date)
        live_stats = all_stats.get(entry.player.mlb_id, {})

    # Always attach computed starts so frontend can use them even when usage_stats is null
    live_stats["computed_starts"] = computed_starts

    # Use ESPN eligibility override for the detail modal too. Without this,
    # the modal can show stale MLB-computed badges and miss DH eligibility.
    effective_positions = entry.espn_positions if entry.espn_positions else (entry.player.positions or [])
    player_payload = {
        "id": entry.player.id,
        "mlb_id": entry.player.mlb_id,
        "name": entry.player.name,
        "name_short": entry.player.name_short,
        "team": entry.player.team,
        "team_id": entry.player.team_id,
        "positions": effective_positions,
        "bats": entry.player.bats,
        "throws": entry.player.throws,
        "headshot_url": entry.player.headshot_url,
        "active": entry.player.active,
        "updated_at": entry.player.updated_at,
    }

    return PlayerDetailOut(
        player=player_payload,
        roster_entry=entry,
        today_status=today_status,
        usage_stats=usage,
        recent_game_log=game_log,
        live_stats=live_stats,
    )

@router.post("/repoll/{target_date}")
def repoll_date(target_date: str, db: Session = Depends(get_db)):
    """
    Re-run the full lineup poll for a specific past date (YYYY-MM-DD).
    Overwrites DailyPlayerStatus rows for that date using the MLB GUMBO
    final boxscore, which includes the pitchers[] array — correctly
    identifying the starting pitcher even in the DH era.
    Use this to backfill / correct historical dates where the SP was
    recorded as DNP before Build 24's GUMBO fix.
    """
    try:
        from datetime import date as _d
        _d.fromisoformat(target_date)   # validate format
    except ValueError:
        raise HTTPException(400, "Invalid date — use YYYY-MM-DD")

    # Block future dates
    from ..services.scheduler import _cdt_today
    if target_date > _cdt_today():
        raise HTTPException(400, "Cannot repoll a future date")

    try:
        from ..services.scheduler import poll_daily_lineups
        poll_daily_lineups(target_date=target_date)
        return {"status": "ok", "date": target_date,
                "message": f"Lineup data for {target_date} re-fetched from MLB GUMBO"}
    except Exception as e:
        raise HTTPException(500, str(e))



@router.get("/position-events")
def get_position_events(
    player_id: Optional[int] = Query(None),
    days: int = Query(45, ge=1, le=365),
    db: Session = Depends(get_db),
):
    """Return stored daily player position/status history."""
    start = (date.fromisoformat(get_cdt_today()) - timedelta(days=days)).isoformat()
    q = db.query(PlayerPositionEvent).options(joinedload(PlayerPositionEvent.player)).filter(PlayerPositionEvent.date >= start)
    if player_id is not None:
        q = q.filter(PlayerPositionEvent.player_id == player_id)
    rows = q.order_by(PlayerPositionEvent.date.desc(), PlayerPositionEvent.player_id.asc()).all()
    return {
        "count": len(rows),
        "rows": [
            {
                "id": r.id,
                "player_id": r.player_id,
                "name": r.player.name if r.player else None,
                "team": r.player.team if r.player else None,
                "date": r.date,
                "source": r.source,
                "status": r.status,
                "in_lineup": r.in_lineup,
                "fielding_pos": r.fielding_pos,
                "batting_order": r.batting_order,
                "opponent": r.opponent,
                "sp_hand": r.sp_hand,
                "sp_name": r.sp_name,
                "game_id": r.game_id,
                "game_status": r.game_status,
                "lineup_confirmed": r.lineup_confirmed,
                "team_has_game": r.team_has_game,
            }
            for r in rows
        ],
    }
@router.get("/debug-positions")
def debug_positions(db: Session = Depends(get_db)):
    """
    Show current Player.positions for all rostered players.
    Use this to verify what was actually saved after sync_team_rosters.
    """
    entries = (
        db.query(FantasyRosterEntry)
        .options(joinedload(FantasyRosterEntry.player))
        .all()
    )
    return [
        {
            "name":      e.player.name,
            "team":      e.player.team,
            "mlb_id":    e.player.mlb_id,
            "positions": e.player.positions,
        }
        for e in entries
    ]


@router.get("/debug-player-api/{mlb_id}")
def debug_player_api(mlb_id: int):
    """
    Show the raw MLB API roster entry for a specific player.
    Use this to verify what allPositions and career stats the API returns.
    e.g. curl http://localhost:8011/roster/debug-player-api/543135  (Eovaldi)
         curl http://localhost:8011/roster/debug-player-api/543877  (Salvador Perez)
    """
    import asyncio
    from ..services.mlb_stats import _get

    async def _fetch():
        # Fetch with same hydration used in sync
        hydrate = "person(allPositions,stats(type=career,group=pitching,gameType=R))"
        data = await _get("/sports/1/players", {"season": 2026, "gameType": "R"})
        # Find this player in the people list
        for person in data.get("people", []):
            if person.get("id") == mlb_id:
                return {"found": True, "person_endpoint": person}
        return {"found": False, "note": "Not in active roster list"}

    loop = asyncio.new_event_loop()
    try:
        result = loop.run_until_complete(_fetch())
    finally:
        loop.close()

    return result

@router.get("/lineup-source-audit")
def lineup_source_audit(db: Session = Depends(get_db)):
    """Debug the external lineup overlay without writing DB rows."""
    from ..routers.settings import _get_setting
    from ..services.mlb_stats import get_daily_schedule
    from ..services.external_lineups import fetch_external_lineup_overlay
    from datetime import date as _date

    today = get_cdt_today()
    games = asyncio.new_event_loop().run_until_complete(get_daily_schedule(_date.fromisoformat(today)))
    game_context_by_abbr = {}
    for g in games:
        status = g.get("status", {}).get("detailedState", "Scheduled")
        home = g.get("teams", {}).get("home", {}).get("team", {})
        away = g.get("teams", {}).get("away", {}).get("team", {})
        home_abbr, away_abbr = home.get("abbreviation"), away.get("abbreviation")
        if home_abbr:
            game_context_by_abbr[home_abbr] = {"game_id": g.get("gamePk"), "opponent": ("vs " + (away_abbr or "")).strip(), "game_status": status, "team_has_game": True, "lineup_confirmed": False}
        if away_abbr:
            game_context_by_abbr[away_abbr] = {"game_id": g.get("gamePk"), "opponent": ("@ " + (home_abbr or "")).strip(), "game_status": status, "team_has_game": True, "lineup_confirmed": False}

    players = [e.player for e in db.query(FantasyRosterEntry).options(joinedload(FantasyRosterEntry.player)).all() if e.player]
    primary = _get_setting(db, "lineup_source_primary", "rotowire")
    enabled = bool(_get_setting(db, "lineup_external_enabled", True))
    loop = asyncio.new_event_loop()
    try:
        result = loop.run_until_complete(fetch_external_lineup_overlay(players, game_context_by_abbr, _date.fromisoformat(today), primary_source=primary, enabled=enabled))
    finally:
        loop.close()
    return {
        "date": today,
        "primary_source": primary,
        "external_enabled": enabled,
        "teams_playing": sorted(game_context_by_abbr.keys()),
        "confirmed_team_abbrs": sorted(result.confirmed_team_abbrs),
        "matched_starters": len(result.lineups),
        "source_hits": result.source_hits[:200],
    }
