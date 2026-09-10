"""
Lead pipeline.

Per metro and industry:
  1. Semrush phrase_organic (db=us, display_limit=40) for each keyword.
  2. Keep domains ranking 21-40; drop any domain that also ranks 1-20 for the
     same keyword; drop directories and blocked franchises.
  3. Google Places lookup; keep only businesses that pass the industry rule.
  4. Fetch homepage / contact / about for an on-domain mailto: address.
  5. Dedupe by root domain, cap at MAX_LEADS_PER_INDUSTRY, write leads.csv.
"""

import csv
import logging
import math
from pathlib import Path
from typing import Dict, Iterable, List, Optional, Set

from .config import (
    DIRECTORY_DOMAINS,
    INDUSTRY_KEYWORDS,
    INDUSTRY_QUALIFIERS,
    MAX_LEADS_PER_INDUSTRY,
    SEMRUSH_DATABASE,
    SEMRUSH_DISPLAY_LIMIT,
    TARGET_POSITION_MAX,
    TARGET_POSITION_MIN,
    load_franchise_blocklist,
)
from .domains import is_blocked, root_domain
from .email_extractor import EmailFinder
from .places_client import PlacesClient, qualifies
from .semrush_client import SemrushClient
from .usage import UsageMeter

logger = logging.getLogger(__name__)

CSV_COLUMNS = [
    "company",
    "contact_name",
    "email",
    "phone",
    "website",
    "city",
    "state",
    "industry",
    "main_keyword",
    "current_google_page",
    "why_they_qualify",
]


def read_metros(path: Path) -> List[Dict[str, str]]:
    """Read metros.csv (city,state) into a list of dicts."""
    metros = []
    with open(path, newline="", encoding="utf-8") as handle:
        for row in csv.DictReader(handle):
            city = (row.get("city") or "").strip()
            state = (row.get("state") or "").strip()
            if city and state:
                metros.append({"city": city, "state": state})
    return metros


def google_page(position: int) -> int:
    """Convert a 1-based SERP position into a Google page number (10 per page)."""
    return max(1, math.ceil(position / 10))


def select_candidates(rows: Iterable[Dict[str, object]], franchises: Set[str]) -> List[Dict[str, object]]:
    """
    Keep page 3-4 domains that do not also hold a page 1-2 spot for this keyword.

    Directory and franchise domains are dropped. The best (lowest) position in
    the 21-40 band wins when a domain appears more than once.
    """
    ranked = list(rows)
    top_roots = {
        root_domain(str(row["domain"]))
        for row in ranked
        if int(row["position"]) < TARGET_POSITION_MIN
    }

    selected: Dict[str, Dict[str, object]] = {}
    for row in ranked:
        position = int(row["position"])
        if not TARGET_POSITION_MIN <= position <= TARGET_POSITION_MAX:
            continue
        domain = str(row["domain"])
        root = root_domain(domain)
        if not root or root in top_roots:
            continue
        if is_blocked(domain, DIRECTORY_DOMAINS, franchises):
            continue
        if root not in selected or position < int(selected[root]["position"]):
            selected[root] = {"domain": root, "position": position, "url": row.get("url", "")}
    return sorted(selected.values(), key=lambda item: int(item["position"]))


def build_reason(business: Dict[str, object], industry: str, keyword: str, position: int) -> str:
    """Human-readable qualification note for the sales rep."""
    parts = [
        f"Ranks #{position} (page {google_page(position)}) for '{keyword}'",
        f"{int(business.get('reviews') or 0)} Google reviews",
    ]
    locations = int(business.get("locations") or 0)
    if locations > 1:
        parts.append(f"{locations} locations")
    rating = business.get("rating")
    if rating:
        parts.append(f"{rating} star rating")
    parts.append(f"meets {industry} threshold")
    return "; ".join(parts)


class LeadPipeline:
    """Orchestrates Semrush -> Places -> email extraction for all metros."""

    def __init__(
        self,
        semrush: SemrushClient,
        places: PlacesClient,
        emails: EmailFinder,
        meter: UsageMeter,
        franchises: Optional[Set[str]] = None,
        max_per_industry: int = MAX_LEADS_PER_INDUSTRY,
    ) -> None:
        self.semrush = semrush
        self.places = places
        self.emails = emails
        self.meter = meter
        self.franchises = franchises if franchises is not None else load_franchise_blocklist()
        self.max_per_industry = max_per_industry

    def run(self, metros: List[Dict[str, str]], industries: Optional[List[str]] = None) -> List[Dict[str, str]]:
        targets = industries or list(INDUSTRY_KEYWORDS)
        leads: List[Dict[str, str]] = []

        for industry in targets:
            keywords = INDUSTRY_KEYWORDS.get(industry)
            if not keywords:
                logger.warning("Unknown industry %r, skipping", industry)
                continue
            qualifier = INDUSTRY_QUALIFIERS.get(industry, {})
            seen_roots: Set[str] = set()
            industry_leads = 0

            for metro in metros:
                if industry_leads >= self.max_per_industry:
                    logger.info("Reached %s lead cap for %s", self.max_per_industry, industry)
                    break
                city, state = metro["city"], metro["state"]

                for template in keywords:
                    if industry_leads >= self.max_per_industry:
                        break
                    keyword = template.format(city=city)
                    rows = self.semrush.phrase_organic(
                        keyword, database=SEMRUSH_DATABASE, display_limit=SEMRUSH_DISPLAY_LIMIT
                    )
                    candidates = select_candidates(rows, self.franchises)
                    logger.info(
                        "%s | %s, %s | '%s': %d results, %d page 3-4 candidates",
                        industry, city, state, keyword, len(rows), len(candidates),
                    )

                    for candidate in candidates:
                        if industry_leads >= self.max_per_industry:
                            break
                        domain = str(candidate["domain"])
                        if domain in seen_roots:
                            continue
                        seen_roots.add(domain)

                        business = self.places.lookup_business(domain, city, state)
                        if not business or not qualifies(business, qualifier):
                            continue

                        website = str(business["website"])
                        lead = {
                            "company": business["name"],
                            "contact_name": "",  # never guessed
                            "email": self.emails.find_email(website),
                            "phone": business["phone"],
                            "website": website,
                            "city": city,
                            "state": state,
                            "industry": industry,
                            "main_keyword": keyword,
                            "current_google_page": str(google_page(int(candidate["position"]))),
                            "why_they_qualify": build_reason(
                                business, industry, keyword, int(candidate["position"])
                            ),
                        }
                        leads.append(lead)
                        industry_leads += 1

            logger.info("%s: %d qualified leads", industry, industry_leads)
        return leads


def write_leads(leads: List[Dict[str, str]], output_path: Path) -> Path:
    """Write leads.csv with the fixed column order."""
    output_path.parent.mkdir(parents=True, exist_ok=True)
    with open(output_path, "w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=CSV_COLUMNS)
        writer.writeheader()
        for lead in leads:
            writer.writerow({column: lead.get(column, "") for column in CSV_COLUMNS})
    return output_path
