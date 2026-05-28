"""
Player Research Router
======================
Uses the Claude API with web_search tool to fetch current-season role,
position, and platoon data for any MLB player on demand.

Endpoints:
  GET  /research/{mlb_id}        — return stored research (may be stale)
  POST /research/{mlb_id}        — trigger fresh research via Claude API
  POST /research/batch           — research multiple players (rostered batch)
  GET  /research/roster          — research status for all rostered players
"""

import json
import logging
import os
import urllib.request
import urllib.error
from datetime import datetime, timezone, timedelta

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import Player, PlayerResearch, FantasyRosterEntry
from ..routers.settings import get_settings

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/research", tags=["research"])

ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages"
OPENAI_API_URL    = "https://api.openai.com/v1/chat/completions"
ANTHROPIC_MODEL   = "claude-sonnet-4-20250514"
OPENAI_MODEL      = "gpt-4o-search-preview"   # has built-in web search
STALE_HOURS       = 6


def _get_keys(db: Session) -> dict:
    """Return available API keys from settings + environment."""
    try:
        cfg = get_settings(db)
        openai_key    = cfg.get("openai_api_key")    or os.environ.get("OPENAI_API_KEY",    "")
        anthropic_key = cfg.get("anthropic_api_key") or os.environ.get("ANTHROPIC_API_KEY", "")
        provider      = cfg.get("ocr_provider", "openai")   # default openai
    except Exception:
        openai_key    = os.environ.get("OPENAI_API_KEY",    "")
        anthropic_key = os.environ.get("ANTHROPIC_API_KEY", "")
        provider      = "openai"
    return {"openai": openai_key, "anthropic": anthropic_key, "provider": provider}


RESEARCH_PROMPT = """Research the current 2026 MLB role AND ESPN fantasy baseball position eligibility for {name} ({team}).

Find recent news (March/April 2026) about:
1. Their primary playing position this season
2. Any platoon role (vs RHP vs LHP)
3. Teammate injuries or roster moves affecting their role
4. DH days expected
5. ESPN fantasy baseball granted position eligibility (e.g. "SP only", "C, 1B", "SS, 2B, 3B", "SP, RP")

ESPN eligibility rules: SP needs 5+ starts previous season, RP needs 8+ relief apps, batters need 20+ games at position in 2025 or 10+ in 2026.

Return ONLY a JSON object — no markdown, no explanation:
{{
  "position_vsR": "3B",
  "position_vsL": "3B",
  "platoon": false,
  "role_note": "1-2 sentence current role summary.",
  "is_dh_risk": false,
  "espn_positions": ["3B", "SS"],
  "source": "source name or URL"
}}

Use MLB position codes: C 1B 2B 3B SS LF CF RF OF DH SP RP.
espn_positions = the list ESPN fantasy currently grants for this player.
If you cannot confirm ESPN eligibility, set espn_positions to null.
Set platoon=true if they genuinely sit vs one handedness."""


def _call_openai_research(player_name: str, team: str, api_key: str) -> dict:
    """Research via OpenAI gpt-4o-search-preview (has built-in web search)."""
    prompt = RESEARCH_PROMPT.format(name=player_name, team=team)

    payload = json.dumps({
        "model":    OPENAI_MODEL,
        "messages": [{"role": "user", "content": prompt}],
    }).encode()

    req = urllib.request.Request(
        OPENAI_API_URL,
        data    = payload,
        headers = {
            "Content-Type":  "application/json",
            "Authorization": f"Bearer {api_key}",
        },
        method = "POST",
    )

    with urllib.request.urlopen(req, timeout=30) as resp:
        data = json.loads(resp.read())

    text = data["choices"][0]["message"]["content"].strip()
    if text.startswith("```"):
        text = text.split("\n", 1)[1].rsplit("```", 1)[0]
    return json.loads(text)


def _call_anthropic_research(player_name: str, team: str, api_key: str) -> dict:
    """Research via Claude API with web_search tool (fallback)."""
    prompt = RESEARCH_PROMPT.format(name=player_name, team=team)

    payload = json.dumps({
        "model":      ANTHROPIC_MODEL,
        "max_tokens": 500,
        "tools": [{"type": "web_search_20250305", "name": "web_search"}],
        "messages": [{"role": "user", "content": prompt}],
    }).encode()

    req = urllib.request.Request(
        ANTHROPIC_API_URL,
        data    = payload,
        headers = {
            "Content-Type":      "application/json",
            "x-api-key":         api_key,
            "anthropic-version": "2023-06-01",
            "anthropic-beta":    "web-search-2025-03-05",
        },
        method = "POST",
    )

    with urllib.request.urlopen(req, timeout=30) as resp:
        data = json.loads(resp.read())

    text = ""
    for block in data.get("content", []):
        if block.get("type") == "text":
            text = block["text"]
    text = text.strip()
    if text.startswith("```"):
        text = text.split("\n", 1)[1].rsplit("```", 1)[0]
    return json.loads(text)


def _call_research(player_name: str, team: str, keys: dict) -> dict:
    """
    Call research API with provider priority:
    1. OpenAI (default, user has credits)
    2. Claude fallback if OpenAI unavailable
    """
    openai_key    = keys.get("openai", "")
    anthropic_key = keys.get("anthropic", "")
    provider      = keys.get("provider", "openai")

    # Try preferred provider first
    if provider != "anthropic" and openai_key:
        return _call_openai_research(player_name, team, openai_key)
    if anthropic_key:
        return _call_anthropic_research(player_name, team, anthropic_key)
    # Fallback to whichever is available
    if openai_key:
        return _call_openai_research(player_name, team, openai_key)
    raise ValueError("No API key available (OpenAI or Anthropic)")


def _upsert_research(db: Session, mlb_id: int, name: str, team: str,
                     result: dict) -> PlayerResearch:
    from ..models import FantasyRosterEntry, Player
    from sqlalchemy.orm.attributes import flag_modified

    existing = db.query(PlayerResearch).filter(
        PlayerResearch.mlb_id == mlb_id
    ).first()

    now = datetime.now(timezone.utc)
    fields = {
        "mlb_id":       mlb_id,
        "name":         name,
        "team":         team,
        "position_vsR": result.get("position_vsR"),
        "position_vsL": result.get("position_vsL"),
        "platoon":      bool(result.get("platoon", False)),
        "role_note":    result.get("role_note"),
        "is_dh_risk":   bool(result.get("is_dh_risk", False)),
        "source":       result.get("source"),
        "researched_at": now,
    }

    if existing:
        for k, v in fields.items():
            setattr(existing, k, v)
    else:
        existing = PlayerResearch(**fields)
        db.add(existing)

    # Auto-propagate ESPN positions to FantasyRosterEntry if research returned them
    espn_pos = result.get("espn_positions")
    if espn_pos and isinstance(espn_pos, list) and len(espn_pos) > 0:
        player = db.query(Player).filter(Player.mlb_id == mlb_id).first()
        if player:
            entry = (
                db.query(FantasyRosterEntry)
                .filter(FantasyRosterEntry.player_id == player.id)
                .first()
            )
            if entry:
                entry.espn_positions = espn_pos
                flag_modified(entry, "espn_positions")
                logger.info("Auto-set ESPN positions for %s: %s", name, espn_pos)

    db.commit()
    db.refresh(existing)
    return existing


def _to_dict(r: PlayerResearch) -> dict:
    return {
        "mlb_id":       r.mlb_id,
        "name":         r.name,
        "team":         r.team,
        "position_vsR": r.position_vsR,
        "position_vsL": r.position_vsL,
        "platoon":      r.platoon,
        "role_note":    r.role_note,
        "is_dh_risk":   r.is_dh_risk,
        "source":       r.source,
        "researched_at": r.researched_at.isoformat() if r.researched_at else None,
        "stale": (
            (datetime.now(timezone.utc) - r.researched_at.replace(tzinfo=timezone.utc))
            > timedelta(hours=STALE_HOURS)
        ) if r.researched_at else True,
    }


@router.get("/{mlb_id}")
def get_research(mlb_id: int, db: Session = Depends(get_db)):
    """Return stored research for a player. stale=true means it needs refresh."""
    r = db.query(PlayerResearch).filter(PlayerResearch.mlb_id == mlb_id).first()
    if not r:
        return {"mlb_id": mlb_id, "stale": True, "role_note": None}
    return _to_dict(r)


@router.post("/{mlb_id}")
def research_player(mlb_id: int, db: Session = Depends(get_db)):
    """Trigger a fresh Claude web-search research for a player."""
    player = db.query(Player).filter(Player.mlb_id == mlb_id).first()
    if not player:
        raise HTTPException(404, f"Player mlb_id={mlb_id} not found in DB")

    keys = _get_keys(db)
    if not keys.get("openai") and not keys.get("anthropic"):
        raise HTTPException(503, "No API key configured (OpenAI or Anthropic)")

    try:
        result = _call_research(player.name, player.team or "", keys)
        record = _upsert_research(db, mlb_id, player.name, player.team or "", result)
        logger.info("Research updated: %s → vsR=%s vsL=%s platoon=%s",
                    player.name, result.get("position_vsR"), result.get("position_vsL"),
                    result.get("platoon"))
        return _to_dict(record)
    except Exception as e:
        logger.error("Research failed for %s: %s", player.name, e)
        raise HTTPException(500, f"Research failed: {e}")


@router.post("/batch/roster")
def research_roster(db: Session = Depends(get_db)):
    """
    Research all currently rostered players. Called by the daily scheduler.
    Skips players researched within the last STALE_HOURS.
    """
    keys = _get_keys(db)
    if not keys.get("openai") and not keys.get("anthropic"):
        return {"error": "No API key configured (OpenAI or Anthropic)", "updated": 0}

    entries = (
        db.query(FantasyRosterEntry)
        .join(FantasyRosterEntry.player)
        .filter(FantasyRosterEntry.status.in_(["roster", "watch"]))
        .all()
    )

    cutoff = datetime.now(timezone.utc) - timedelta(hours=STALE_HOURS)
    updated, skipped, failed = 0, 0, 0

    for entry in entries:
        p = entry.player
        if not p or not p.mlb_id:
            continue

        # Skip if recently researched
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
        except Exception as e:
            logger.warning("Batch research failed for %s: %s", p.name, e)
            failed += 1

    return {"updated": updated, "skipped": skipped, "failed": failed}


@router.get("/roster-map")
def get_roster_map(db: Session = Depends(get_db)):
    """
    Returns all research records for currently rostered players as a dict
    keyed by mlb_id. Used by the frontend to populate researchMap on load.
    """
    entries = (
        db.query(FantasyRosterEntry)
        .join(FantasyRosterEntry.player)
        .filter(FantasyRosterEntry.status.in_(["roster", "watch"]))
        .all()
    )
    result = {}
    for entry in entries:
        p = entry.player
        if not p or not p.mlb_id:
            continue
        r = db.query(PlayerResearch).filter(
            PlayerResearch.mlb_id == p.mlb_id
        ).first()
        if r:
            result[p.mlb_id] = _to_dict(r)
    return result
