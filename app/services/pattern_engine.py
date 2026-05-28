"""
Pattern engine — analyses DailyPlayerStatus history to compute:
  - Pattern label (Everyday Starter, Platoon, etc.)
  - RHP/LHP splits
  - Batting order distribution
  - Cadence (avg rest days between starts)
  - L7 / L14 / L30 start counts
"""

from __future__ import annotations

import logging
from collections import Counter, defaultdict
from datetime import date, timedelta
from typing import TYPE_CHECKING

from sqlalchemy.orm import Session

if TYPE_CHECKING:
    pass

logger = logging.getLogger(__name__)


# ─── Pattern label definitions ────────────────────────────────────────────────

PATTERN_LABELS = {
    "Everyday Starter":      "#22c55e",
    "Strong-Side Platoon":   "#3b82f6",
    "Weak-Side Platoon":     "#f59e0b",
    "Utility Regular":       "#8b5cf6",
    "Short-Side Bench Bat":  "#ec4899",
    "Catcher Rest Pattern":  "#06b6d4",
    "Leadoff Trend":         "#f97316",
    "Bottom-Third Lineup":   "#64748b",
    "Irregular":             "#94a3b8",
}


def compute_pattern(player_id: int, db: Session) -> dict:
    """
    Pull the last 30 days of DailyPlayerStatus for a player and return a
    dict ready to update/create a PlayerUsageStat row.
    """
    from .models import DailyPlayerStatus, PlayerUsageStat  # local import to avoid circular

    cutoff = (date.today() - timedelta(days=90)).isoformat()

    rows = (
        db.query(DailyPlayerStatus)
        .filter(
            DailyPlayerStatus.player_id == player_id,
            DailyPlayerStatus.date >= cutoff,
        )
        .order_by(DailyPlayerStatus.date.desc())
        .all()
    )

    if not rows:
        return {}

    # ── Recency windows ──────────────────────────────────────────────────────
    today = date.today()
    def started_in_window(days: int) -> int:
        cutoff_date = (today - timedelta(days=days)).isoformat()
        return sum(1 for r in rows if r.date >= cutoff_date and r.in_lineup)

    l7  = started_in_window(7)
    l14 = started_in_window(14)
    l30 = started_in_window(30)

    # ── Position breakdown ────────────────────────────────────────────────────
    pos_counts: Counter = Counter()
    for r in rows:
        if r.fielding_pos:
            pos_counts[r.fielding_pos] += 1

    # ── Pitcher-hand splits ───────────────────────────────────────────────────
    rhp_starts = sum(1 for r in rows if r.in_lineup and r.sp_hand == "R")
    lhp_starts = sum(1 for r in rows if r.in_lineup and r.sp_hand == "L")
    total_starts = rhp_starts + lhp_starts

    # ── Batting order distribution ────────────────────────────────────────────
    order_counts: Counter = Counter()
    for r in rows:
        if r.in_lineup and r.batting_order:
            order_counts[str(r.batting_order)] += 1

    # ── Cadence ───────────────────────────────────────────────────────────────
    start_dates = sorted(
        [r.date for r in rows if r.in_lineup], reverse=True
    )
    rest_days_list = []
    for i in range(len(start_dates) - 1):
        d1 = date.fromisoformat(start_dates[i])
        d2 = date.fromisoformat(start_dates[i + 1])
        gap = (d2 - d1).days  # negative because sorted desc; flip:
        gap = (d1 - d2).days
        if gap > 0:
            rest_days_list.append(gap - 1)  # 0 = back-to-back

    avg_rest = sum(rest_days_list) / len(rest_days_list) if rest_days_list else None

    # ── Classify pattern ──────────────────────────────────────────────────────
    label = _classify(
        l7=l7,
        l14=l14,
        l30=l30,
        rhp_starts=rhp_starts,
        lhp_starts=lhp_starts,
        pos_counts=pos_counts,
        order_counts=order_counts,
        avg_rest=avg_rest,
    )

    # ── Season totals (full window) ───────────────────────────────────────────
    games_started = sum(1 for r in rows if r.in_lineup)
    games_played  = len(rows)

    return {
        "season": today.year,
        "games_started": games_started,
        "games_played": games_played,
        "position_breakdown": dict(pos_counts),
        "starts_vs_rhp": rhp_starts,
        "starts_vs_lhp": lhp_starts,
        "batting_order_dist": dict(order_counts),
        "pattern_label": label,
        "l7_starts": l7,
        "l14_starts": l14,
        "l30_starts": l30,
        "avg_rest_days": round(avg_rest, 2) if avg_rest is not None else None,
    }


def _classify(
    l7: int,
    l14: int,
    l30: int,
    rhp_starts: int,
    lhp_starts: int,
    pos_counts: Counter,
    order_counts: Counter,
    avg_rest: float | None,
) -> str:
    total_starts = rhp_starts + lhp_starts

    # Everyday Starter: 6+ of last 7
    if l7 >= 6:
        return "Everyday Starter"

    # Batting order patterns (require ≥10 starts)
    if total_starts >= 10:
        most_common_slot = order_counts.most_common(1)
        if most_common_slot:
            slot, count = most_common_slot[0]
            slot_pct = count / total_starts
            if int(slot) == 1 and slot_pct >= 0.5:
                return "Leadoff Trend"
            if int(slot) >= 7 and slot_pct >= 0.5:
                return "Bottom-Third Lineup"

    # Catcher rest pattern: catchers who average ~1 rest day per 3 games
    is_catcher = pos_counts.get("C", 0) > (total_starts * 0.5) if total_starts else False
    if is_catcher and avg_rest is not None and 0.5 <= avg_rest <= 1.5:
        return "Catcher Rest Pattern"

    # Platoon patterns (require at least 15 starts to have signal)
    if total_starts >= 15:
        rhp_pct = rhp_starts / total_starts
        lhp_pct = lhp_starts / total_starts
        if rhp_pct >= 0.70:
            return "Strong-Side Platoon"
        if lhp_pct >= 0.70:
            return "Strong-Side Platoon"
        if rhp_pct <= 0.30 or lhp_pct <= 0.30:
            return "Weak-Side Platoon"

    # Utility Regular: starts at 3+ distinct positions
    if len(pos_counts) >= 3 and l30 >= 15:
        return "Utility Regular"

    # Short-Side Bench Bat: sporadic starter
    if l14 <= 4:
        return "Short-Side Bench Bat"

    return "Irregular"


def run_pattern_engine_for_all(db: Session) -> int:
    """
    Nightly job: recompute patterns for every player that has DailyPlayerStatus rows.
    Returns the number of players updated.
    """
    from .models import DailyPlayerStatus, PlayerUsageStat, Player  # local import

    # Get distinct player IDs that have any daily status data
    player_ids = [
        row[0] for row in
        db.query(DailyPlayerStatus.player_id).distinct().all()
    ]

    updated = 0
    for pid in player_ids:
        stats_dict = compute_pattern(pid, db)
        if not stats_dict:
            continue

        existing = db.query(PlayerUsageStat).filter(PlayerUsageStat.player_id == pid).first()
        if existing:
            for k, v in stats_dict.items():
                setattr(existing, k, v)
        else:
            db.add(PlayerUsageStat(player_id=pid, **stats_dict))
        updated += 1

    db.commit()
    return updated
