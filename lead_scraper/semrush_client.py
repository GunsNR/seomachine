"""
Semrush phrase_organic client.

Returns the organic SERP for a phrase in rank order. Semrush does not include
an explicit position column on this report, so position is the 1-based row
index of the returned list.
"""

import logging
from typing import Dict, List, Optional

import requests

from .config import (
    HTTP_TIMEOUT,
    SEMRUSH_DATABASE,
    SEMRUSH_DISPLAY_LIMIT,
    USER_AGENT,
    semrush_units_per_line,
)
from .usage import UsageMeter

logger = logging.getLogger(__name__)

API_URL = "https://api.semrush.com/"
EXPORT_COLUMNS = "Dn,Ur"


class SemrushClient:
    """Minimal Semrush Analytics API client for phrase_organic."""

    def __init__(self, api_key: str, meter: Optional[UsageMeter] = None) -> None:
        self.api_key = api_key
        self.meter = meter or UsageMeter()
        self.session = requests.Session()
        self.session.headers.update({"User-Agent": USER_AGENT})

    def phrase_organic(
        self,
        phrase: str,
        database: str = SEMRUSH_DATABASE,
        display_limit: int = SEMRUSH_DISPLAY_LIMIT,
    ) -> List[Dict[str, object]]:
        """
        Fetch organic results for a phrase.

        Returns a list of {"position": int, "domain": str, "url": str}.
        """
        params = {
            "type": "phrase_organic",
            "key": self.api_key,
            "phrase": phrase,
            "database": database,
            "display_limit": display_limit,
            "export_columns": EXPORT_COLUMNS,
        }
        try:
            response = self.session.get(API_URL, params=params, timeout=HTTP_TIMEOUT)
        except requests.RequestException as exc:
            logger.warning("Semrush request failed for %r: %s", phrase, exc)
            self.meter.record("semrush.phrase_organic", calls=1, units=0)
            return []

        self.meter.record("semrush.phrase_organic", calls=1, units=0)
        body = response.text.strip()

        if response.status_code != 200 or body.startswith("ERROR"):
            logger.warning(
                "Semrush error for %r (HTTP %s): %s", phrase, response.status_code, body[:200]
            )
            return []

        rows = parse_phrase_organic(body)
        # Semrush bills per returned line, not per request.
        self.meter.record(
            "semrush.phrase_organic", calls=0, units=len(rows) * semrush_units_per_line()
        )
        return rows


def parse_phrase_organic(body: str) -> List[Dict[str, object]]:
    """Parse the semicolon-delimited Semrush CSV body into ranked rows."""
    lines = [line for line in body.splitlines() if line.strip()]
    if len(lines) < 2:
        return []

    header = [col.strip().lower() for col in lines[0].split(";")]
    try:
        domain_idx = header.index("domain")
    except ValueError:
        return []
    url_idx = header.index("url") if "url" in header else None

    results = []
    for position, line in enumerate(lines[1:], start=1):
        fields = line.split(";")
        if domain_idx >= len(fields):
            continue
        domain = fields[domain_idx].strip()
        if not domain:
            continue
        url = fields[url_idx].strip() if url_idx is not None and url_idx < len(fields) else ""
        results.append({"position": position, "domain": domain, "url": url})
    return results
