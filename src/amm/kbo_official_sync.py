import logging
import time

import pandas as pd
import requests

logging.basicConfig(
    level=logging.INFO, format="%(asctime)s [%(levelname)s]: %(message)s"
)
logger = logging.getLogger(__name__)

KBO_HITTER_URL = (
    "https://www.koreabaseball.com/Record/Player/HitterBasic/Basic1.aspx"
)
INGEST_URL = "http://localhost:3000/amm/ingest-boxscore"
TARGET_NAME = "이정후"


def fetch_and_send():
    try:
        df = pd.read_html(KBO_HITTER_URL, header=0)[0]
        stats = []
        for _, row in df.iterrows():
            name = str(row.get("선수명", "")).strip()
            if TARGET_NAME not in name:
                continue
            hits = int(row["H"]) if pd.notna(row.get("H")) else 0
            ab = int(row["AB"]) if pd.notna(row.get("AB")) else 0
            ops = float(row["OPS"]) if pd.notna(row.get("OPS")) else None
            stats.append(
                {
                    "name": name,
                    "team": row.get("팀명"),
                    "hits": hits,
                    "ab": ab,
                    "ops": ops,
                }
            )
            break

        if not stats:
            logger.warning("이정후 행을 KBO 기록에서 찾지 못했습니다.")
            return

        response = requests.post(
            INGEST_URL, json={"dailyStats": stats}, timeout=30
        )
        if response.status_code in (200, 201):
            body = response.json()
            inst = body.get("instrument", {})
            logger.info(
                "동기화 완료 — OPS %.3f, 시장가 %s",
                inst.get("oracleOps"),
                inst.get("price"),
            )
        else:
            logger.error("전송 실패: %s %s", response.status_code, response.text)
    except Exception as e:
        logger.error("파이프라인 오류: %s", e)


if __name__ == "__main__":
    # 5분 폴링 대신 하루 1회는 scripts/daily_oracle_sync.py 사용 권장
    while True:
        fetch_and_send()
        time.sleep(300)
