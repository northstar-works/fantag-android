from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from typing import List, Optional

from ..database import get_db
from ..models import Player
from ..schemas import PlayerOut, PlayerCreate

router = APIRouter(prefix="/players", tags=["players"])


@router.get("/search", response_model=List[PlayerOut])
def search_players(
    q: Optional[str] = Query(None, min_length=2, description="Name or team substring"),
    position: Optional[str] = Query(None, description="Position filter, e.g. 'SS'"),
    team: Optional[str] = Query(None, description="Team abbreviation, e.g. 'NYY'"),
    limit: int = Query(20, le=50),
    db: Session = Depends(get_db),
):
    """Search the MLB player DB. Used by the Add Player modal."""
    query = db.query(Player).filter(Player.active == True)

    if q:
        query = query.filter(Player.name.ilike(f"%{q}%"))
    if team:
        query = query.filter(Player.team.ilike(f"%{team}%"))
    if position:
        # positions is a JSON array — SQLite JSON_EACH approach
        # For simplicity use LIKE on the JSON serialisation
        query = query.filter(Player.positions.cast(db.bind.dialect.STRINGTYPE
                             if hasattr(db.bind.dialect, 'STRINGTYPE') else
                             __import__('sqlalchemy').String)
                             .ilike(f'%"{position}"%'))

    return query.order_by(Player.name).limit(limit).all()


@router.get("/{player_id}", response_model=PlayerOut)
def get_player(player_id: int, db: Session = Depends(get_db)):
    player = db.query(Player).filter(Player.id == player_id).first()
    if not player:
        raise HTTPException(404, "Player not found")
    return player


@router.post("/", response_model=PlayerOut, status_code=201,
             summary="Internal — used by the MLB poller, not the UI directly")
def upsert_player(payload: PlayerCreate, db: Session = Depends(get_db)):
    """Create or update a player by mlb_id."""
    existing = db.query(Player).filter(Player.mlb_id == payload.mlb_id).first()
    if existing:
        for k, v in payload.model_dump().items():
            setattr(existing, k, v)
        db.commit()
        db.refresh(existing)
        return existing

    player = Player(**payload.model_dump())
    db.add(player)
    db.commit()
    db.refresh(player)
    return player
