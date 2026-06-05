import logging
import os
from datetime import datetime
from typing import Any

import requests

logger = logging.getLogger(__name__)

DEFAULT_UA = (
    "Mozilla/5.0 (compatible; BaseballStockBot/0.1; +https://github.com/local)"
)

INGEST_URL = os.getenv("INGEST_URL", "http://localhost:3000/amm/ingest-boxscore")
TARGET_PLAYER = os.getenv("TARGET_PLAYER", "이정후")


def should_run_today(skip_monday: bool = True) -> bool:
    """월요일은 경기 없음 → 오라클 갱신 생략 가능."""
    if not skip_monday:
        return True
    return datetime.now().weekday() != 0


def post_to_backend(stats: list[dict[str, Any]]) -> dict[str, Any]:
    response = requests.post(
        INGEST_URL,
        json={"dailyStats": stats},
        timeout=60,
        headers={"User-Agent": DEFAULT_UA},
    )
    response.raise_for_status()
    return response.json()


def find_row_by_name(rows: list[dict[str, Any]], name: str) -> dict[str, Any] | None:
    for row in rows:
        row_name = str(row.get("name") or row.get("선수명") or "").strip()
        if name in row_name:
            return row
    return None
