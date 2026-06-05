"""KBO 공식 선수 상세 페이지 — 시즌 OPS/ERA (서버 TS 로직과 동일)."""

from __future__ import annotations

import re
from typing import Any

import requests

from .common import DEFAULT_UA

KBO_HITTER_DETAIL = (
    "https://www.koreabaseball.com/Record/Player/HitterDetail/Basic.aspx"
)
KBO_PITCHER_DETAIL = (
    "https://www.koreabaseball.com/Record/Player/PitcherDetail/Basic.aspx"
)


def _tables(html: str) -> list[str]:
    return re.findall(r"<table[\s\S]*?</table>", html, flags=re.I)


def _th_labels(table: str) -> list[str]:
    return [
        re.sub(r"<[^>]+>", "", m).strip()
        for m in re.findall(r"<th[^>]*>([\s\S]*?)</th>", table, flags=re.I)
    ]


def _first_row_cells(table: str) -> list[str] | None:
    body = re.search(r"<tbody>[\s\S]*?</tbody>", table, flags=re.I)
    if not body:
        return None
    row = re.search(r"<tr>[\s\S]*?</tr>", body.group(0), flags=re.I)
    if not row:
        return None
    return [
        m.strip()
        for m in re.findall(r"<td[^>]*>([^<]*)", row.group(0), flags=re.I)
    ]


def _parse_ops(html: str) -> float | None:
    for table in _tables(html):
        if "출루율+장타율" not in table or "최근 10경기" in table:
            continue
        labels = _th_labels(table)
        if "OPS" not in labels:
            continue
        idx = labels.index("OPS")
        cells = _first_row_cells(table)
        if cells and len(cells) > idx:
            try:
                return float(cells[idx])
            except ValueError:
                return None
    return None


def _parse_era(html: str) -> float | None:
    for table in _tables(html):
        if ("평균자책" not in table and ">ERA<" not in table) or "최근 10경기" in table:
            continue
        labels = _th_labels(table)
        if "ERA" not in labels:
            continue
        idx = labels.index("ERA")
        cells = _first_row_cells(table)
        if cells and len(cells) > idx:
            try:
                return float(cells[idx])
            except ValueError:
                return None
    return None


def fetch_player_stat(
    *,
    kbo_player_id: int,
    metric: str,
) -> dict[str, Any] | None:
    headers = {"User-Agent": DEFAULT_UA}
    if metric == "era":
        url = f"{KBO_PITCHER_DETAIL}?playerId={kbo_player_id}"
        parse = _parse_era
        key = "era"
    else:
        url = f"{KBO_HITTER_DETAIL}?playerId={kbo_player_id}"
        parse = _parse_ops
        key = "ops"

    response = requests.get(url, headers=headers, timeout=60)
    response.raise_for_status()
    value = parse(response.text)
    if value is None:
        return None
    team_m = re.search(
        r"<th>(KIA|KT|LG|NC|SSG|두산|롯데|삼성|한화|키움)</th>",
        response.text,
    )
    return {
        key: value,
        "team": team_m.group(1) if team_m else None,
        "source": "kbo_official",
        "playerId": kbo_player_id,
    }


def fetch_all_kbo_lineup() -> list[dict[str, Any]]:
    from .lineup_roster import LINEUP

    rows: list[dict[str, Any]] = []
    for entry in LINEUP:
        if entry.get("stats_source") != "kbo":
            continue
        pid = entry.get("kbo_player_id")
        if not pid:
            continue
        stat = fetch_player_stat(kbo_player_id=pid, metric=entry["metric"])
        if not stat:
            continue
        row: dict[str, Any] = {
            "name": entry["player_name"],
            "instrumentId": entry["instrument_id"],
            "team": stat.get("team"),
        }
        if entry["metric"] == "era":
            row["era"] = stat["era"]
        else:
            row["ops"] = stat["ops"]
        rows.append(row)
    return rows
