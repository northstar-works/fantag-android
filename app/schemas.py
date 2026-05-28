from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any
from datetime import datetime
from .models import RosterStatus, PlayerStatus, ImportMatchType, NotificationChannel


# ─── Player ───────────────────────────────────────────────────────────────────

class PlayerBase(BaseModel):
    mlb_id: int
    name: str
    name_short: Optional[str] = None
    team: Optional[str] = None
    team_id: Optional[int] = None
    positions: List[str] = []
    bats: Optional[str] = None
    throws: Optional[str] = None
    headshot_url: Optional[str] = None

class PlayerCreate(PlayerBase):
    pass

class PlayerOut(PlayerBase):
    id: int
    active: bool
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True


# ─── Roster Entry ─────────────────────────────────────────────────────────────

class RosterEntryCreate(BaseModel):
    player_id: int
    status: RosterStatus = RosterStatus.roster
    fantasy_pos: Optional[str] = None
    notes: Optional[str] = None

class RosterEntryUpdate(BaseModel):
    status: Optional[RosterStatus] = None
    fantasy_pos: Optional[str] = None
    notes: Optional[str] = None
    espn_positions: Optional[list] = None   # set by user to override computed eligibility

class RosterEntryOut(BaseModel):
    id: int
    player_id: int
    status: RosterStatus
    fantasy_pos: Optional[str] = None
    notes: Optional[str] = None
    espn_positions: Optional[list] = None
    added_at: datetime
    player: PlayerOut

    class Config:
        from_attributes = True


# ─── Daily Status ─────────────────────────────────────────────────────────────

class DailyStatusOut(BaseModel):
    id: int
    player_id: int
    date: str
    status: PlayerStatus
    in_lineup: bool
    batting_order: Optional[int] = None
    fielding_pos: Optional[str] = None
    opponent: Optional[str] = None
    sp_hand: Optional[str] = None
    sp_name: Optional[str] = None
    game_id: Optional[int] = None
    game_time: Optional[str] = None
    game_status: Optional[str] = None
    venue_name: Optional[str] = None
    is_dome: Optional[bool] = None
    team_has_game: Optional[bool] = None
    lineup_confirmed: Optional[bool] = None
    is_probable_starter: Optional[bool] = None
    fantasy_score_today: Optional[float] = None
    batting_stats: Optional[dict] = None
    pitching_stats: Optional[dict] = None

    class Config:
        from_attributes = True


# ─── Usage Stats / Pattern ────────────────────────────────────────────────────

class UsageStatOut(BaseModel):
    id: int
    player_id: int
    season: int
    games_started: int
    games_played: int
    position_breakdown: Dict[str, int]
    starts_vs_rhp: int
    starts_vs_lhp: int
    pa_vs_rhp: int
    pa_vs_lhp: int
    avg_vs_rhp: Optional[float] = None
    avg_vs_lhp: Optional[float] = None
    batting_order_dist: Dict[str, int]
    pattern_label: Optional[str] = None
    l7_starts: int
    l14_starts: int
    l30_starts: int
    avg_rest_days: Optional[float] = None
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True


# ─── Screenshot Import ────────────────────────────────────────────────────────

class ImportItemUpdate(BaseModel):
    confirmed: Optional[bool] = None
    matched_player_id: Optional[int] = None
    target_status: Optional[RosterStatus] = None

class ImportItemOut(BaseModel):
    id: int
    import_id: int
    raw_name: str
    matched_player_id: Optional[int] = None
    match_type: ImportMatchType
    confidence: float
    confirmed: bool
    target_status: RosterStatus
    extra_data: Dict[str, Any]
    matched_player: Optional[PlayerOut] = None

    class Config:
        from_attributes = True

class ImportOut(BaseModel):
    id: int
    filename: Optional[str] = None
    mode: str
    status: str
    created_at: datetime
    completed_at: Optional[datetime] = None
    items: List[ImportItemOut] = []

    class Config:
        from_attributes = True


# ─── Notifications ────────────────────────────────────────────────────────────

class NotificationCreate(BaseModel):
    player_id: int
    rule_type: str
    threshold: Dict[str, Any] = {}
    channel: NotificationChannel = NotificationChannel.in_app

class NotificationOut(BaseModel):
    id: int
    player_id: int
    rule_type: str
    threshold: Dict[str, Any]
    channel: NotificationChannel
    enabled: bool
    last_fired: Optional[datetime] = None
    created_at: datetime
    player: PlayerOut

    class Config:
        from_attributes = True


# ─── Rich player detail (combines all sub-resources) ─────────────────────────

class PlayerDetailOut(BaseModel):
    player: PlayerOut
    roster_entry: Optional[RosterEntryOut] = None
    today_status: Optional[DailyStatusOut] = None
    usage_stats: Optional[UsageStatOut] = None
    recent_game_log: List[DailyStatusOut] = []
    live_stats: dict = {}


# ─── Misc ─────────────────────────────────────────────────────────────────────

class MessageOut(BaseModel):
    message: str

class StatsOut(BaseModel):
    roster_count: int
    watch_count: int
    starting_today: int
    on_il: int
    dtd_count: int
