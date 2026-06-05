#!/usr/bin/env python3
"""
하루 1회 오라클(OPS) 동기화 — KBO 공식 / STATIZ / 네이버 스포츠

사용 예:
  python scripts/daily_oracle_sync.py --source kbo
  python scripts/daily_oracle_sync.py --source statiz
  python scripts/daily_oracle_sync.py --source naver
  python scripts/daily_oracle_sync.py --source kbo --force   # 월요일에도 실행

Windows 작업 스케줄러 / cron (화~일 09:00):
  0 9 * * 2-7 cd /path/to/baseball-backend && python scripts/daily_oracle_sync.py --source kbo
"""

from __future__ import annotations

import argparse
import logging
import sys
from pathlib import Path

# scripts/ 패키지 import
sys.path.insert(0, str(Path(__file__).resolve().parent))

from scrapers.common import post_to_backend, should_run_today
from scrapers import kbo_official, naver_sports, statiz

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
)
logger = logging.getLogger("daily_oracle_sync")

FETCHERS = {
    "kbo": kbo_official.fetch_lee_jung_hoo_ops,
    "statiz": statiz.fetch_lee_jung_hoo_ops,
    "naver": naver_sports.fetch_lee_jung_hoo_ops,
}


def main() -> int:
    parser = argparse.ArgumentParser(description="야구주식 일일 OPS 오라클 동기화")
    parser.add_argument(
        "--source",
        choices=list(FETCHERS.keys()),
        default="kbo",
        help="데이터 출처 (MVP 권장: kbo)",
    )
    parser.add_argument(
        "--force",
        action="store_true",
        help="월요일 스킵 무시",
    )
    args = parser.parse_args()

    if not args.force and not should_run_today(skip_monday=True):
        logger.info("월요일 — 경기 없음, 동기화 생략 (--force 로 강제 실행 가능)")
        return 0

    fetch = FETCHERS[args.source]
    logger.info("수집 시작: source=%s", args.source)
    row = fetch()
    if not row:
        logger.error("수집 실패")
        return 1

    logger.info("수집 결과: %s", row)
    body = post_to_backend([row])
    inst = body.get("instrument", {})
    logger.info(
        "백엔드 반영 — OPS %.3f, 시장가 %s, updated=%s",
        inst.get("oracleOps"),
        inst.get("price"),
        inst.get("updatedAt"),
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
