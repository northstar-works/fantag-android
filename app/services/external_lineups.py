"""External daily lineup sources for FANTAG.

RotoWire can post a confirmed lineup before MLB Stats API hydrates the
`schedule?hydrate=lineups` response. This module treats a configured external
source as a lineup-confirmation overlay, not as a replacement for boxscore/live
stats.
"""
from __future__ import annotations

import html
import logging
import re
import unicodedata
from dataclasses import dataclass
from datetime import date
from typing import Any, Iterable

import httpx

logger = logging.getLogger(__name__)

SOURCE_URLS = {
    "rotowire": "https://www.rotowire.com/baseball/daily-lineups.php",
    "mlbcom": "https://www.mlb.com/starting-lineups",
}
POSITIONS = {"C", "1B", "2B", "3B", "SS", "LF", "CF", "RF", "OF", "DH"}
PITCHER_POSITIONS = {"SP", "P"}


def _text_lines(raw: str) -> list[str]:
    raw = re.sub(r"<script[\s\S]*?</script>", "\n", raw, flags=re.I)
    raw = re.sub(r"<style[\s\S]*?</style>", "\n", raw, flags=re.I)
    raw = re.sub(r"<br\s*/?>", "\n", raw, flags=re.I)
    raw = re.sub(r"</(div|p|li|ul|ol|tr|td|th|span|a|h\d)>", "\n", raw, flags=re.I)
    raw = re.sub(r"<[^>]+>", " ", raw)
    raw = html.unescape(raw)
    out: list[str] = []
    for line in raw.splitlines():
        line = re.sub(r"\s+", " ", line).strip()
        if line:
            out.append(line)
    return out


def _strip_html(raw: str) -> str:
    return " ".join(_text_lines(raw))


def _norm(value: str) -> str:
    value = unicodedata.normalize("NFKD", value or "")
    value = "".join(ch for ch in value if not unicodedata.combining(ch))
    value = value.lower()
    value = re.sub(r"\b(jr|sr|ii|iii|iv|v)\b", "", value)
    value = re.sub(r"[^a-z0-9]+", " ", value)
    return re.sub(r"\s+", " ", value).strip()


def _variants(full_name: str) -> list[str]:
    parts = [p for p in re.split(r"\s+", full_name.strip()) if p]
    if not parts:
        return []
    first = parts[0]
    last = parts[-1]
    variants = [full_name]
    if first:
        variants.extend([f"{first[0]}. {last}", f"{first[0]} {last}"])
    n = _norm(full_name)
    if n:
        variants.append(n)
    out: list[str] = []
    for v in variants:
        if v and v not in out:
            out.append(v)
    return out


def _find_in_text(player_name: str, text: str) -> tuple[bool, int | None, str | None, str | None]:
    """Return (found, batting_order, fielding_pos, source_text_name)."""
    for variant in _variants(player_name):
        esc = re.escape(variant)
        # MLB.com style: "1. B Buxton (R) CF"
        m = re.search(rf"(?P<order>[1-9])\.\s*(?P<name>{esc})\s*\([RLS]\)\s*(?P<pos>C|1B|2B|3B|SS|LF|CF|RF|OF|DH)\b", text, flags=re.I)
        if m:
            return True, int(m.group("order")), m.group("pos").upper(), m.group("name")
        # RotoWire style after HTML line stripping: "CF Steven Kwan L"
        m = re.search(rf"(?P<pos>C|1B|2B|3B|SS|LF|CF|RF|OF|DH)\s+(?P<name>{esc})\s+[RLS]\b", text, flags=re.I)
        if m:
            return True, None, m.group("pos").upper(), m.group("name")
    norm_text = _norm(text)
    for variant in _variants(player_name):
        nv = _norm(variant)
        if nv and re.search(rf"\b{re.escape(nv)}\b", norm_text):
            return True, None, None, variant
    return False, None, None, None


def _is_team_abbr(line: str, teams: set[str]) -> bool:
    return line.strip().upper() in teams


def _rotowire_game_pairs(lines: list[str], teams: set[str]) -> list[tuple[int, str, str]]:
    """Best-effort parse of RotoWire game headers.

    The public page renders away/home abbreviations near each game card, followed
    by two "Confirmed Lineup" markers in away/home order. We only need team-level
    confirmation here, not the full opponent model.
    """
    pairs: list[tuple[int, str, str]] = []
    for i, line in enumerate(lines):
        a = line.strip().upper()
        if a not in teams:
            continue
        # Find the next different team abbreviation very nearby.
        for j in range(i + 1, min(i + 10, len(lines))):
            b = lines[j].strip().upper()
            if b in teams and b != a:
                # Avoid duplicate cards caused by logos/links by only storing one
                # pair per start index range.
                if not pairs or i - pairs[-1][0] > 8:
                    pairs.append((i, a, b))
                break
    return pairs


def _rotowire_confirmed_teams(lines: list[str], teams: set[str]) -> set[str]:
    confirmed: set[str] = set()
    pairs = _rotowire_game_pairs(lines, teams)
    if not pairs:
        return confirmed
    for idx, (_, away, home) in enumerate(pairs):
        start = pairs[idx][0]
        end = pairs[idx + 1][0] if idx + 1 < len(pairs) else len(lines)
        block = lines[start:end]
        marks = [k for k, line in enumerate(block) if "confirmed lineup" in line.lower()]
        if len(marks) >= 1:
            confirmed.add(away)
        if len(marks) >= 2:
            confirmed.add(home)
    return confirmed


def _rotowire_lineup_windows(lines: list[str], teams: set[str]) -> dict[str, str]:
    """Return rough lineup-specific text windows keyed by team abbreviation."""
    windows: dict[str, str] = {}
    pairs = _rotowire_game_pairs(lines, teams)
    for idx, (_, away, home) in enumerate(pairs):
        start = pairs[idx][0]
        end = pairs[idx + 1][0] if idx + 1 < len(pairs) else len(lines)
        block = lines[start:end]
        marks = [k for k, line in enumerate(block) if "confirmed lineup" in line.lower()]
        if marks:
            a_start = max(0, marks[0] - 8)  # include probable/confirmed SP just before marker
            a_end = marks[1] if len(marks) > 1 else len(block)
            windows[away] = " ".join(block[a_start:a_end])
        if len(marks) > 1:
            h_start = max(0, marks[1] - 8)
            h_end = len(block)
            windows[home] = " ".join(block[h_start:h_end])
    return windows


@dataclass
class ExternalLineupResult:
    lineups: dict[int, dict[str, Any]]
    confirmed_team_abbrs: set[str]
    source_hits: list[dict[str, Any]]
    source_order: list[str]


async def fetch_external_lineup_overlay(
    players: Iterable[Any],
    game_context_by_abbr: dict[str, dict[str, Any]],
    game_date: date | None = None,
    primary_source: str = "rotowire",
    enabled: bool = True,
) -> ExternalLineupResult:
    """Fetch external lineup pages and match confirmed starters against Player rows.

    When primary_source is "rotowire", RotoWire team confirmation wins over MLB
    Stats API for the simple question: has this team's lineup been posted?
    """
    lineups: dict[int, dict[str, Any]] = {}
    confirmed: set[str] = set()
    hits: list[dict[str, Any]] = []
    order = [primary_source] + [s for s in ("rotowire", "mlbcom") if s != primary_source]
    if not enabled:
        return ExternalLineupResult(lineups=lineups, confirmed_team_abbrs=confirmed, source_hits=hits, source_order=order)

    teams = set(game_context_by_abbr.keys())
    fetched: list[tuple[str, str, list[str]]] = []
    async with httpx.AsyncClient(timeout=httpx.Timeout(18.0), follow_redirects=True, headers={"User-Agent":"FANTAG lineup watcher/1.0"}) as client:
        for source in order:
            url = SOURCE_URLS.get(source)
            if not url:
                continue
            try:
                r = await client.get(url)
                if r.status_code < 400:
                    lines = _text_lines(r.text)
                    fetched.append((source, _strip_html(r.text), lines))
            except Exception as exc:
                logger.warning("external lineup fetch failed for %s: %s", source, exc)

    if not fetched:
        return ExternalLineupResult(lineups=lineups, confirmed_team_abbrs=confirmed, source_hits=hits, source_order=order)

    # Team-level confirmation first. This is what moves non-starters from
    # Awaiting Lineup -> Confirmed Out immediately.
    for source, text, lines in fetched:
        if source == "rotowire":
            rw_confirmed = _rotowire_confirmed_teams(lines, teams)
            confirmed.update(rw_confirmed)
            for abbr in sorted(rw_confirmed):
                hits.append({"type":"team_confirmed", "team":abbr, "source":source})
        else:
            # MLB.com compact text often contains "Confirmed" near both team names.
            for abbr in teams:
                if re.search(rf"\b{re.escape(abbr)}\b[\s\S]{{0,600}}\bConfirmed\b", text, flags=re.I):
                    confirmed.add(abbr)
                    hits.append({"type":"team_confirmed", "team":abbr, "source":source})

    # Player-level starts. Use team-specific RotoWire windows when available to
    # avoid matching a player name from another game/card.
    team_windows: dict[str, list[tuple[str, str]]] = {}
    for source, text, lines in fetched:
        if source == "rotowire":
            for team, window in _rotowire_lineup_windows(lines, teams).items():
                team_windows.setdefault(team, []).append((source, window))
        else:
            for team in teams:
                team_windows.setdefault(team, []).append((source, text))

    for p in players:
        name = getattr(p, "name", None)
        mlb_id = getattr(p, "mlb_id", None)
        team = (getattr(p, "team", None) or "").upper()
        if not name or not mlb_id or not team or team not in game_context_by_abbr:
            continue
        for source, text in team_windows.get(team, []):
            found, order_no, pos, source_name = _find_in_text(name, text)
            if not found:
                continue
            ctx = dict(game_context_by_abbr.get(team, {}))
            lineup = {
                **ctx,
                "in_lineup": True,
                "lineup_confirmed": True,
                "batting_order": order_no,
                "fielding_pos": pos,
                "team_has_game": True,
                "lineup_source": source,
            }
            lineups[mlb_id] = lineup
            confirmed.add(team)
            hits.append({"type":"player_start", "name": name, "team": team, "mlb_id": mlb_id, "source": source, "matched_as": source_name, "batting_order": order_no, "fielding_pos": pos})
            break

    return ExternalLineupResult(lineups=lineups, confirmed_team_abbrs=confirmed, source_hits=hits, source_order=order)
