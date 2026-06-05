"""백엔드 market-lineup.ts 와 동일한 KBO/MLB 대표 선수 목록."""

from __future__ import annotations

from typing import Any, TypedDict


class RosterEntry(TypedDict, total=False):
    instrument_id: str
    player_name: str
    metric: str  # ops | era
    kbo_player_id: int
    mlb_player_id: int
    stats_source: str  # kbo | mlb


LINEUP: list[RosterEntry] = [
    {
        "instrument_id": "lee-jung-hoo",
        "player_name": "이정후",
        "metric": "ops",
        "mlb_player_id": 808982,
        "stats_source": "mlb",
    },
    {
        "instrument_id": "kiwoom-joo",
        "player_name": "이주형",
        "metric": "ops",
        "kbo_player_id": 50167,
        "stats_source": "kbo",
    },
    {
        "instrument_id": "kia-kim",
        "player_name": "김도영",
        "metric": "ops",
        "kbo_player_id": 52605,
        "stats_source": "kbo",
    },
    {
        "instrument_id": "lg-park",
        "player_name": "박동원",
        "metric": "ops",
        "kbo_player_id": 79365,
        "stats_source": "kbo",
    },
    {
        "instrument_id": "kt-choi",
        "player_name": "최원준",
        "metric": "ops",
        "kbo_player_id": 66606,
        "stats_source": "kbo",
    },
    {
        "instrument_id": "ssg-choi",
        "player_name": "최정",
        "metric": "ops",
        "kbo_player_id": 75847,
        "stats_source": "kbo",
    },
    {
        "instrument_id": "nc-lee",
        "player_name": "이우성",
        "metric": "ops",
        "kbo_player_id": 63260,
        "stats_source": "kbo",
    },
    {
        "instrument_id": "ds-yang",
        "player_name": "양의지",
        "metric": "ops",
        "kbo_player_id": 76232,
        "stats_source": "kbo",
    },
    {
        "instrument_id": "ss-koo",
        "player_name": "구자욱",
        "metric": "ops",
        "kbo_player_id": 62404,
        "stats_source": "kbo",
    },
    {
        "instrument_id": "lt-na",
        "player_name": "나승엽",
        "metric": "ops",
        "kbo_player_id": 51551,
        "stats_source": "kbo",
    },
    {
        "instrument_id": "hh-ryu",
        "player_name": "류현진",
        "metric": "era",
        "kbo_player_id": 76715,
        "stats_source": "kbo",
    },
]
