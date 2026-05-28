"""Backup / restore router for FANTAG."""
from __future__ import annotations
import json, os, re, shutil
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo
from urllib.parse import unquote
from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse
from pydantic import BaseModel
from ..config import settings as app_config
from ..database import engine
from ..version import VERSION, BUILD

router = APIRouter(prefix="/backup", tags=["backup"])
CDT = ZoneInfo("America/Chicago")
SAFE_NAME = re.compile(r"^[A-Za-z0-9_.-]+$")

class RestoreRequest(BaseModel):
    filename: str
    confirm: bool = False

def _sqlite_db_path() -> Path:
    url = app_config.DATABASE_URL
    if not url.startswith("sqlite"):
        raise HTTPException(400, "Backup/restore currently supports SQLite deployments only")
    raw = url.replace("sqlite:///", "", 1) if url.startswith("sqlite:///") else url.split("///", 1)[-1]
    return Path(unquote(raw)).resolve()

def _backup_dir() -> Path:
    base = os.getenv("FANTAG_BACKUP_DIR", "")
    path = Path(base) if base else _sqlite_db_path().parent / "backups"
    path.mkdir(parents=True, exist_ok=True)
    return path.resolve()

def _safe_backup_file(filename: str) -> Path:
    name = Path(filename).name
    if not SAFE_NAME.match(name) or not name.endswith(".db"):
        raise HTTPException(400, "Invalid backup filename")
    path = (_backup_dir() / name).resolve()
    if path.parent != _backup_dir():
        raise HTTPException(400, "Invalid backup path")
    if not path.exists():
        raise HTTPException(404, "Backup file not found")
    return path

def _sqlite_copy(src: Path, dest: Path):
    import sqlite3
    dest.parent.mkdir(parents=True, exist_ok=True)
    try:
        src_conn = sqlite3.connect(str(src))
        dest_conn = sqlite3.connect(str(dest))
        with dest_conn:
            src_conn.backup(dest_conn)
        src_conn.close(); dest_conn.close()
    except Exception:
        shutil.copy2(src, dest)

@router.get("/status")
def backup_status():
    db_path = _sqlite_db_path(); bdir = _backup_dir()
    return {"database_path": str(db_path), "database_exists": db_path.exists(), "database_size_bytes": db_path.stat().st_size if db_path.exists() else 0, "backup_dir": str(bdir), "backup_count": len(list(bdir.glob("*.db"))), "version": VERSION, "build": BUILD}

@router.get("/list")
def list_backups():
    bdir = _backup_dir(); files = []
    for p in sorted(bdir.glob("*.db"), key=lambda x: x.stat().st_mtime, reverse=True):
        meta_path = p.with_suffix(".json"); meta = {}
        if meta_path.exists():
            try: meta = json.loads(meta_path.read_text())
            except Exception: meta = {}
        files.append({"filename": p.name, "size_bytes": p.stat().st_size, "created_at": datetime.fromtimestamp(p.stat().st_mtime, CDT).isoformat(), "version": meta.get("version"), "build": meta.get("build"), "reason": meta.get("reason", "manual")})
    return {"backups": files}

@router.post("/create")
def create_backup(reason: str = "manual"):
    db_path = _sqlite_db_path()
    if not db_path.exists(): raise HTTPException(404, f"Database not found at {db_path}")
    ts = datetime.now(CDT).strftime("%Y%m%d_%H%M%S")
    filename = f"fantag_backup_v{VERSION}_b{BUILD}_{ts}.db"
    dest = _backup_dir() / filename
    _sqlite_copy(db_path, dest)
    meta = {"filename": filename, "created_at": datetime.now(CDT).isoformat(), "reason": reason, "version": VERSION, "build": BUILD, "database_path": str(db_path)}
    dest.with_suffix(".json").write_text(json.dumps(meta, indent=2))
    return {"message": "Backup created", "backup": {**meta, "size_bytes": dest.stat().st_size}}

@router.post("/restore")
def restore_backup(payload: RestoreRequest):
    if not payload.confirm: raise HTTPException(400, "Restore requires confirm=true")
    src = _safe_backup_file(payload.filename); db_path = _sqlite_db_path()
    safety = _backup_dir() / f"pre_restore_safety_{datetime.now(CDT).strftime('%Y%m%d_%H%M%S')}.db"
    if db_path.exists(): _sqlite_copy(db_path, safety)
    engine.dispose(); shutil.copy2(src, db_path)
    return {"message": "Restore complete. Restart fantag-api to make sure every connection uses the restored database.", "restored_from": src.name, "pre_restore_safety_backup": safety.name if safety.exists() else None}

@router.delete("/{filename}")
def delete_backup(filename: str):
    p = _safe_backup_file(filename); meta = p.with_suffix(".json")
    p.unlink()
    if meta.exists(): meta.unlink()
    return {"message": "Backup deleted", "filename": filename}

@router.get("/download/{filename}")
def download_backup(filename: str):
    p = _safe_backup_file(filename)
    return FileResponse(str(p), media_type="application/octet-stream", filename=p.name)
