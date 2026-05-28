"""
FANTAG — Fantasy Baseball Roster Tracker API
"""

import logging
from contextlib import asynccontextmanager
from datetime import date

from fastapi import FastAPI, Depends
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text
from sqlalchemy.orm import Session

from .config import settings as app_config
from .database import Base, engine, get_db
from .models import DailyPlayerStatus, EventLog, PlayerNotification
from .routers import roster, players, imports, notifications, research, debug, espn, backup
from .routers import settings as settings_router
from .services.scheduler import start_scheduler, stop_scheduler

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(name)s: %(message)s")
logger = logging.getLogger(__name__)


def _run_sqlite_migrations():
    """Add any new columns to existing tables — safe to run on every startup."""
    if "sqlite" not in app_config.DATABASE_URL:
        return  # PostgreSQL uses Alembic

    migrations = {
        "daily_player_status": [
            ("game_time",     "VARCHAR(20)"),
            ("game_status",   "VARCHAR(30)"),
            ("venue_name",    "VARCHAR(80)"),
            ("is_dome",       "BOOLEAN DEFAULT 0"),
            ("team_has_game",    "BOOLEAN DEFAULT 0"),
            ("lineup_confirmed",    "BOOLEAN DEFAULT 0"),
            ("is_probable_starter",  "BOOLEAN DEFAULT 0"),
            ("ip_pitched",           "REAL"),
            ("fantasy_score_today",  "REAL"),
            ("batting_stats",        "JSON"),
            ("pitching_stats",       "JSON"),
        ],
        "fantasy_roster_entries": [
            ("espn_positions", "JSON"),
        ],
    }


    # Create new tables if they don't exist yet
    with engine.connect() as conn:
        conn.execute(text("""
            CREATE TABLE IF NOT EXISTS player_position_events (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                player_id INTEGER NOT NULL,
                date VARCHAR(10) NOT NULL,
                source VARCHAR(40) DEFAULT 'fantag',
                status VARCHAR(30),
                in_lineup BOOLEAN DEFAULT 0,
                fielding_pos VARCHAR(10),
                batting_order INTEGER,
                opponent VARCHAR(20),
                sp_hand VARCHAR(1),
                sp_name VARCHAR(80),
                game_id INTEGER,
                game_status VARCHAR(30),
                lineup_confirmed BOOLEAN DEFAULT 0,
                team_has_game BOOLEAN DEFAULT 0,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        """))
        conn.execute(text("CREATE INDEX IF NOT EXISTS ix_player_position_events_player_date ON player_position_events(player_id, date)"))
        conn.execute(text("""
            CREATE TABLE IF NOT EXISTS player_research (
                id            INTEGER PRIMARY KEY AUTOINCREMENT,
                mlb_id        INTEGER UNIQUE NOT NULL,
                name          VARCHAR(120),
                team          VARCHAR(10),
                position_vsR  VARCHAR(10),
                position_vsL  VARCHAR(10),
                platoon       BOOLEAN DEFAULT 0,
                role_note     TEXT,
                is_dh_risk    BOOLEAN DEFAULT 0,
                source        VARCHAR(200),
                researched_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        """))
        conn.commit()
    with engine.connect() as conn:
        for table, cols in migrations.items():
            try:
                existing = [
                    row[1] for row in
                    conn.execute(text(f"PRAGMA table_info({table})")).fetchall()
                ]
                for col_name, col_def in cols:
                    if col_name not in existing:
                        conn.execute(text(f"ALTER TABLE {table} ADD COLUMN {col_name} {col_def}"))
                        logger.info("Migration: added %s.%s", table, col_name)
            except Exception as e:
                logger.warning("Migration skipped for %s: %s", table, e)
        conn.commit()


@asynccontextmanager
async def lifespan(app: FastAPI):
    Base.metadata.create_all(bind=engine)
    logger.info("Database tables verified")
    _run_sqlite_migrations()
    logger.info("Migrations complete")
    start_scheduler()
    # Run lineup poll immediately on startup so data is available without waiting for cron
    try:
        from .services.scheduler import poll_daily_lineups, poll_transactions
        import threading
        def _startup_polls():
            import time
            time.sleep(3)  # tiny delay so scheduler is fully started
            logger.info("Startup: mirroring ESPN roster before lineup poll")
            try:
                from .services.scheduler import sync_espn_roster_job
                sync_espn_roster_job()
            except Exception as sync_exc:
                logger.warning("Startup ESPN mirror skipped/failed: %s", sync_exc)
            logger.info("Startup: running initial lineup poll (check logs or GET /roster/diagnostic)")
            poll_daily_lineups()
            logger.info("Startup: running initial transactions/IL poll")
            poll_transactions()
            logger.info("Startup: updating pitcher IP workload")
            from .services.scheduler import update_pitcher_ip
            update_pitcher_ip()
        threading.Thread(target=_startup_polls, daemon=True).start()
    except Exception as e:
        logger.warning("Startup poll scheduling failed: %s", e)
    yield
    stop_scheduler()


from .version import VERSION, BUILD
app = FastAPI(title="FANTAG API", version=VERSION, lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Self-hosted: allow all origins
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(roster.router)
app.include_router(players.router)
app.include_router(imports.router)
app.include_router(notifications.router)
app.include_router(settings_router.router)
app.include_router(research.router)
app.include_router(debug.router)
app.include_router(espn.router)
app.include_router(backup.router)


@app.get("/health", tags=["meta"])
def health():
    from zoneinfo import ZoneInfo
    from datetime import datetime
    cdt = datetime.now(ZoneInfo("America/Chicago"))
    return {
        "status":     "ok",
        "version":    VERSION,
        "build":      BUILD,
        "date_utc":   date.today().isoformat(),
        "date_cdt":   cdt.date().isoformat(),
        "time_cdt":   cdt.strftime("%H:%M:%S CDT"),
        "diagnostic": "GET /roster/diagnostic",
        "docs":       "GET /docs",
        "tip":        "Direct API (port 8011): use /roster/... not /api/roster/...",
        "sanity": {"espn_router": True, "backup_router": True, "database_url": app_config.DATABASE_URL},
    }


@app.get("/notifications/alerts", tags=["notifications"])
def get_alerts(limit: int = 50, db: Session = Depends(get_db)):
    rows = (
        db.query(EventLog)
        .filter(EventLog.event_type == "notification_fired")
        .order_by(EventLog.created_at.desc())
        .limit(limit)
        .all()
    )
    alerts = []
    for r in rows:
        payload = r.payload or {}
        alerts.append({
            "id": r.id,
            "player_id": r.player_id,
            "message": payload.get("message", ""),
            "rule_type": payload.get("rule_type", ""),
            "channel": payload.get("channel", ""),
            "alert_color": payload.get("alert_color", "blue"),
            "alert_type": payload.get("alert_type", ""),
            "fielding_pos": payload.get("fielding_pos"),
            "batting_order": payload.get("batting_order"),
            "date": payload.get("date"),
            "payload": payload,
            "created_at": r.created_at.isoformat(),
        })
    return alerts
