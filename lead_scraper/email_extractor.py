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
from urllib.parse import unquote, urlparse

import requests

from .config import HTTP_TIMEOUT, USER_AGENT
from .domains import root_domain
from .usage import UsageMeter

logger = logging.getLogger(__name__)

PAGE_PATHS = ["/", "/contact", "/about"]
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


def candidate_urls(website: str) -> List[str]:
    """
    Pages to check for a contact address.

    Contact paths are resolved against the site origin, so a Places website
    such as https://example.com/locations/denver still yields
    https://example.com/contact rather than .../denver/contact.
    """
    raw = website if website.startswith(("http://", "https://")) else f"https://{website}"
    parsed = urlparse(raw)
    if not parsed.hostname:
        return []
    origin = f"{parsed.scheme}://{parsed.netloc}"

    urls: List[str] = []
    # A location-specific landing page is the likeliest place for a local email.
    if parsed.path and parsed.path.strip("/"):
        urls.append(origin + "/" + parsed.path.strip("/"))
    for path in PAGE_PATHS:
        url = origin + path
        if url not in urls:
            urls.append(url)
    return urls


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

        Pages are tried in order and the search stops at the first hit. When
        the Places website has its own path (a location page, say), that page
        is tried first, then the origin-level homepage/contact/about.
        """
        for url in candidate_urls(website):
            emails = extract_mailto_emails(self._fetch(url), website)
            if emails:
                return emails[0]
        return ""
