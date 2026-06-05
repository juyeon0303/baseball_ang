#!/usr/bin/env python3
"""
전 종목 실시간 오라클 동기화 — KBO 공식 상세 + MLB Stats API

  python scripts/live_oracle_sync.py
  python scripts/live_oracle_sync.py --kbo-only
"""

from __future__ import annotations

import argparse
import logging
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from scrapers.common import post_to_backend
from scrapers.kbo_detail import fetch_all_kbo_lineup
from scrapers.mlb_stats import fetch_lee_jung_hoo_ops

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
)
logger = logging.getLogger("live_oracle_sync")


def main() -> int:
    parser = argparse.ArgumentParser(description="야구주식 전 종목 오라클 동기화")
    parser.add_argument(
        "--kbo-only",
        action="store_true",
        help="KBO 10구단만 (이정후 MLB 제외)",
    )
    args = parser.parse_args()

    rows = fetch_all_kbo_lineup()
    if not args.kbo_only:
        mlb = fetch_lee_jung_hoo_ops()
        if mlb:
            rows.insert(0, mlb)

    if not rows:
        logger.error("수집된 행이 없습니다")
        return 1

    logger.info("수집 %d건 → 백엔드 ingest", len(rows))
    body = post_to_backend(rows)
    logger.info("반영 완료: %s", body.get("updatedPlayers"))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
