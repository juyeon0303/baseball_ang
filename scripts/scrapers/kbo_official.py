"""KBO 공식 기록 — pandas read_html, 하루 1회에 가장 적합."""

from __future__ import annotations

import logging
from typing import Any

import pandas as pd
import requests

from .common import DEFAULT_UA, TARGET_PLAYER

logger = logging.getLogger(__name__)

HITTER_BASIC_URL = (
    "https://www.koreabaseball.com/Record/Player/HitterBasic/Basic1.aspx"
)


def fetch_lee_jung_hoo_ops() -> dict[str, Any] | None:
    headers = {"User-Agent": DEFAULT_UA}
    html = requests.get(HITTER_BASIC_URL, headers=headers, timeout=60).text
    df = pd.read_html(html, header=0)[0]

    for _, row in df.iterrows():
        name = str(row.get("선수명", "")).strip()
        if TARGET_PLAYER not in name:
            continue
        hits = _int(row.get("H"))
        ab = _int(row.get("AB"))
        ops = _float(row.get("OPS"))
        return {
            "name": name,
            "team": row.get("팀명"),
            "hits": hits,
            "ab": ab,
            "ops": ops,
            "source": "kbo_official",
        }
    logger.warning("KBO 공식 기록에서 %s 를 찾지 못했습니다.", TARGET_PLAYER)
    return None


def _int(value: Any) -> int | None:
    if value is None or (isinstance(value, float) and pd.isna(value)):
        return None
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


def _float(value: Any) -> float | None:
    if value is None or (isinstance(value, float) and pd.isna(value)):
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None
