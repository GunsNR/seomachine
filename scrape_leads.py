#!/usr/bin/env python3
"""
Local-business lead scraper.

Finds businesses ranking on Google page 3-4 (positions 21-40) for local
service keywords, verifies them against Google Places, and extracts a contact
email from their own site.

Usage:
    python3 scrape_leads.py
    python3 scrape_leads.py --industries roofing --metros metros.csv --limit 50

Requires SEMRUSH_KEY and GOOGLE_PLACES_KEY in data_sources/config/.env.
"""

import argparse
import logging
import sys
from pathlib import Path

from lead_scraper.config import (
    DEFAULT_OUTPUT_PATH,
    INDUSTRY_KEYWORDS,
    MAX_LEADS_PER_INDUSTRY,
    METROS_PATH,
    get_key,
    load_env,
    load_franchise_blocklist,
)
from lead_scraper.email_extractor import EmailFinder
from lead_scraper.pipeline import LeadPipeline, read_metros, write_leads
from lead_scraper.places_client import PlacesClient
from lead_scraper.semrush_client import SemrushClient
from lead_scraper.usage import UsageMeter

logger = logging.getLogger("scrape_leads")


def parse_args(argv=None):
    parser = argparse.ArgumentParser(description="Scrape page 3-4 local business leads")
    parser.add_argument("--metros", type=Path, default=METROS_PATH, help="CSV with city,state columns")
    parser.add_argument(
        "--industries",
        nargs="+",
        choices=sorted(INDUSTRY_KEYWORDS),
        default=sorted(INDUSTRY_KEYWORDS),
        help="Industries to scrape",
    )
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT_PATH, help="Output CSV path")
    parser.add_argument(
        "--limit", type=int, default=MAX_LEADS_PER_INDUSTRY, help="Max leads per industry"
    )
    parser.add_argument("--verbose", action="store_true", help="Debug logging")
    return parser.parse_args(argv)


def main(argv=None) -> int:
    args = parse_args(argv)
    logging.basicConfig(
        level=logging.DEBUG if args.verbose else logging.INFO,
        format="%(levelname)s %(message)s",
    )

    load_env()
    try:
        semrush_key = get_key("SEMRUSH_KEY")
        places_key = get_key("GOOGLE_PLACES_KEY")
    except ValueError as exc:
        logger.error(str(exc))
        return 1

    if not args.metros.exists():
        logger.error("Metros file not found: %s", args.metros)
        return 1

    metros = read_metros(args.metros)
    if not metros:
        logger.error("No city,state rows found in %s", args.metros)
        return 1

    meter = UsageMeter()
    pipeline = LeadPipeline(
        semrush=SemrushClient(semrush_key, meter),
        places=PlacesClient(places_key, meter),
        emails=EmailFinder(meter),
        meter=meter,
        franchises=load_franchise_blocklist(),
        max_per_industry=args.limit,
    )

    logger.info("Scraping %d metros across %s", len(metros), ", ".join(args.industries))
    leads = pipeline.run(metros, args.industries)
    output = write_leads(leads, args.output)

    logger.info("Wrote %d leads to %s", len(leads), output)
    meter.log_report()
    return 0


if __name__ == "__main__":
    sys.exit(main())
