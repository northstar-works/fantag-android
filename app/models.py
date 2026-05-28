from sqlalchemy import (
    Column, Integer, String, Float, Boolean, DateTime, Text, JSON, ForeignKey, Enum
)
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
import enum
from .database import Base


class RosterStatus(str, enum.Enum):
    roster = "roster"
    watch  = "watch"
    il     = "il"

class PlayerStatus(str, enum.Enum):
    starting  = "starting"
    bench     = "bench"
    il        = "il"
    dtd       = "dtd"
    minors    = "minors"
    suspended = "suspended"
    unknown   = "unknown"

class ImportMatchType(str, enum.Enum):
    exact      = "exact"
    likely     = "likely"
    duplicate  = "duplicate"
    unresolved = "unresolved"

class NotificationChannel(str, enum.Enum):
    push    = "push"
    email   = "email"
    in_app  = "in_app"


class Player(Base):
    __tablename__ = "players"
    id           = Column(Integer, primary_key=True, index=True)
    mlb_id       = Column(Integer, unique=True, index=True, nullable=False)
    name         = Column(String(120), nullable=False, index=True)
    name_short   = Column(String(60))
    team         = Column(String(60))
    team_id      = Column(Integer)
    positions    = Column(JSON, default=list)
    bats         = Column(String(1))
    throws       = Column(String(1))
    active       = Column(Boolean, default=True)
    headshot_url = Column(String(255))
    updated_at   = Column(DateTime, server_default=func.now(), onupdate=func.now())
    roster_entries = relationship("FantasyRosterEntry", back_populates="player")
    daily_statuses = relationship("DailyPlayerStatus", back_populates="player")
    usage_stats    = relationship("PlayerUsageStat", back_populates="player")
    notifications  = relationship("PlayerNotification", back_populates="player")


class FantasyRosterEntry(Base):
    __tablename__ = "fantasy_roster_entries"
    id          = Column(Integer, primary_key=True, index=True)
    player_id   = Column(Integer, ForeignKey("players.id"), nullable=False)
    status      = Column(Enum(RosterStatus), default=RosterStatus.roster, nullable=False)
    fantasy_pos    = Column(String(10))
    notes          = Column(Text)
    espn_positions = Column(JSON)   # user-set ESPN eligibility overrides player.positions
    added_at       = Column(DateTime, server_default=func.now())
    updated_at     = Column(DateTime, server_default=func.now(), onupdate=func.now())
    player = relationship("Player", back_populates="roster_entries")


class ScreenshotImport(Base):
    __tablename__ = "screenshot_imports"
    id           = Column(Integer, primary_key=True, index=True)
    filename     = Column(String(255))
    mode         = Column(String(20), default="additive")
    status       = Column(String(20), default="pending")
    raw_text     = Column(Text)
    created_at   = Column(DateTime, server_default=func.now())
    completed_at = Column(DateTime)
    items = relationship("ScreenshotImportItem", back_populates="import_session",
                         cascade="all, delete-orphan")


class ScreenshotImportItem(Base):
    __tablename__ = "screenshot_import_items"
    id                = Column(Integer, primary_key=True, index=True)
    import_id         = Column(Integer, ForeignKey("screenshot_imports.id"), nullable=False)
    raw_name          = Column(String(120))
    matched_player_id = Column(Integer, ForeignKey("players.id"))
    match_type        = Column(Enum(ImportMatchType), default=ImportMatchType.unresolved)
    confidence        = Column(Float, default=0.0)
    confirmed         = Column(Boolean, default=False)
    target_status     = Column(Enum(RosterStatus), default=RosterStatus.roster)
    extra_data        = Column(JSON, default=dict)
    import_session = relationship("ScreenshotImport", back_populates="items")
    matched_player = relationship("Player")


class DailyPlayerStatus(Base):
    """One row per player per day — populated by the MLB Stats API poller."""
    __tablename__ = "daily_player_status"
    id            = Column(Integer, primary_key=True, index=True)
    player_id     = Column(Integer, ForeignKey("players.id"), nullable=False)
    date          = Column(String(10), nullable=False, index=True)
    status        = Column(Enum(PlayerStatus), default=PlayerStatus.unknown)
    in_lineup     = Column(Boolean, default=False)
    batting_order = Column(Integer)
    fielding_pos  = Column(String(5))
    opponent      = Column(String(10))
    sp_hand       = Column(String(1))
    sp_name       = Column(String(80))
    game_id       = Column(Integer)
    # New fields
    game_time     = Column(String(20))   # "7:10 PM CDT"
    game_status   = Column(String(30))   # Scheduled / In Progress / Final / Postponed / Delayed / Suspended
    venue_name    = Column(String(80))
    is_dome       = Column(Boolean, default=False)
    team_has_game     = Column(Boolean, default=False)  # team plays today even if player not in lineup
    lineup_confirmed    = Column(Boolean, default=False)  # team lineup has been officially posted today
    is_probable_starter = Column(Boolean, default=False)  # this player is the scheduled SP today
    ip_pitched          = Column(Float)    # innings pitched this game (for RP workload tracking)
    fantasy_score_today = Column(Float)    # cached fantasy score for today
    batting_stats       = Column(JSON)     # raw batting stat dict from boxscore (persisted for history)
    pitching_stats      = Column(JSON)     # raw pitching stat dict from boxscore (persisted for history)
    created_at          = Column(DateTime, server_default=func.now())
    player = relationship("Player", back_populates="daily_statuses")


class PlayerUsageStat(Base):
    __tablename__ = "player_usage_stats"
    id                 = Column(Integer, primary_key=True, index=True)
    player_id          = Column(Integer, ForeignKey("players.id"), nullable=False, unique=True)
    season             = Column(Integer, nullable=False)
    games_started      = Column(Integer, default=0)
    games_played       = Column(Integer, default=0)
    position_breakdown = Column(JSON, default=dict)
    starts_vs_rhp      = Column(Integer, default=0)
    starts_vs_lhp      = Column(Integer, default=0)
    pa_vs_rhp          = Column(Integer, default=0)
    pa_vs_lhp          = Column(Integer, default=0)
    avg_vs_rhp         = Column(Float)
    avg_vs_lhp         = Column(Float)
    batting_order_dist = Column(JSON, default=dict)
    pattern_label      = Column(String(60))
    l7_starts          = Column(Integer, default=0)
    l14_starts         = Column(Integer, default=0)
    l30_starts         = Column(Integer, default=0)
    avg_rest_days      = Column(Float)
    updated_at         = Column(DateTime, server_default=func.now(), onupdate=func.now())
    player = relationship("Player", back_populates="usage_stats")


class PlayerNotification(Base):
    __tablename__ = "player_notifications"
    id         = Column(Integer, primary_key=True, index=True)
    player_id  = Column(Integer, ForeignKey("players.id"), nullable=False)
    rule_type  = Column(String(60), nullable=False)
    threshold  = Column(JSON, default=dict)
    channel    = Column(Enum(NotificationChannel), default=NotificationChannel.in_app)
    enabled    = Column(Boolean, default=True)
    last_fired = Column(DateTime)
    created_at = Column(DateTime, server_default=func.now())
    player = relationship("Player", back_populates="notifications")


class EventLog(Base):
    __tablename__ = "event_log"
    id         = Column(Integer, primary_key=True, index=True)
    event_type = Column(String(60), nullable=False, index=True)
    player_id  = Column(Integer, ForeignKey("players.id"), index=True)
    payload    = Column(JSON, default=dict)
    created_at = Column(DateTime, server_default=func.now(), index=True)



class PlayerPositionEvent(Base):
    """Daily position/status history for player profiles and pattern detection.

    One row per player/date. Updated by every lineup poll so the app can track
    when a player started, sat, DH'd, and which defensive position he played.
    """
    __tablename__ = "player_position_events"
    id             = Column(Integer, primary_key=True, index=True)
    player_id      = Column(Integer, ForeignKey("players.id"), nullable=False, index=True)
    date           = Column(String(10), nullable=False, index=True)
    source         = Column(String(40), default="fantag")
    status         = Column(String(30))
    in_lineup      = Column(Boolean, default=False)
    fielding_pos   = Column(String(10))
    batting_order  = Column(Integer)
    opponent       = Column(String(20))
    sp_hand        = Column(String(1))
    sp_name        = Column(String(80))
    game_id        = Column(Integer)
    game_status    = Column(String(30))
    lineup_confirmed = Column(Boolean, default=False)
    team_has_game     = Column(Boolean, default=False)
    created_at     = Column(DateTime, server_default=func.now())
    updated_at     = Column(DateTime, server_default=func.now(), onupdate=func.now())
    player = relationship("Player")
class PlayerResearch(Base):
    """
    Stores researched current-season role and position data per player.
    Populated by the Claude API web-search research endpoint and refreshed
    daily for all rostered players, on-demand for any player modal open.
    """
    __tablename__ = "player_research"
    id            = Column(Integer, primary_key=True, index=True)
    mlb_id        = Column(Integer, unique=True, index=True, nullable=False)
    name          = Column(String(120))
    team          = Column(String(10))
    position_vsR  = Column(String(10))   # expected position vs RHP
    position_vsL  = Column(String(10))   # expected position vs LHP
    platoon       = Column(Boolean, default=False)
    role_note     = Column(Text)         # 1-2 sentence current role summary
    is_dh_risk    = Column(Boolean, default=False)  # likely to DH some days
    source        = Column(String(200))  # URL or source name
    researched_at = Column(DateTime, server_default=func.now())
