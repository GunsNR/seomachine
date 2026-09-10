"""
Contact email extraction.

Rules, deliberately strict:
  * Only mailto: links are read. Nothing is inferred from page text patterns.
  * The email domain must match the business's own root domain.
  * No pattern guessing (info@, firstname.lastname@, ...). No email -> blank.
"""

import logging
import re
from typing import List, Optional
from urllib.parse import unquote, urljoin

import requests

from .config import HTTP_TIMEOUT, USER_AGENT
from .domains import root_domain
from .usage import UsageMeter

logger = logging.getLogger(__name__)

PAGE_PATHS = ["", "/contact", "/about"]
MAILTO_RE = re.compile(r"""mailto:\s*([^"'?\s>&]+)""", re.IGNORECASE)
EMAIL_RE = re.compile(r"^[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}$")

# Shared mailbox names that belong to a platform, not the business.
SKIP_LOCAL_PARTS = {"noreply", "no-reply", "donotreply"}


def extract_mailto_emails(html: str, business_domain: str) -> List[str]:
    """Return unique mailto: addresses on the business's own root domain."""
    if not html:
        return []
    business_root = root_domain(business_domain)
    if not business_root:
        return []

    found: List[str] = []
    for raw in MAILTO_RE.findall(html):
        candidate = unquote(raw).strip().strip(".,;:").lower()
        if not EMAIL_RE.match(candidate):
            continue
        local, _, host = candidate.partition("@")
        if local in SKIP_LOCAL_PARTS:
            continue
        if root_domain(host) != business_root:
            continue
        if candidate not in found:
            found.append(candidate)
    return found


class EmailFinder:
    """Fetches homepage, /contact and /about and harvests mailto: addresses."""

    def __init__(self, meter: Optional[UsageMeter] = None) -> None:
        self.meter = meter or UsageMeter()
        self.session = requests.Session()
        self.session.headers.update({"User-Agent": USER_AGENT})

    def _fetch(self, url: str) -> str:
        try:
            response = self.session.get(url, timeout=HTTP_TIMEOUT, allow_redirects=True)
        except requests.RequestException as exc:
            logger.debug("Fetch failed for %s: %s", url, exc)
            self.meter.record("web.page_fetch", calls=1, units=0)
            return ""
        self.meter.record("web.page_fetch", calls=1, units=0)
        if response.status_code != 200:
            return ""
        if "html" not in response.headers.get("Content-Type", "").lower():
            return ""
        return response.text

    def find_email(self, website: str) -> str:
        """
        Return the first on-domain mailto: address found, else an empty string.

        Pages are tried in order and the search stops at the first hit.
        """
        base = website if website.startswith(("http://", "https://")) else f"https://{website}"
        for path in PAGE_PATHS:
            url = urljoin(base if base.endswith("/") else base + "/", path.lstrip("/"))
            emails = extract_mailto_emails(self._fetch(url), website)
            if emails:
                return emails[0]
        return ""
