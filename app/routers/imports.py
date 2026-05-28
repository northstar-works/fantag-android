from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from sqlalchemy.orm import Session, joinedload
from typing import List
from datetime import datetime, timezone

from ..database import get_db
from ..models import (
    ScreenshotImport, ScreenshotImportItem, FantasyRosterEntry,
    ImportMatchType, EventLog
)
from ..schemas import ImportOut, ImportItemUpdate, MessageOut
from ..services.ocr import process_screenshot

router = APIRouter(prefix="/imports", tags=["imports"])


@router.post("/", response_model=ImportOut, status_code=201)
async def create_import(
    file: UploadFile = File(...),
    mode: str = Form("additive"),
    db: Session = Depends(get_db),
):
    """
    Upload a screenshot for OCR processing.
    Returns an import record immediately; items are populated after OCR.
    mode: 'additive' (add new players) | 'reconcile' (add new + remove missing)
    """
    if mode not in ("additive", "reconcile"):
        raise HTTPException(400, "mode must be 'additive' or 'reconcile'")

    image_bytes = await file.read()

    # Create the import record
    imp = ScreenshotImport(filename=file.filename, mode=mode, status="processing")
    db.add(imp)
    db.commit()
    db.refresh(imp)

    try:
        items = await process_screenshot(image_bytes, db)
        for item_data in items:
            item = ScreenshotImportItem(import_id=imp.id, **item_data)
            db.add(item)

        imp.status = "review"
        imp.raw_text = "\n".join(i.get("raw_name", "") for i in items)
    except Exception as e:
        imp.status = "error"
        db.commit()
        raise HTTPException(500, f"OCR processing failed: {e}") from e

    db.commit()
    db.refresh(imp)

    # Reload with relationships
    return (
        db.query(ScreenshotImport)
        .options(
            joinedload(ScreenshotImport.items)
            .joinedload(ScreenshotImportItem.matched_player)
        )
        .filter(ScreenshotImport.id == imp.id)
        .first()
    )


@router.get("/", response_model=List[ImportOut])
def list_imports(db: Session = Depends(get_db)):
    return (
        db.query(ScreenshotImport)
        .options(joinedload(ScreenshotImport.items))
        .order_by(ScreenshotImport.created_at.desc())
        .limit(20)
        .all()
    )


@router.get("/{import_id}", response_model=ImportOut)
def get_import(import_id: int, db: Session = Depends(get_db)):
    imp = (
        db.query(ScreenshotImport)
        .options(
            joinedload(ScreenshotImport.items)
            .joinedload(ScreenshotImportItem.matched_player)
        )
        .filter(ScreenshotImport.id == import_id)
        .first()
    )
    if not imp:
        raise HTTPException(404, "Import not found")
    return imp


@router.patch("/{import_id}/items/{item_id}", response_model=ImportOut)
def update_import_item(
    import_id: int,
    item_id: int,
    payload: ImportItemUpdate,
    db: Session = Depends(get_db),
):
    """Update a single item's confirmation / matched player before committing."""
    item = (
        db.query(ScreenshotImportItem)
        .filter(
            ScreenshotImportItem.id == item_id,
            ScreenshotImportItem.import_id == import_id,
        )
        .first()
    )
    if not item:
        raise HTTPException(404, "Item not found")

    for field, value in payload.model_dump(exclude_none=True).items():
        setattr(item, field, value)

    db.commit()
    return get_import(import_id, db)


@router.post("/{import_id}/commit", response_model=MessageOut)
def commit_import(import_id: int, db: Session = Depends(get_db)):
    """
    Apply all confirmed items to the roster/watch list.
    In 'reconcile' mode, also removes rostered players not in the import.
    """
    imp = db.query(ScreenshotImport).filter(ScreenshotImport.id == import_id).first()
    if not imp:
        raise HTTPException(404, "Import not found")
    if imp.status == "done":
        raise HTTPException(409, "Import already committed")

    confirmed_items = (
        db.query(ScreenshotImportItem)
        .filter(
            ScreenshotImportItem.import_id == import_id,
            ScreenshotImportItem.confirmed == True,
            ScreenshotImportItem.matched_player_id != None,
            ScreenshotImportItem.match_type != ImportMatchType.duplicate,
        )
        .all()
    )

    added = 0
    for item in confirmed_items:
        existing = (
            db.query(FantasyRosterEntry)
            .filter(FantasyRosterEntry.player_id == item.matched_player_id)
            .first()
        )
        if not existing:
            entry = FantasyRosterEntry(
                player_id=item.matched_player_id,
                status=item.target_status,
            )
            db.add(entry)
            db.add(EventLog(
                event_type="import_add",
                player_id=item.matched_player_id,
                payload={"import_id": import_id, "raw_name": item.raw_name},
            ))
            added += 1

    if imp.mode == "reconcile":
        imported_ids = {i.matched_player_id for i in confirmed_items if i.matched_player_id}
        all_roster = db.query(FantasyRosterEntry).all()
        removed = 0
        for entry in all_roster:
            if entry.player_id not in imported_ids:
                db.add(EventLog(
                    event_type="import_reconcile_remove",
                    player_id=entry.player_id,
                    payload={"import_id": import_id},
                ))
                db.delete(entry)
                removed += 1

    imp.status = "done"
    imp.completed_at = datetime.now(timezone.utc)
    db.commit()

    msg = f"Committed {added} players."
    if imp.mode == "reconcile":
        msg += f" Removed {removed} players not in import."
    return {"message": msg}
