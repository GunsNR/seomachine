"""
Google Places API (New) Text Search client.

Used to verify that a domain from the SERP belongs to a real local business,
and to pull the website, phone, review count and location count we qualify on.
"""

import logging
from typing import Dict, List, Optional

import requests

from .config import HTTP_TIMEOUT, USER_AGENT
from .domains import root_domain, same_root
from .usage import UsageMeter

logger = logging.getLogger(__name__)

TEXT_SEARCH_URL = "https://places.googleapis.com/v1/places:searchText"
FIELD_MASK = ",".join(
    [
        "places.id",
        "places.displayName",
        "places.formattedAddress",
        "places.websiteUri",
        "places.nationalPhoneNumber",
        "places.userRatingCount",
        "places.rating",
    ]
)


class PlacesClient:
    """Minimal Places Text Search client with request metering."""

    def __init__(self, api_key: str, meter: Optional[UsageMeter] = None) -> None:
        self.api_key = api_key
        self.meter = meter or UsageMeter()
        self.session = requests.Session()
        self.session.headers.update({"User-Agent": USER_AGENT})

    def text_search(self, query: str, max_results: int = 10) -> List[Dict[str, object]]:
        """Run a Text Search and return the raw place dicts."""
        headers = {
            "Content-Type": "application/json",
            "X-Goog-Api-Key": self.api_key,
            "X-Goog-FieldMask": FIELD_MASK,
        }
        payload = {"textQuery": query, "maxResultCount": max_results}
        try:
            response = self.session.post(
                TEXT_SEARCH_URL, json=payload, headers=headers, timeout=HTTP_TIMEOUT
            )
        except requests.RequestException as exc:
            logger.warning("Places request failed for %r: %s", query, exc)
            self.meter.record("places.text_search", calls=1, units=1)
            return []

        # Places bills per request (Text Search Pro SKU); 1 unit == 1 request.
        self.meter.record("places.text_search", calls=1, units=1)

        if response.status_code != 200:
            logger.warning(
                "Places error for %r (HTTP %s): %s", query, response.status_code, response.text[:200]
            )
            return []
        return response.json().get("places", []) or []

    def lookup_business(self, domain: str, city: str, state: str) -> Optional[Dict[str, object]]:
        """
        Find the Places record whose website matches this domain.

        Returns a dict with name/website/phone/reviews/locations, or None when
        no Places result actually belongs to the domain.
        """
        from .domains import business_name_from_domain

        name_seed = business_name_from_domain(domain) or domain
        query = f"{name_seed} {city} {state}".strip()
        places = self.text_search(query)

        matches = [
            place
            for place in places
            if place.get("websiteUri") and same_root(str(place["websiteUri"]), domain)
        ]
        if not matches:
            return None

        primary = max(matches, key=lambda p: int(p.get("userRatingCount") or 0))
        display = primary.get("displayName") or {}
        return {
            "name": (display.get("text") if isinstance(display, dict) else str(display)) or "",
            "website": str(primary.get("websiteUri") or ""),
            "phone": str(primary.get("nationalPhoneNumber") or ""),
            "reviews": int(primary.get("userRatingCount") or 0),
            "rating": primary.get("rating"),
            "address": str(primary.get("formattedAddress") or ""),
            # Distinct Places records sharing the domain == distinct locations.
            "locations": len({p.get("id") for p in matches if p.get("id")}) or len(matches),
            "root_domain": root_domain(domain),
        }


def qualifies(business: Dict[str, object], qualifier: Dict[str, int]) -> bool:
    """
    Apply the industry qualification rule.

    A website is always required. Then either the review floor is met, or —
    when the industry defines min_locations — the location count is met.
    """
    if not business or not business.get("website"):
        return False

    reviews = int(business.get("reviews") or 0)
    locations = int(business.get("locations") or 0)

    min_reviews = qualifier.get("min_reviews")
    min_locations = qualifier.get("min_locations")

    review_ok = min_reviews is not None and reviews >= min_reviews
    location_ok = min_locations is not None and locations >= min_locations
    return bool(review_ok or location_ok)
