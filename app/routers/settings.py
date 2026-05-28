from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import Column, String, Text
from pydantic import BaseModel
from typing import Optional, Any
import json

from ..database import get_db, Base, engine
from ..config import settings as app_settings

router = APIRouter(prefix="/settings", tags=["settings"])


class AppSetting(Base):
    __tablename__ = "app_settings"
    key   = Column(String(80), primary_key=True)
    value = Column(Text, nullable=False)


Base.metadata.create_all(bind=engine)


def _get_setting(db: Session, key: str, default: Any = None) -> Any:
    row = db.query(AppSetting).filter(AppSetting.key == key).first()
    if row is None:
        return default
    try:
        return json.loads(row.value)
    except Exception:
        return row.value


def _set_setting(db: Session, key: str, value: Any):
    serialized = json.dumps(value)
    row = db.query(AppSetting).filter(AppSetting.key == key).first()
    if row:
        row.value = serialized
    else:
        db.add(AppSetting(key=key, value=serialized))
    db.commit()


# ── Full ESPN-style scoring categories ────────────────────────────
DEFAULT_SCORING = {
    "batting": {
        "H":1, "R":2, "1B":1, "2B":2, "3B":3, "HR":8,
        "XBH":1, "RBI":2, "GWRBI":1, "BB":1, "IBB":1,
        "K":-1, "HBP":1, "SAC":1, "SB":6, "CS":-1,
        "GIDP":-1, "CYC":10, "GSHR":10,
        "FC":0.5, "PO":1, "AST":5, "OFAST":70, "E":-1, "DPT":4,
    },
    "pitching": {
        "IP":4.5, "ER":-1, "HR":-1, "BB":-1, "K":4,
        "B":-2, "PKO":3, "CG":5, "SO":3, "NH":10, "PG":15,
        "W":5, "L":-2, "SOP":1, "SV":10, "BS":-2, "HD":7,
    },
}

DEFAULTS = {
    # AI
    "ocr_provider":             app_settings.OCR_PROVIDER,
    "openai_api_key":           app_settings.OPENAI_API_KEY,
    "anthropic_api_key":        app_settings.ANTHROPIC_API_KEY,
    "openai_model":             app_settings.OPENAI_MODEL,
    # Schedule
    "daily_poll_hour":          app_settings.DAILY_POLL_HOUR,
    "daily_poll_minute":        app_settings.DAILY_POLL_MINUTE,
    "midday_poll_hour":         11,
    "pattern_engine_hour":      3,
    "notifications_hour":       11,
    "roster_sync_day":          "sun",
    "day_switch_hour":          2,
    # Pre-game auto-poll
    "pre_game_poll_enabled":    True,
    "pre_game_poll_minutes":    30,   # fire this many minutes before each game group
    "lineup_source_primary":     "rotowire",
    "lineup_external_enabled":   True,
    "lineup_watch_poll_enabled": True,
    "lineup_watch_poll_minutes": 3,
    # League
    "league_name":              "My League",
    "team_name":                "My Team",
    "team_count":               10,
    "waiver_priority":          1,
    "scoring_format":           "h2h_points",
    "scoring_rules":            DEFAULT_SCORING,
    "roster_display_mode":      "espn_slot",
}


class SettingsOut(BaseModel):
    ocr_provider:           str
    openai_model:           str
    daily_poll_hour:        int
    daily_poll_minute:      int
    midday_poll_hour:       int
    pattern_engine_hour:    int
    notifications_hour:     int
    roster_sync_day:        str
    day_switch_hour:        int
    pre_game_poll_enabled:  bool
    pre_game_poll_minutes:  int
    lineup_source_primary:    str
    lineup_external_enabled:  bool
    lineup_watch_poll_enabled: bool
    lineup_watch_poll_minutes: int
    league_name:            str
    team_name:              str
    team_count:             int
    waiver_priority:        int
    scoring_format:         str
    scoring_rules:          dict
    roster_display_mode:    str


class SettingsPatch(BaseModel):
    ocr_provider:           Optional[str]  = None
    openai_model:           Optional[str]  = None
    daily_poll_hour:        Optional[int]  = None
    daily_poll_minute:      Optional[int]  = None
    midday_poll_hour:       Optional[int]  = None
    pattern_engine_hour:    Optional[int]  = None
    notifications_hour:     Optional[int]  = None
    roster_sync_day:        Optional[str]  = None
    day_switch_hour:        Optional[int]  = None
    pre_game_poll_enabled:  Optional[bool] = None
    pre_game_poll_minutes:  Optional[int]  = None
    lineup_source_primary:    Optional[str]  = None
    lineup_external_enabled:  Optional[bool] = None
    lineup_watch_poll_enabled: Optional[bool] = None
    lineup_watch_poll_minutes: Optional[int]  = None
    league_name:            Optional[str]  = None
    team_name:              Optional[str]  = None
    team_count:             Optional[int]  = None
    waiver_priority:        Optional[int]  = None
    scoring_format:         Optional[str]  = None
    scoring_rules:          Optional[dict] = None
    roster_display_mode:    Optional[str]  = None


@router.get("/", response_model=SettingsOut)
def get_settings(db: Session = Depends(get_db)):
    return {k: _get_setting(db, k, v) for k, v in DEFAULTS.items()}


@router.patch("/", response_model=SettingsOut)
def update_settings(payload: SettingsPatch, db: Session = Depends(get_db)):
    for key, value in payload.model_dump(exclude_none=True).items():
        _set_setting(db, key, value)
    _reschedule(db)
    return get_settings(db)


def _reschedule(db: Session):
    try:
        from apscheduler.triggers.cron import CronTrigger
        from ..services.scheduler import scheduler, schedule_pre_game_polls

        h  = _get_setting(db, "daily_poll_hour",     DEFAULTS["daily_poll_hour"])
        m  = _get_setting(db, "daily_poll_minute",   DEFAULTS["daily_poll_minute"])
        mh = _get_setting(db, "midday_poll_hour",    DEFAULTS["midday_poll_hour"])
        ph = _get_setting(db, "pattern_engine_hour", DEFAULTS["pattern_engine_hour"])
        nh = _get_setting(db, "notifications_hour",  DEFAULTS["notifications_hour"])
        rd = _get_setting(db, "roster_sync_day",     DEFAULTS["roster_sync_day"])

        jobs = {
            "lineups_morning": CronTrigger(hour=h,  minute=m),
            "lineups_midday":  CronTrigger(hour=mh, minute=0),
            "lineups_watch":   CronTrigger(hour="12-23", minute="*/3"),
            "espn_sync":       CronTrigger(hour="6,12,18", minute=10),
            "transactions":    CronTrigger(hour=h,  minute=15),
            "patterns":        CronTrigger(hour=ph, minute=0),
            "notifications":   CronTrigger(hour=nh, minute=30),
            "rosters":         CronTrigger(day_of_week=rd, hour=4, minute=0),
        }
        for job_id, trigger in jobs.items():
            job = scheduler.get_job(job_id)
            if job:
                job.reschedule(trigger=trigger)

        # Re-schedule pre-game polls with new settings
        schedule_pre_game_polls(db)

    except Exception as e:
        import logging
        logging.getLogger(__name__).warning("Reschedule failed: %s", e)


JOBS = {
    "lineups_morning":    "Poll lineups (morning)",
    "lineups_midday":     "Poll lineups (midday)",
    "lineups_afternoon":  "Poll lineups (afternoon 5pm)",
    "lineups_evening":    "Poll lineups (evening 8pm)",
    "lineups_late":       "Poll lineups (late 10pm)",
    "transactions":       "Poll IL transactions",
    "patterns":           "Run pattern engine",
    "notifications":      "Fire notification rules",
    "rosters":            "Sync team rosters (40-man)",
    "pre_game_setup":     "Schedule today's pre-game polls",
    "pitcher_ip":         "Update pitcher IP workload",
    "pitcher_ip_evening": "Update pitcher IP workload (evening)",
    "fantasy_scores":     "Write fantasy scores to DB",
    "future_lineups":     "Poll probable starters (next 4 days)",
    "lineups_watch":       "Lineup Watch poll (Rotowire/primary source)",
    "espn_sync":          "Sync ESPN roster + eligibility",
    "research_roster":   "Research player roles (web search)",
}


@router.get("/jobs")
def list_jobs():
    return {"jobs": JOBS}


@router.post("/trigger/{job_id}")
def trigger_job(job_id: str):
    if job_id not in JOBS:
        raise HTTPException(404, f"Unknown job '{job_id}'")
    try:
        from ..services.scheduler import scheduler
        job = scheduler.get_job(job_id)
        if not job:
            raise HTTPException(404, f"Job '{job_id}' not found in scheduler")
        job.func()
        return {"triggered": job_id, "message": f"'{JOBS[job_id]}' ran successfully"}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(500, str(e))
