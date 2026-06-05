"""STATIZ 시즌 타자 기록실 — 정적 HTML + BeautifulSoup (일 1회 권장)."""

from __future__ import annotations

import logging
import os
import re
from typing import Any

import requests
from bs4 import BeautifulSoup

from .common import DEFAULT_UA, TARGET_PLAYER

logger = logging.getLogger(__name__)

# 시즌만 바꿔 쓰면 됨 (re=0 타자, ye=ys=당해연도)
STATIZ_SEASON_URL = os.getenv(
    "STATIZ_SEASON_URL",
    "http://www.statiz.co.kr/stat.php?mid=stat&re=0&ys=2025&ye=2025&se=0&te=&tm=&ty=0&qu=auto&po=0&as=&ae=&hi=&un=&pl=&da=1&o1=OPS&o2=TPA&de=1&tr=&cv=&ml=1&sn=500&pa=0&si=&cn=&lr=1",
)


def fetch_lee_jung_hoo_ops() -> dict[str, Any] | None:
    headers = {"User-Agent": DEFAULT_UA}
    response = requests.get(STATIZ_SEASON_URL, headers=headers, timeout=60)
    response.raise_for_status()

    soup = BeautifulSoup(response.text, "html.parser")
    table = soup.find("table")
    if not table:
        logger.error("STATIZ: table 태그를 찾지 못했습니다.")
        return None

    headers_row = _header_cells(table)
    name_idx = _col_index(headers_row, ("이름", "선수"))
    ops_idx = _col_index(headers_row, ("OPS",))
    team_idx = _col_index(headers_row, ("팀", "소속"))

    if name_idx is None or ops_idx is None:
        logger.error("STATIZ: 이름/OPS 컬럼 인덱스를 찾지 못했습니다.")
        return None

    for tr in table.find_all("tr"):
        cells = [td.get_text(strip=True) for td in tr.find_all(["td", "th"])]
        if len(cells) <= max(name_idx, ops_idx):
            continue
        name = cells[name_idx]
        if TARGET_PLAYER not in name:
            continue
        ops = _parse_ops(cells[ops_idx])
        team = cells[team_idx] if team_idx is not None and team_idx < len(cells) else None
        return {
            "name": name,
            "team": team,
            "ops": ops,
            "source": "statiz",
        }

    logger.warning("STATIZ에서 %s 를 찾지 못했습니다.", TARGET_PLAYER)
    return None


def _header_cells(table) -> list[str]:
    for tr in table.find_all("tr"):
        cells = [th.get_text(strip=True) for th in tr.find_all("th")]
        if cells:
            return cells
        cells = [td.get_text(strip=True) for td in tr.find_all("td")]
        if cells and any(c in ("이름", "OPS", "순") for c in cells):
            return cells
    return []


def _col_index(headers: list[str], candidates: tuple[str, ...]) -> int | None:
    for i, h in enumerate(headers):
        for c in candidates:
            if c in h:
                return i
    return None


def _parse_ops(text: str) -> float | None:
    cleaned = text.replace(",", "").strip()
    match = re.search(r"(\d+\.\d+)", cleaned)
    if not match:
        return None
    return float(match.group(1))
