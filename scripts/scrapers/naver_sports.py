"""네이버 스포츠 KBO — 페이지가 JS 렌더면 Playwright, 아니면 requests+BS4."""

from __future__ import annotations

import logging
import os
import re
from typing import Any

import requests
from bs4 import BeautifulSoup

from .common import DEFAULT_UA, TARGET_PLAYER

logger = logging.getLogger(__name__)

# 시즌/탭 URL은 네이버 UI 변경 시 수정 필요
NAVER_KBO_RECORD_URL = os.getenv(
    "NAVER_KBO_RECORD_URL",
    "https://m.sports.naver.com/kbaseball/record/kbo",
)


def fetch_lee_jung_hoo_ops() -> dict[str, Any] | None:
    use_playwright = os.getenv("NAVER_USE_PLAYWRIGHT", "").lower() in (
        "1",
        "true",
        "yes",
    )
    if use_playwright:
        return _fetch_with_playwright()
    return _fetch_with_requests()


def _fetch_with_requests() -> dict[str, Any] | None:
    headers = {"User-Agent": DEFAULT_UA}
    response = requests.get(NAVER_KBO_RECORD_URL, headers=headers, timeout=60)
    response.raise_for_status()
    return _parse_html(response.text)


def _fetch_with_playwright() -> dict[str, Any] | None:
    try:
        from playwright.sync_api import sync_playwright
    except ImportError as e:
        raise RuntimeError(
            "Playwright 필요: pip install playwright && playwright install chromium"
        ) from e

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page(user_agent=DEFAULT_UA)
        page.goto(NAVER_KBO_RECORD_URL, wait_until="networkidle", timeout=90_000)
        html = page.content()
        browser.close()
    return _parse_html(html)


def _parse_html(html: str) -> dict[str, Any] | None:
    soup = BeautifulSoup(html, "html.parser")
    # 네이버는 마크업이 자주 바뀜 → 테이블/리스트에서 이름+OPS 패턴 탐색
    text_blocks = soup.find_all(string=re.compile(TARGET_PLAYER))
    for block in text_blocks:
        parent = block.find_parent(["tr", "li", "div"])
        if not parent:
            continue
        chunk = parent.get_text(" ", strip=True)
        if TARGET_PLAYER not in chunk:
            continue
        ops_match = re.search(r"OPS\s*([0-9]\.[0-9]{3})", chunk, re.I)
        if not ops_match:
            ops_match = re.search(r"([0-9]\.[0-9]{3})", chunk)
        if ops_match:
            return {
                "name": TARGET_PLAYER,
                "ops": float(ops_match.group(1)),
                "source": "naver_sports",
            }
    logger.warning(
        "네이버: %s 행을 찾지 못했습니다. NAVER_USE_PLAYWRIGHT=1 시도를 권장합니다.",
        TARGET_PLAYER,
    )
    return None
