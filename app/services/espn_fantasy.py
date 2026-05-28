"""Unofficial ESPN Fantasy integration helpers.

This intentionally uses ESPN's web/app JSON endpoints with the user's own
SWID + espn_s2 session cookies. ESPN does not provide a normal public OAuth
Fantasy API for this workflow, so keep this integration single-user/self-hosted.
"""

from __future__ import annotations

import difflib
import re
import unicodedata
from dataclasses import dataclass
from typing import Any, Dict, Iterable, List, Optional, Tuple

import httpx
from sqlalchemy.orm import Session

from ..models import FantasyRosterEntry, Player, RosterStatus, EventLog, DailyPlayerStatus, PlayerStatus

SPORT_TO_GAME = {
    "baseball": "flb",
    "football": "ffl",
    "basketball": "fba",
    "hockey": "fhl",
}

# ESPN fantasy baseball slot IDs seen in the v3 API. The API can add/change
# IDs, so unknowns are safely ignored or displayed as Slot {id}.
LINEUP_SLOT_LABELS = {
    0: "C",
    1: "1B",
    2: "2B",
    3: "3B",
    4: "SS",
    5: "OF",
    6: "2B/SS",
    7: "1B/3B",
    8: "LF",
    9: "CF",
    10: "RF",
    11: "DH",
    12: "UTIL",
    13: "P",
    14: "SP",
    15: "RP",
    16: "BE",
    17: "IL",
    18: "IF",
    19: "MI",
    20: "CI",
    # Do not treat these as IL. ESPN slot IDs vary by league, and Build 57
    # incorrectly moved active players to IL by mapping 21/23 to IL.
    21: "BE",
    22: "BE",
    23: "BE",
}

FANTAG_POSITION_MAP = {
    "C": "C",
    "1B": "1B",
    "2B": "2B",
    "3B": "3B",
    "SS": "SS",
    "OF": "OF",
    "LF": "OF",
    "CF": "OF",
    "RF": "OF",
    "DH": "DH",
    "UTIL": "UTIL",
    "P": "P",
    "SP": "SP",
    "RP": "RP",
    "IF": "IF",
    "MI": "IF",
    "CI": "IF",
    "2B/SS": "IF",
    "1B/3B": "IF",
}

ACTIVE_SLOT_LABELS = {"C", "1B", "2B", "3B", "SS", "OF", "LF", "CF", "RF", "DH", "UTIL", "P", "SP", "RP", "IF", "MI", "CI", "2B/SS", "1B/3B"}
IL_SLOT_LABELS = {"IL", "IL10", "IL15", "IL60", "IR", "INJURED"}
BENCH_SLOT_LABELS = {"BE", "BN", "BENCH"}

# Saved/displayed ESPN eligibility should be ESPN's real baseball positions only.
# These are player eligibility positions, not lineup/flex slots. UTIL, IF, CI, MI,
# P, BE, BN, and IL are fantasy roster slots and should never display as a
# player's eligible MLB position badge.
REAL_ELIGIBILITY_POSITIONS = {"C", "1B", "2B", "3B", "SS", "OF", "DH", "SP", "RP"}
FANTASY_ONLY_ELIGIBILITY = {"UTIL", "IF", "CI", "MI", "2B/SS", "1B/3B", "P", "BE", "BN", "BENCH", "IL", "IL10", "IL15", "IL60", "IR", "INJURED"}
# ESPN's baseball IL slot id has varied by league/API response. We only treat
# these ids as IL when the player also carries an IL-like ESPN injury status.
POSSIBLE_IL_SLOT_IDS = {17}


def _fantag_slot(label: Optional[str]) -> Optional[str]:
    """Normalize ESPN lineup slot labels into FANTAG slot labels."""
    if not label:
        return None
    if label in IL_SLOT_LABELS:
        return "IL"
    if label in BENCH_SLOT_LABELS:
        return None
    mapped = FANTAG_POSITION_MAP.get(label, label)
    return mapped if mapped in ACTIVE_SLOT_LABELS else None


def _extract_injury_status(player_blob: Dict[str, Any]) -> str:
    """Return the most useful ESPN injury/status string available for audit/sync."""
    candidates = [
        player_blob.get("injuryStatus"),
        player_blob.get("injuryStatusDescription"),
        player_blob.get("status"),
        player_blob.get("availabilityStatus"),
        player_blob.get("availabilityStatusDisplay"),
    ]
    # Some ESPN payloads nest injury data under player.injury or player.injuries.
    injury = player_blob.get("injury")
    if isinstance(injury, dict):
        candidates.extend([injury.get("status"), injury.get("type"), injury.get("detail")])
    injuries = player_blob.get("injuries")
    if isinstance(injuries, list):
        for item in injuries:
            if isinstance(item, dict):
                candidates.extend([item.get("status"), item.get("type"), item.get("detail")])
    return " ".join(str(x) for x in candidates if x)


def _looks_il_status(injury_status: str) -> bool:
    value = (injury_status or "").upper()
    # ESPN commonly exposes baseball IL as IL10/IL15/IL60, but depending on the
    # payload it can appear as INJURY_RESERVE/INJURED_LIST/DL. Keep this narrow
    # enough that DTD/OUT do not become fantasy IL by themselves.
    return any(token in value for token in ("IL10", "IL15", "IL60", "INJURED_LIST", "INJURY_RESERVE", "DISABLED_LIST", " DL ")) or value in {"IL", "IR", "DL"}


def _looks_dtd_status(injury_status: str) -> bool:
    """Return True when ESPN says the player is day-to-day/questionable but not on IL."""
    value = re.sub(r"[^A-Z0-9]+", " ", (injury_status or "").upper()).strip()
    if not value or _looks_il_status(value):
        return False
    tokens = set(value.split())
    if {"DAY", "TO", "DAY"}.issubset(tokens):
        return True
    return any(token in value for token in (
        "DTD", "D T D", "DAY TO DAY", "DAYTODAY", "QUESTIONABLE",
        "GTD", "GAME TIME DECISION", "GAME-TIME DECISION",
        "PROBABLE", "DOUBTFUL"
    ))


def _is_espn_il_player(slot_id: Optional[int], label: Optional[str], injury_status: str) -> bool:
    """Identify ESPN fantasy IL using lineup slot plus ESPN injury status.

    The previous builds used only hard-coded slot IDs. That failed in two ways:
    active players were sometimes mapped to IL, and real IL players were missed
    in leagues where ESPN used a different IL slot id. This function allows the
    common IL slot ids, but only when ESPN also says the player has an IL-like
    injury status. Explicit IL labels are still accepted.
    """
    upper_label = str(label or "").upper()
    if upper_label in IL_SLOT_LABELS:
        return True
    return bool(slot_id in POSSIBLE_IL_SLOT_IDS and _looks_il_status(injury_status))


def _today_cdt() -> str:
    from datetime import datetime
    from zoneinfo import ZoneInfo
    return datetime.now(ZoneInfo("America/Chicago")).date().isoformat()


def normalize_name(name: str) -> str:
    value = unicodedata.normalize("NFKD", name or "")
    value = "".join(ch for ch in value if not unicodedata.combining(ch))
    value = value.lower()
    value = re.sub(r"\b(jr|sr|ii|iii|iv|v)\b", "", value)
    value = re.sub(r"[^a-z0-9]+", " ", value)
    return re.sub(r"\s+", " ", value).strip()


def _slot_label(slot_id: Any) -> Optional[str]:
    try:
        return LINEUP_SLOT_LABELS.get(int(slot_id), f"Slot {slot_id}")
    except Exception:
        return None


def _extract_positions(player_blob: Dict[str, Any]) -> List[str]:
    """Return saved ESPN eligibility badges, excluding fantasy-only flex slots."""
    raw_slots = player_blob.get("eligibleSlots") or []
    positions: List[str] = []
    for slot_id in raw_slots:
        label = _slot_label(slot_id)
        if not label or label in FANTASY_ONLY_ELIGIBILITY:
            continue
        mapped = FANTAG_POSITION_MAP.get(label or "")
        if mapped in REAL_ELIGIBILITY_POSITIONS and mapped not in positions:
            positions.append(mapped)
    priority = {"C": 1, "1B": 2, "2B": 3, "3B": 4, "SS": 5, "OF": 6, "DH": 7, "SP": 8, "RP": 9}
    positions.sort(key=lambda p: priority.get(p, 99))
    return positions


def _player_blob_from_entry(entry: Dict[str, Any]) -> Dict[str, Any]:
    return (((entry.get("playerPoolEntry") or {}).get("player")) or {})


def _espn_name(player_blob: Dict[str, Any]) -> str:
    return player_blob.get("fullName") or player_blob.get("displayName") or player_blob.get("name") or ""


def _espn_team(player_blob: Dict[str, Any]) -> Optional[str]:
    return player_blob.get("proTeamAbbreviation") or player_blob.get("proTeam") or None


@dataclass
class EspnRosterPlayer:
    name: str
    team: Optional[str]
    espn_id: Optional[int]
    lineup_slot_id: Optional[int]
    lineup_slot: Optional[str]
    eligible_positions: List[str]
    injury_status: str = ""
    raw_eligible_slots: List[int] | None = None


class EspnFantasyClient:
    def __init__(self, *, sport: str, season: int, league_id: int, swid: str, espn_s2: str):
        game = SPORT_TO_GAME.get(sport, sport)
        if game not in SPORT_TO_GAME.values():
            raise ValueError("Unsupported ESPN sport. Use baseball, football, basketball, hockey, or flb/ffl/fba/fhl.")
        self.game = game
        self.season = int(season)
        self.league_id = int(league_id)
        self.cookies = {"SWID": swid, "espn_s2": espn_s2}

    @property
    def league_url(self) -> str:
        return f"https://lm-api-reads.fantasy.espn.com/apis/v3/games/{self.game}/seasons/{self.season}/segments/0/leagues/{self.league_id}"

    def fetch_league_views(self, views: Iterable[str]) -> Dict[str, Any]:
        params: List[Tuple[str, str]] = [("view", view) for view in views]
        headers = {"User-Agent": "FANTAG self-hosted ESPN sync"}
        with httpx.Client(timeout=25.0, follow_redirects=True, headers=headers) as client:
            response = client.get(self.league_url, params=params, cookies=self.cookies)
        if response.status_code in (401, 403):
            raise PermissionError("ESPN rejected the request. Refresh SWID and espn_s2 from the browser while logged in to ESPN.")
        response.raise_for_status()
        return response.json()

    def fetch_league(self) -> Dict[str, Any]:
        return self.fetch_league_views(["mTeam", "mRoster", "mSettings"])

    def fetch_watchlist(self) -> Dict[str, Any]:
        # ESPN's unofficial Watch List view is commonly exposed as player_wl.
        # mTeam/mSettings are included for selected-team identity/context.
        return self.fetch_league_views(["mTeam", "mSettings", "player_wl", "kona_player_info"])


def extract_team_roster(league_json: Dict[str, Any], team_id: Optional[int] = None) -> Tuple[Dict[str, Any], List[EspnRosterPlayer]]:
    teams = league_json.get("teams") or []
    if not teams:
        raise ValueError("No ESPN teams found in the league response.")

    team = None
    if team_id is not None:
        for candidate in teams:
            if int(candidate.get("id", -1)) == int(team_id):
                team = candidate
                break
        if team is None:
            raise ValueError(f"No ESPN team with teamId={team_id} was found in this league.")
    else:
        team = teams[0]

    roster_entries = (((team.get("roster") or {}).get("entries")) or [])
    players: List[EspnRosterPlayer] = []
    for entry in roster_entries:
        blob = _player_blob_from_entry(entry)
        name = _espn_name(blob)
        if not name:
            continue
        slot_id = entry.get("lineupSlotId")
        try:
            slot_id_int = int(slot_id) if slot_id is not None else None
        except Exception:
            slot_id_int = None
        players.append(EspnRosterPlayer(
            name=name,
            team=_espn_team(blob),
            espn_id=blob.get("id"),
            lineup_slot_id=slot_id_int,
            lineup_slot=_slot_label(slot_id_int) if slot_id_int is not None else None,
            eligible_positions=_extract_positions(blob),
            injury_status=_extract_injury_status(blob),
            raw_eligible_slots=list(blob.get("eligibleSlots") or []),
        ))
    return team, players


def _all_player_index(db: Session) -> Tuple[Dict[str, Player], List[Tuple[str, Player]]]:
    players = db.query(Player).filter(Player.active == True).all()  # noqa: E712
    exact = {normalize_name(p.name): p for p in players if p.name}
    pairs = [(normalize_name(p.name), p) for p in players if p.name]
    return exact, pairs


def match_player(db: Session, espn_player: EspnRosterPlayer) -> Tuple[Optional[Player], str, float]:
    exact, pairs = _all_player_index(db)
    needle = normalize_name(espn_player.name)
    if needle in exact:
        return exact[needle], "exact", 1.0

    candidates = pairs
    if espn_player.team:
        team = str(espn_player.team).upper()
        team_candidates = [(n, p) for n, p in pairs if (p.team or "").upper() == team]
        if team_candidates:
            candidates = team_candidates

    names = [n for n, _ in candidates]
    close = difflib.get_close_matches(needle, names, n=1, cutoff=0.86)
    if close:
        matched_norm = close[0]
        for n, p in candidates:
            if n == matched_norm:
                ratio = difflib.SequenceMatcher(None, needle, matched_norm).ratio()
                return p, "fuzzy", round(ratio, 3)
    return None, "unmatched", 0.0



def _iter_dicts(obj: Any):
    """Yield every dict in a nested ESPN payload."""
    if isinstance(obj, dict):
        yield obj
        for value in obj.values():
            yield from _iter_dicts(value)
    elif isinstance(obj, list):
        for item in obj:
            yield from _iter_dicts(item)


def _espn_player_from_any(obj: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    """Return a normalized ESPN player blob from common v3 payload shapes."""
    if not isinstance(obj, dict):
        return None
    if isinstance(obj.get("playerPoolEntry"), dict):
        p = ((obj.get("playerPoolEntry") or {}).get("player") or {})
        return p if isinstance(p, dict) and _espn_name(p) else None
    if isinstance(obj.get("player"), dict) and _espn_name(obj.get("player") or {}):
        return obj.get("player")
    if _espn_name(obj) and ("eligibleSlots" in obj or "fullName" in obj or "displayName" in obj):
        return obj
    return None


def _dedupe_espn_players(players: Iterable[EspnRosterPlayer]) -> List[EspnRosterPlayer]:
    out: List[EspnRosterPlayer] = []
    seen = set()
    for player in players:
        key = player.espn_id or normalize_name(player.name)
        if key in seen:
            continue
        seen.add(key)
        out.append(player)
    return out


def extract_watchlist(league_json: Dict[str, Any], team_id: Optional[int] = None) -> Tuple[Optional[Dict[str, Any]], List[EspnRosterPlayer]]:
    """Best-effort extraction of ESPN Watch List players.

    ESPN does not document this API. Current community tooling points at the
    player_wl view, but payload shape varies. This extractor intentionally reads
    from watchlist/player_wl-ish areas and the root players list returned by
    that view.
    """
    teams = league_json.get("teams") or []
    team = None
    if teams:
        if team_id is not None:
            for candidate in teams:
                try:
                    if int(candidate.get("id", -1)) == int(team_id):
                        team = candidate
                        break
                except Exception:
                    pass
        team = team or teams[0]

    candidate_roots: List[Any] = []
    for key in ("player_wl", "playerWl", "watchList", "watchlist", "watchListPlayers", "playerWatchList", "watchPlayers"):
        if key in league_json:
            candidate_roots.append(league_json.get(key))
    if team:
        for key in ("watchList", "watchlist", "watchListPlayers", "playerWatchList", "watchPlayers"):
            if key in team:
                candidate_roots.append(team.get(key))
    if "players" in league_json:
        candidate_roots.append(league_json.get("players"))

    players: List[EspnRosterPlayer] = []
    for root in candidate_roots:
        for obj in _iter_dicts(root):
            blob = _espn_player_from_any(obj)
            if not blob:
                continue
            slot_id = obj.get("lineupSlotId") if isinstance(obj, dict) else None
            try:
                slot_id_int = int(slot_id) if slot_id is not None else None
            except Exception:
                slot_id_int = None
            players.append(EspnRosterPlayer(
                name=_espn_name(blob),
                team=_espn_team(blob),
                espn_id=blob.get("id"),
                lineup_slot_id=slot_id_int,
                lineup_slot=_slot_label(slot_id_int) if slot_id_int is not None else None,
                eligible_positions=_extract_positions(blob),
                injury_status=_extract_injury_status(blob),
                raw_eligible_slots=list(blob.get("eligibleSlots") or []),
            ))

    return team, _dedupe_espn_players(players)


def sync_espn_watchlist(db: Session, espn_players: Iterable[EspnRosterPlayer], *, reconcile: bool = True) -> Dict[str, Any]:
    """Mirror ESPN Watch List into FANTAG Watch List.

    This never touches active roster/IL players and never drops anyone from ESPN.
    If reconcile=True, FANTAG watch-only entries not present on ESPN's watchlist
    are removed locally. My Roster and IL entries are preserved.
    """
    espn_players = list(espn_players)
    added, updated, skipped, unmatched, removed = [], [], [], [], []
    seen_player_ids = set()

    for espn_player in espn_players:
        player, match_type, confidence = match_player(db, espn_player)
        if not player:
            unmatched.append({
                "espn_name": espn_player.name,
                "team": espn_player.team,
                "eligible_positions": espn_player.eligible_positions,
            })
            continue

        seen_player_ids.add(player.id)
        existing_entries = db.query(FantasyRosterEntry).filter(FantasyRosterEntry.player_id == player.id).all()
        roster_entry = next((e for e in existing_entries if e.status in (RosterStatus.roster, RosterStatus.il)), None)
        watch_entry = next((e for e in existing_entries if e.status == RosterStatus.watch), None)

        if roster_entry:
            skipped.append({"name": player.name, "reason": "already on roster/IL", "match": match_type})
            if watch_entry:
                db.delete(watch_entry)
            continue

        espn_positions = list(espn_player.eligible_positions or [])
        if watch_entry:
            changed = False
            if (watch_entry.espn_positions or []) != espn_positions:
                from sqlalchemy.orm.attributes import flag_modified
                watch_entry.espn_positions = espn_positions
                flag_modified(watch_entry, "espn_positions")
                changed = True
            if watch_entry.fantasy_pos:
                watch_entry.fantasy_pos = None
                changed = True
            if changed:
                updated.append({"name": player.name, "match": match_type, "confidence": confidence})
            else:
                skipped.append({"name": player.name, "reason": "already current", "match": match_type})
        else:
            entry = FantasyRosterEntry(
                player_id=player.id,
                status=RosterStatus.watch,
                fantasy_pos=None,
                espn_positions=espn_positions,
                notes=f"Imported from ESPN Watch List ({espn_player.name})",
            )
            db.add(entry)
            added.append({"name": player.name, "match": match_type, "confidence": confidence})

        db.add(EventLog(event_type="espn_watchlist_sync_player", player_id=player.id, payload={
            "espn_name": espn_player.name,
            "espn_id": espn_player.espn_id,
            "eligible_positions": espn_player.eligible_positions,
            "raw_eligible_slots": espn_player.raw_eligible_slots,
            "match_type": match_type,
            "confidence": confidence,
        }))

    if reconcile:
        existing_watch = db.query(FantasyRosterEntry).filter(FantasyRosterEntry.status == RosterStatus.watch).all()
        for entry in existing_watch:
            if entry.player_id not in seen_player_ids:
                name = entry.player.name if entry.player else str(entry.player_id)
                removed.append({"name": name, "entry_id": entry.id, "reason": "not present on ESPN watchlist"})
                db.add(EventLog(event_type="espn_watchlist_removed_stale_entry", player_id=entry.player_id, payload={
                    "name": name,
                    "entry_id": entry.id,
                    "reason": "not present on ESPN watchlist",
                }))
                db.delete(entry)

    db.commit()
    return {
        "added": added,
        "updated": updated,
        "skipped": skipped,
        "unmatched": unmatched,
        "removed": removed,
        "summary": {
            "added": len(added),
            "updated": len(updated),
            "skipped": len(skipped),
            "unmatched": len(unmatched),
            "removed": len(removed),
        },
    }


def diff_fantag_vs_espn_watchlist(db: Session, espn_players: Iterable[EspnRosterPlayer]) -> Dict[str, Any]:
    espn_players = list(espn_players)
    espn_matched = []
    espn_ids = set()
    for espn_player in espn_players:
        player, match_type, confidence = match_player(db, espn_player)
        row = {
            "espn_name": espn_player.name,
            "espn_id": espn_player.espn_id,
            "matched_player_id": player.id if player else None,
            "matched_name": player.name if player else None,
            "match_type": match_type,
            "confidence": confidence,
        }
        espn_matched.append(row)
        if player:
            espn_ids.add(player.id)

    fantag_watch = db.query(FantasyRosterEntry).filter(FantasyRosterEntry.status == RosterStatus.watch).all()
    fantag_ids = {e.player_id for e in fantag_watch}
    return {
        "espn_count": len(espn_players),
        "fantag_count": len(fantag_watch),
        "espn_only": [r for r in espn_matched if r["matched_player_id"] and r["matched_player_id"] not in fantag_ids],
        "fantag_only": [
            {"player_id": e.player_id, "entry_id": e.id, "name": e.player.name if e.player else str(e.player_id)}
            for e in fantag_watch if e.player_id not in espn_ids
        ],
        "matched": [r for r in espn_matched if r["matched_player_id"] in fantag_ids],
        "unmatched_espn": [r for r in espn_matched if not r["matched_player_id"]],
        "write_back_supported": False,
        "write_back_note": "FANTAG can read and mirror ESPN Watch List. ESPN watchlist write-back is not enabled until the exact browser Network request is captured and verified for this league.",
    }

def sync_espn_roster(db: Session, espn_players: Iterable[EspnRosterPlayer], *, reconcile: bool = True) -> Dict[str, Any]:
    # ESPN is the roster source of truth for My Roster + IL.
    espn_players = list(espn_players)
    added = []
    updated = []
    skipped = []
    unmatched = []
    seen_player_ids = set()

    for espn_player in espn_players:
        player, match_type, confidence = match_player(db, espn_player)
        if not player:
            unmatched.append({
                "espn_name": espn_player.name,
                "team": espn_player.team,
                "slot": espn_player.lineup_slot,
                "eligible_positions": espn_player.eligible_positions,
            })
            continue

        seen_player_ids.add(player.id)
        entry = db.query(FantasyRosterEntry).filter(FantasyRosterEntry.player_id == player.id).first()
        espn_is_il = _is_espn_il_player(espn_player.lineup_slot_id, espn_player.lineup_slot, espn_player.injury_status)
        espn_is_dtd = (not espn_is_il) and _looks_dtd_status(espn_player.injury_status)
        fantasy_pos = "IL" if espn_is_il else _fantag_slot(espn_player.lineup_slot)
        # Always overwrite ESPN eligibility from the latest ESPN eligibleSlots.
        # This clears stale UTIL/IF/P badges saved by older builds.
        espn_positions = list(espn_player.eligible_positions or [])
        espn_roster_status = RosterStatus.il if espn_is_il else RosterStatus.roster

        if entry:
            changed = False
            # ESPN is the source of truth for your fantasy IL slot. If a player was
            # incorrectly stamped IL by MLB transaction polling but ESPN has him active/bench,
            # move him back to the normal FANTAG roster on the next sync.
            if entry.status != espn_roster_status:
                entry.status = espn_roster_status
                changed = True
            if entry.fantasy_pos != fantasy_pos:
                entry.fantasy_pos = fantasy_pos
                changed = True
            if (entry.espn_positions or []) != espn_positions:
                from sqlalchemy.orm.attributes import flag_modified
                entry.espn_positions = espn_positions
                flag_modified(entry, "espn_positions")
                changed = True
            if changed:
                updated.append({"name": player.name, "slot": fantasy_pos, "match": match_type, "confidence": confidence})
            else:
                skipped.append({"name": player.name, "reason": "already current", "match": match_type})
        else:
            entry = FantasyRosterEntry(
                player_id=player.id,
                status=espn_roster_status,
                fantasy_pos=fantasy_pos,
                espn_positions=espn_positions,
                notes=f"Imported from ESPN Fantasy ({espn_player.name})",
            )
            db.add(entry)
            added.append({"name": player.name, "slot": fantasy_pos, "match": match_type, "confidence": confidence})

        # Remove duplicate FANTAG roster/IL rows for this ESPN player.
        if entry and entry.id:
            dupes = (
                db.query(FantasyRosterEntry)
                .filter(
                    FantasyRosterEntry.player_id == player.id,
                    FantasyRosterEntry.id != entry.id,
                    FantasyRosterEntry.status.in_([RosterStatus.roster, RosterStatus.il]),
                )
                .all()
            )
            for dupe in dupes:
                db.add(EventLog(event_type="espn_sync_duplicate_removed", player_id=player.id, payload={
                    "name": player.name,
                    "removed_entry_id": dupe.id,
                    "reason": "duplicate roster/IL entry for ESPN-synced player",
                }))
                db.delete(dupe)

        # ESPN is the source of truth for your fantasy IL section. Sync today.s
        # daily status too so the UI changes immediately after ESPN sync.
        daily = (
            db.query(DailyPlayerStatus)
            .filter(DailyPlayerStatus.player_id == player.id, DailyPlayerStatus.date == _today_cdt())
            .first()
        )
        if espn_roster_status == RosterStatus.il:
            if daily:
                daily.status = PlayerStatus.il
                daily.in_lineup = False
            else:
                db.add(DailyPlayerStatus(player_id=player.id, date=_today_cdt(), status=PlayerStatus.il, in_lineup=False))
        elif espn_is_dtd:
            if daily:
                # Preserve lineup/game fields from the lineup poll, but mark the health warning.
                daily.status = PlayerStatus.dtd
            else:
                db.add(DailyPlayerStatus(player_id=player.id, date=_today_cdt(), status=PlayerStatus.dtd, in_lineup=False))
        else:
            if daily and daily.status in (PlayerStatus.il, PlayerStatus.dtd):
                daily.status = PlayerStatus.unknown
                daily.in_lineup = False

        db.add(EventLog(event_type="espn_sync_player", player_id=player.id, payload={
            "espn_name": espn_player.name,
            "espn_id": espn_player.espn_id,
            "slot": espn_player.lineup_slot,
            "eligible_positions": espn_player.eligible_positions,
            "raw_eligible_slots": espn_player.raw_eligible_slots,
            "injury_status": espn_player.injury_status,
            "is_espn_il": espn_roster_status == RosterStatus.il,
            "is_espn_dtd": espn_is_dtd,
            "match_type": match_type,
            "confidence": confidence,
        }))

    removed = []
    if reconcile:
        # Mirror ESPN exactly for My Roster + IL. If ESPN does not return the
        # player for the selected team, remove stale FANTAG roster/IL rows.
        # Watch List entries are preserved.
        existing_roster = (
            db.query(FantasyRosterEntry)
            .filter(FantasyRosterEntry.status.in_([RosterStatus.roster, RosterStatus.il]))
            .all()
        )
        today = _today_cdt()
        for entry in existing_roster:
            if entry.player_id not in seen_player_ids:
                removed_name = entry.player.name if entry.player else str(entry.player_id)
                removed.append({
                    "name": removed_name,
                    "entry_id": entry.id,
                    "status": entry.status.value if hasattr(entry.status, "value") else str(entry.status),
                    "reason": "not present on ESPN roster",
                })
                daily = (
                    db.query(DailyPlayerStatus)
                    .filter(DailyPlayerStatus.player_id == entry.player_id, DailyPlayerStatus.date == today)
                    .first()
                )
                if daily and daily.status == PlayerStatus.il:
                    daily.status = PlayerStatus.unknown
                    daily.in_lineup = False
                db.add(EventLog(event_type="espn_sync_removed_stale_entry", player_id=entry.player_id, payload={
                    "name": removed_name,
                    "entry_id": entry.id,
                    "reason": "not present on ESPN roster",
                }))
                db.delete(entry)

    db.commit()
    return {
        "added": added,
        "updated": updated,
        "skipped": skipped,
        "unmatched": unmatched,
        "removed": removed,
        "summary": {
            "added": len(added),
            "updated": len(updated),
            "skipped": len(skipped),
            "unmatched": len(unmatched),
            "removed": len(removed),
        },
    }
