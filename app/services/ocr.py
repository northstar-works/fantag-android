"""
OCR service — parses fantasy baseball roster screenshots.

Supports two providers, switched via OCR_PROVIDER in .env:
  OCR_PROVIDER=claude   → Anthropic Claude Vision (claude-opus-4-5)
  OCR_PROVIDER=openai   → OpenAI GPT-4o Vision

Both providers receive the same prompt and return the same structured JSON.
"""

import base64
import json
import re
from difflib import SequenceMatcher
from typing import Any

from sqlalchemy.orm import Session

from ..config import settings
from ..models import Player, ImportMatchType


# ─── Shared prompt ────────────────────────────────────────────────────────────

SYSTEM_PROMPT = """You are a sports data extraction assistant.
You will receive an image of a fantasy baseball roster screenshot (ESPN, Yahoo, FanDuel, etc.).
Extract every player visible and return ONLY a JSON array — no markdown, no commentary.

Each element must have these fields:
{
  "name": "Full player name as shown",
  "team": "Team abbreviation if visible, else null",
  "position": "Position abbreviation if visible, else null",
  "status": "IL / DTD / active / null",
  "stats": {}
}

If you cannot read a name confidently, include it anyway with your best guess."""

USER_TEXT = "Extract all fantasy roster players from this screenshot."


# ─── Provider: Claude ─────────────────────────────────────────────────────────

async def _ocr_claude(b64_image: str) -> str:
    import anthropic
    client = anthropic.Anthropic(api_key=settings.ANTHROPIC_API_KEY)
    response = client.messages.create(
        model="claude-opus-4-5",
        max_tokens=2048,
        system=SYSTEM_PROMPT,
        messages=[{
            "role": "user",
            "content": [
                {
                    "type": "image",
                    "source": {
                        "type": "base64",
                        "media_type": "image/png",
                        "data": b64_image,
                    },
                },
                {"type": "text", "text": USER_TEXT},
            ],
        }],
    )
    return response.content[0].text.strip()


# ─── Provider: OpenAI ─────────────────────────────────────────────────────────

async def _ocr_openai(b64_image: str) -> str:
    import httpx
    headers = {
        "Authorization": f"Bearer {settings.OPENAI_API_KEY}",
        "Content-Type": "application/json",
    }
    payload = {
        "model": settings.OPENAI_MODEL,
        "max_tokens": 2048,
        "messages": [
            {"role": "system", "content": SYSTEM_PROMPT},
            {
                "role": "user",
                "content": [
                    {
                        "type": "image_url",
                        "image_url": {
                            "url": f"data:image/png;base64,{b64_image}",
                            "detail": "high",
                        },
                    },
                    {"type": "text", "text": USER_TEXT},
                ],
            },
        ],
    }
    async with httpx.AsyncClient(timeout=60) as client:
        r = await client.post(
            "https://api.openai.com/v1/chat/completions",
            headers=headers,
            json=payload,
        )
        r.raise_for_status()
        data = r.json()
    return data["choices"][0]["message"]["content"].strip()


# ─── Main entry point ─────────────────────────────────────────────────────────

async def process_screenshot(
    image_bytes: bytes,
    db: Session,
) -> list[dict[str, Any]]:
    """
    Run OCR on a screenshot using the configured provider and return a list
    of import item dicts ready to insert as ScreenshotImportItem rows.
    """
    provider = settings.OCR_PROVIDER.lower()

    if provider == "openai":
        if not settings.OPENAI_API_KEY:
            raise RuntimeError("OPENAI_API_KEY not set in .env")
    else:
        if not settings.ANTHROPIC_API_KEY:
            raise RuntimeError("ANTHROPIC_API_KEY not set in .env")

    b64_image = base64.standard_b64encode(image_bytes).decode()

    if provider == "openai":
        raw_text = await _ocr_openai(b64_image)
    else:
        raw_text = await _ocr_claude(b64_image)

    # Strip accidental markdown fences
    raw_text = re.sub(r"^```[a-z]*\n?", "", raw_text)
    raw_text = re.sub(r"\n?```$", "", raw_text)

    try:
        parsed: list[dict] = json.loads(raw_text)
    except json.JSONDecodeError:
        match = re.search(r"\[.*\]", raw_text, re.DOTALL)
        if match:
            parsed = json.loads(match.group())
        else:
            raise ValueError(f"Provider returned non-JSON: {raw_text[:200]}")

    all_players = db.query(Player).filter(Player.active == True).all()
    return [_resolve_item(item, all_players) for item in parsed]


# ─── Fuzzy name resolution ────────────────────────────────────────────────────

def _resolve_item(
    item: dict,
    all_players: list[Player],
) -> dict[str, Any]:
    raw_name: str = item.get("name", "").strip()
    if not raw_name:
        return {
            "raw_name": "(empty)",
            "matched_player_id": None,
            "match_type": ImportMatchType.unresolved,
            "confidence": 0.0,
            "target_status": "roster",
            "extra_data": item,
        }

    raw_lower = raw_name.lower()
    best_player: Player | None = None
    best_score = 0.0

    for player in all_players:
        if player.name.lower() == raw_lower:
            return {
                "raw_name": raw_name,
                "matched_player_id": player.id,
                "match_type": ImportMatchType.exact,
                "confidence": 1.0,
                "target_status": "roster",
                "extra_data": {k: v for k, v in item.items() if k != "name"},
            }

        score = SequenceMatcher(None, raw_lower, player.name.lower()).ratio()

        parts = raw_lower.split()
        if parts:
            last_name = parts[-1]
            player_last = player.name.lower().split()[-1]
            last_score = SequenceMatcher(None, last_name, player_last).ratio()
            score = max(score, last_score * 0.85)

        if item.get("team") and player.team:
            if item["team"].upper() == player.team.upper():
                score = min(score * 1.1, 1.0)

        if score > best_score:
            best_score = score
            best_player = player

    if best_player is None or best_score < 0.5:
        return {
            "raw_name": raw_name,
            "matched_player_id": None,
            "match_type": ImportMatchType.unresolved,
            "confidence": round(best_score, 3),
            "target_status": "roster",
            "extra_data": item,
        }

    match_type = ImportMatchType.exact if best_score >= 0.95 else ImportMatchType.likely
    return {
        "raw_name": raw_name,
        "matched_player_id": best_player.id,
        "match_type": match_type,
        "confidence": round(best_score, 3),
        "target_status": "roster",
        "extra_data": {k: v for k, v in item.items() if k != "name"},
    }
