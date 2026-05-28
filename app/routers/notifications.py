from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session, joinedload
from typing import List

from ..database import get_db
from ..models import PlayerNotification, FantasyRosterEntry
from ..schemas import NotificationCreate, NotificationOut, MessageOut

router = APIRouter(prefix="/notifications", tags=["notifications"])

VALID_RULE_TYPES = {
    "status_change",        # any status change
    "lineup_confirmed",     # player confirmed in today's lineup
    "lineup_scratch",       # player scratched after being in lineup
    "pattern_change",       # pattern label changed
    "batting_order_drop",   # batting order drops N spots
    "il_placed",            # placed on IL
    "il_returned",          # activated from IL
}


@router.get("/", response_model=List[NotificationOut])
def list_notifications(db: Session = Depends(get_db)):
    return (
        db.query(PlayerNotification)
        .options(joinedload(PlayerNotification.player))
        .order_by(PlayerNotification.created_at.desc())
        .all()
    )


@router.post("/", response_model=NotificationOut, status_code=201)
def create_notification(payload: NotificationCreate, db: Session = Depends(get_db)):
    if payload.rule_type not in VALID_RULE_TYPES:
        raise HTTPException(400, f"Invalid rule_type. Valid: {sorted(VALID_RULE_TYPES)}")

    # Player must be on roster or watch list
    entry = (
        db.query(FantasyRosterEntry)
        .filter(FantasyRosterEntry.player_id == payload.player_id)
        .first()
    )
    if not entry:
        raise HTTPException(400, "Player is not on your roster or watch list")

    notification = PlayerNotification(**payload.model_dump())
    db.add(notification)
    db.commit()
    db.refresh(notification)
    return notification


@router.patch("/{notification_id}/toggle", response_model=NotificationOut)
def toggle_notification(notification_id: int, db: Session = Depends(get_db)):
    n = db.query(PlayerNotification).filter(PlayerNotification.id == notification_id).first()
    if not n:
        raise HTTPException(404, "Notification not found")
    n.enabled = not n.enabled
    db.commit()
    db.refresh(n)
    return n


@router.delete("/{notification_id}", response_model=MessageOut)
def delete_notification(notification_id: int, db: Session = Depends(get_db)):
    n = db.query(PlayerNotification).filter(PlayerNotification.id == notification_id).first()
    if not n:
        raise HTTPException(404, "Notification not found")
    db.delete(n)
    db.commit()
    return {"message": "Deleted"}
