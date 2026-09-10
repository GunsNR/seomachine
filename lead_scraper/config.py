"""
Configuration for the lead scraper.

Secrets are never stored in code. Both keys are read from the environment,
which is populated from data_sources/config/.env at startup:

    SEMRUSH_KEY
    GOOGLE_PLACES_KEY
"""

import os
from pathlib import Path
from typing import Dict, List, Optional

try:  # python-dotenv is listed in data_sources/requirements.txt
    from dotenv import load_dotenv
except ImportError:  # pragma: no cover - keeps unit tests runnable without deps
    load_dotenv = None

REPO_ROOT = Path(__file__).resolve().parent.parent
ENV_PATH = REPO_ROOT / "data_sources" / "config" / ".env"

# Keyword templates per industry. {city} is substituted per metro row.
INDUSTRY_KEYWORDS: Dict[str, List[str]] = {
    "roofing": ["roofing company {city}", "roofer {city}"],
    "aba": ["aba therapy {city}"],
}

# Qualification thresholds per industry (applied to Google Places data).
INDUSTRY_QUALIFIERS: Dict[str, Dict[str, int]] = {
    # Roofing: a single established shop is fine, but needs review volume.
    "roofing": {"min_reviews": 20},
    # ABA: lower review floor, or multi-location operators regardless of reviews.
    "aba": {"min_reviews": 10, "min_locations": 2},
}

# Directories, aggregators and social platforms are never leads.
DIRECTORY_DOMAINS = {
    "yelp.com",
    "bbb.org",
    "angi.com",
    "angieslist.com",
    "homeadvisor.com",
    "facebook.com",
    "reddit.com",
    "youtube.com",
    "forbes.com",
    "psychologytoday.com",
}

FRANCHISE_BLOCKLIST_PATH = REPO_ROOT / "franchise_blocklist.txt"
METROS_PATH = REPO_ROOT / "metros.csv"
DEFAULT_OUTPUT_PATH = REPO_ROOT / "output" / "leads.csv"

# Semrush organic results are returned in rank order; we keep page 3-4 only.
TARGET_POSITION_MIN = 21
TARGET_POSITION_MAX = 40
SEMRUSH_DISPLAY_LIMIT = 40
SEMRUSH_DATABASE = "us"

# Hard cap on leads emitted per industry.
MAX_LEADS_PER_INDUSTRY = 200

# ASSUMPTION (verify against your plan): Semrush bills phrase_organic at
# 10 API units per returned line. Override with SEMRUSH_UNITS_PER_LINE if your
# contract differs. Reported usage is an estimate, not a billing statement.
SEMRUSH_UNITS_PER_LINE = int(os.getenv("SEMRUSH_UNITS_PER_LINE", "10"))

HTTP_TIMEOUT = 15
USER_AGENT = "SEOMachineLeadScraper/1.0 (+https://github.com/GunsNR/seomachine)"


def load_env(env_path: Optional[Path] = None) -> None:
    """Load .env without overriding variables already set in the environment."""
    path = env_path or ENV_PATH
    if load_dotenv is None:
        raise ImportError(
            "python-dotenv is required: pip install -r data_sources/requirements.txt"
        )
    if path.exists():
        load_dotenv(path, override=False)


def get_key(name: str) -> str:
    """Read a required API key from the environment."""
    value = os.getenv(name, "").strip()
    if not value:
        raise ValueError(
            f"{name} is not set. Add it to {ENV_PATH} or export it before running."
        )
    return value


def load_franchise_blocklist(path: Optional[Path] = None) -> set:
    """Load blocked franchise/national domains. Blank lines and # comments ignored."""
    target = path or FRANCHISE_BLOCKLIST_PATH
    if not target.exists():
        return set()
    blocked = set()
    for line in target.read_text(encoding="utf-8").splitlines():
        entry = line.split("#", 1)[0].strip().lower()
        if entry:
            blocked.add(entry.lstrip("*."))
    return blocked
