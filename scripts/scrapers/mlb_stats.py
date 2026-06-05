"""MLB Stats API — 이정후 시즌 OPS."""

from __future__ import annotations

import os
from datetime import datetime
from typing import Any

import requests

from .common import DEFAULT_UA

MLB_STATS_URL = "https://statsapi.mlb.com/api/v1/people/{player_id}/stats"


def fetch_lee_jung_hoo_ops(
    mlb_player_id: int | None = None,
    season: int | None = None,
) -> dict[str, Any] | None:
    player_id = mlb_player_id or int(os.getenv("MLB_LEE_PLAYER_ID", "808982"))
    year = season or datetime.now().year
    url = MLB_STATS_URL.format(player_id=player_id)
    params = {"stats": "season", "group": "hitting", "season": year}
    response = requests.get(
        url,
        params=params,
        headers={"User-Agent": DEFAULT_UA},
        timeout=30,
    )
    response.raise_for_status()
    data = response.json()
    stat = data.get("stats", [{}])[0].get("splits", [{}])[0].get("stat", {})
    ops_raw = stat.get("ops")
    if not ops_raw:
        return None
    return {
        "name": "이정후",
        "instrumentId": "lee-jung-hoo",
        "ops": float(ops_raw),
        "avg": stat.get("avg"),
        "team": "San Francisco Giants",
        "source": "mlb_statsapi",
    }
