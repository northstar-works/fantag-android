"""Self-hosted ESPN Fantasy sync endpoints."""

from __future__ import annotations

from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from ..database import get_db
from .settings import _get_setting, _set_setting
from ..services.espn_fantasy import EspnFantasyClient, extract_team_roster, extract_watchlist, sync_espn_roster, sync_espn_watchlist, diff_fantag_vs_espn_watchlist, match_player, _is_espn_il_player

router = APIRouter(prefix="/espn", tags=["espn"])

DEFAULT_ESPN = {
    "espn_enabled": False,
    "espn_sport": "baseball",
    "espn_season": datetime.now().year,
    "espn_league_id": "",
    "espn_team_id": "",
    "espn_swid": "",
    "espn_s2": "",
}


class EspnConfigOut(BaseModel):
    enabled: bool
    sport: str
    season: int
    league_id: str
    team_id: str
    has_swid: bool
    has_espn_s2: bool


class EspnConfigPatch(BaseModel):
    enabled: Optional[bool] = None
    sport: Optional[str] = None
    season: Optional[int] = None
    league_id: Optional[str] = None
    team_id: Optional[str] = None
    swid: Optional[str] = None
    espn_s2: Optional[str] = None
    clear_cookies: bool = False


class EspnSyncRequest(BaseModel):
    reconcile: bool = Field(True, description="If true, mirror ESPN exactly by removing FANTAG roster/IL players not found on the ESPN team. Watch List is preserved.")


class EspnWatchSyncRequest(BaseModel):
    reconcile: bool = Field(True, description="If true, mirror ESPN Watch List exactly by removing FANTAG watch-only players not found on ESPN. My Roster and IL are preserved.")


def _cfg(db: Session) -> dict:
    return {k: _get_setting(db, k, v) for k, v in DEFAULT_ESPN.items()}


def _masked(cfg: dict) -> EspnConfigOut:
    return EspnConfigOut(
        enabled=bool(cfg.get("espn_enabled")),
        sport=cfg.get("espn_sport") or "baseball",
        season=int(cfg.get("espn_season") or datetime.now().year),
        league_id=str(cfg.get("espn_league_id") or ""),
        team_id=str(cfg.get("espn_team_id") or ""),
        has_swid=bool(cfg.get("espn_swid")),
        has_espn_s2=bool(cfg.get("espn_s2")),
    )


def _client_from_cfg(cfg: dict) -> EspnFantasyClient:
    missing = []
    if not cfg.get("espn_league_id"):
        missing.append("league ID")
    if not cfg.get("espn_swid"):
        missing.append("SWID cookie")
    if not cfg.get("espn_s2"):
        missing.append("espn_s2 cookie")
    if missing:
        raise HTTPException(400, "Missing ESPN " + ", ".join(missing))
    try:
        return EspnFantasyClient(
            sport=cfg.get("espn_sport") or "baseball",
            season=int(cfg.get("espn_season") or datetime.now().year),
            league_id=int(str(cfg.get("espn_league_id")).strip()),
            swid=str(cfg.get("espn_swid")),
            espn_s2=str(cfg.get("espn_s2")),
        )
    except ValueError as exc:
        raise HTTPException(400, str(exc))


@router.get("/config", response_model=EspnConfigOut)
def get_espn_config(db: Session = Depends(get_db)):
    return _masked(_cfg(db))


@router.patch("/config", response_model=EspnConfigOut)
def update_espn_config(payload: EspnConfigPatch, db: Session = Depends(get_db)):
    if payload.enabled is not None:
        _set_setting(db, "espn_enabled", payload.enabled)
    if payload.sport is not None:
        _set_setting(db, "espn_sport", payload.sport.strip().lower())
    if payload.season is not None:
        _set_setting(db, "espn_season", int(payload.season))
    if payload.league_id is not None:
        _set_setting(db, "espn_league_id", payload.league_id.strip())
    if payload.team_id is not None:
        _set_setting(db, "espn_team_id", payload.team_id.strip())
    if payload.clear_cookies:
        _set_setting(db, "espn_swid", "")
        _set_setting(db, "espn_s2", "")
    else:
        if payload.swid:
            _set_setting(db, "espn_swid", payload.swid.strip())
        if payload.espn_s2:
            _set_setting(db, "espn_s2", payload.espn_s2.strip())
    return _masked(_cfg(db))


@router.get("/league")
def preview_espn_league(db: Session = Depends(get_db)):
    cfg = _cfg(db)
    client = _client_from_cfg(cfg)
    try:
        league = client.fetch_league()
        configured_team = int(cfg.get("espn_team_id")) if str(cfg.get("espn_team_id") or "").strip() else None
        team, roster = extract_team_roster(league, configured_team)
    except PermissionError as exc:
        raise HTTPException(401, str(exc))
    except Exception as exc:
        raise HTTPException(502, f"ESPN preview failed: {exc}")

    teams = [
        {"id": t.get("id"), "name": " ".join(x for x in [t.get("location"), t.get("nickname")] if x).strip() or t.get("name") or f"Team {t.get('id')}"}
        for t in (league.get("teams") or [])
    ]
    return {
        "league_name": (league.get("settings") or {}).get("name") or league.get("name") or "ESPN League",
        "selected_team": {"id": team.get("id"), "name": " ".join(x for x in [team.get("location"), team.get("nickname")] if x).strip() or team.get("name")},
        "teams": teams,
        "roster_count": len(roster),
        "roster_preview": [p.__dict__ for p in roster[:40]],
    }


@router.post("/sync")
def sync_espn(payload: EspnSyncRequest = EspnSyncRequest(), db: Session = Depends(get_db)):
    cfg = _cfg(db)
    client = _client_from_cfg(cfg)
    try:
        league = client.fetch_league()
        configured_team = int(cfg.get("espn_team_id")) if str(cfg.get("espn_team_id") or "").strip() else None
        team, roster = extract_team_roster(league, configured_team)
        result = sync_espn_roster(db, roster, reconcile=payload.reconcile)
    except PermissionError as exc:
        raise HTTPException(401, str(exc))
    except Exception as exc:
        raise HTTPException(502, f"ESPN sync failed: {exc}")

    result["league_name"] = (league.get("settings") or {}).get("name") or league.get("name") or "ESPN League"
    result["team"] = {"id": team.get("id"), "name": " ".join(x for x in [team.get("location"), team.get("nickname")] if x).strip() or team.get("name")}
    return result

@router.post("/repair")
def repair_espn_sync_state(db: Session = Depends(get_db)):
    """Force a full ESPN mirror sync and cleanup stale FANTAG roster/IL rows."""
    cfg = _cfg(db)
    client = _client_from_cfg(cfg)
    try:
        league = client.fetch_league()
        configured_team = int(cfg.get("espn_team_id")) if str(cfg.get("espn_team_id") or "").strip() else None
        team, roster = extract_team_roster(league, configured_team)
        result = sync_espn_roster(db, roster, reconcile=True)
    except PermissionError as exc:
        raise HTTPException(401, str(exc))
    except Exception as exc:
        raise HTTPException(502, f"ESPN repair failed: {exc}")

    result["league_name"] = (league.get("settings") or {}).get("name") or league.get("name") or "ESPN League"
    result["team"] = {"id": team.get("id"), "name": " ".join(x for x in [team.get("location"), team.get("nickname")] if x).strip() or team.get("name")}
    result["mode"] = "repair/mirror"
    return result


@router.get("/watchlist")
def preview_espn_watchlist(db: Session = Depends(get_db)):
    cfg = _cfg(db)
    client = _client_from_cfg(cfg)
    try:
        league = client.fetch_watchlist()
        configured_team = int(cfg.get("espn_team_id")) if str(cfg.get("espn_team_id") or "").strip() else None
        team, watchlist = extract_watchlist(league, configured_team)
    except PermissionError as exc:
        raise HTTPException(401, str(exc))
    except Exception as exc:
        raise HTTPException(502, f"ESPN watchlist preview failed: {exc}")

    return {
        "league_name": (league.get("settings") or {}).get("name") or league.get("name") or "ESPN League",
        "team": {"id": team.get("id"), "name": " ".join(x for x in [team.get("location"), team.get("nickname")] if x).strip() or team.get("name")} if team else None,
        "count": len(watchlist),
        "players": [p.__dict__ for p in watchlist],
    }


@router.post("/watchlist/sync")
def sync_espn_watchlist_endpoint(payload: EspnWatchSyncRequest = EspnWatchSyncRequest(), db: Session = Depends(get_db)):
    cfg = _cfg(db)
    client = _client_from_cfg(cfg)
    try:
        league = client.fetch_watchlist()
        configured_team = int(cfg.get("espn_team_id")) if str(cfg.get("espn_team_id") or "").strip() else None
        team, watchlist = extract_watchlist(league, configured_team)
        result = sync_espn_watchlist(db, watchlist, reconcile=payload.reconcile)
    except PermissionError as exc:
        raise HTTPException(401, str(exc))
    except Exception as exc:
        raise HTTPException(502, f"ESPN watchlist sync failed: {exc}")

    result["league_name"] = (league.get("settings") or {}).get("name") or league.get("name") or "ESPN League"
    result["team"] = {"id": team.get("id"), "name": " ".join(x for x in [team.get("location"), team.get("nickname")] if x).strip() or team.get("name")} if team else None
    result["mode"] = "espn_watchlist_to_fantag"
    return result


@router.get("/watchlist-diff")
def espn_watchlist_diff(db: Session = Depends(get_db)):
    cfg = _cfg(db)
    client = _client_from_cfg(cfg)
    try:
        league = client.fetch_watchlist()
        configured_team = int(cfg.get("espn_team_id")) if str(cfg.get("espn_team_id") or "").strip() else None
        team, watchlist = extract_watchlist(league, configured_team)
        result = diff_fantag_vs_espn_watchlist(db, watchlist)
    except PermissionError as exc:
        raise HTTPException(401, str(exc))
    except Exception as exc:
        raise HTTPException(502, f"ESPN watchlist diff failed: {exc}")

    result["league_name"] = (league.get("settings") or {}).get("name") or league.get("name") or "ESPN League"
    result["team"] = {"id": team.get("id"), "name": " ".join(x for x in [team.get("location"), team.get("nickname")] if x).strip() or team.get("name")} if team else None
    return result

@router.get("/roster-audit")
def espn_roster_audit(db: Session = Depends(get_db)):
    cfg = _cfg(db)
    client = _client_from_cfg(cfg)
    try:
        league = client.fetch_league()
        configured_team = int(cfg.get("espn_team_id")) if str(cfg.get("espn_team_id") or "").strip() else None
        team, roster = extract_team_roster(league, configured_team)
    except PermissionError as exc:
        raise HTTPException(401, str(exc))
    except Exception as exc:
        raise HTTPException(502, f"ESPN roster audit failed: {exc}")

    rows = []
    for rp in roster:
        matched, match_type, confidence = match_player(db, rp)
        rows.append({
            "espn_name": rp.name,
            "espn_team": rp.team,
            "espn_id": rp.espn_id,
            "lineup_slot_id": rp.lineup_slot_id,
            "lineup_slot": rp.lineup_slot,
            "injury_status": rp.injury_status,
            "raw_eligible_slots": rp.raw_eligible_slots or [],
            "is_espn_il": _is_espn_il_player(rp.lineup_slot_id, rp.lineup_slot, rp.injury_status),
            "eligible_positions_saved": rp.eligible_positions,
            "matched_player_id": matched.id if matched else None,
            "matched_name": matched.name if matched else None,
            "matched_team": matched.team if matched else None,
            "match_type": match_type,
            "confidence": confidence,
        })
    return {
        "league_name": (league.get("settings") or {}).get("name") or league.get("name") or "ESPN League",
        "team": {"id": team.get("id"), "name": " ".join(x for x in [team.get("location"), team.get("nickname")] if x).strip() or team.get("name")},
        "count": len(rows),
        "rows": rows,
    }
