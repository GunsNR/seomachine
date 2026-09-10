"""Unit tests for the lead scraper. No network calls."""

import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from lead_scraper.domains import is_blocked, root_domain, same_root
from lead_scraper.email_extractor import extract_mailto_emails
from lead_scraper.pipeline import (
    CSV_COLUMNS,
    LeadPipeline,
    build_reason,
    google_page,
    select_candidates,
    write_leads,
)
from lead_scraper.places_client import qualifies
from lead_scraper.semrush_client import parse_phrase_organic
from lead_scraper.usage import UsageMeter


class RootDomainTests(unittest.TestCase):
    def test_strips_scheme_www_and_path(self):
        self.assertEqual(root_domain("https://www.acme-roofing.com/contact"), "acme-roofing.com")

    def test_collapses_subdomains(self):
        self.assertEqual(root_domain("denver.blog.acme.com"), "acme.com")

    def test_handles_multi_label_suffix(self):
        self.assertEqual(root_domain("shop.example.co.uk"), "example.co.uk")

    def test_same_root_matches_across_subdomains(self):
        self.assertTrue(same_root("http://www.acme.com/x", "acme.com"))
        self.assertFalse(same_root("acme.com", "acmeroofing.com"))

    def test_directories_and_franchises_blocked(self):
        self.assertTrue(is_blocked("https://www.yelp.com/biz/x", {"yelp.com"}, set()))
        self.assertTrue(is_blocked("denver.bigfranchise.com", set(), {"bigfranchise.com"}))
        self.assertFalse(is_blocked("localroofer.com", {"yelp.com"}, {"bigfranchise.com"}))


class SemrushParseTests(unittest.TestCase):
    def test_position_is_row_order(self):
        body = "Domain;Url\na.com;https://a.com\nb.com;https://b.com"
        rows = parse_phrase_organic(body)
        self.assertEqual([r["position"] for r in rows], [1, 2])
        self.assertEqual(rows[1]["domain"], "b.com")

    def test_empty_or_error_body(self):
        self.assertEqual(parse_phrase_organic(""), [])
        self.assertEqual(parse_phrase_organic("Domain;Url"), [])


class CandidateSelectionTests(unittest.TestCase):
    def rows(self):
        return [
            {"position": 4, "domain": "acme.com", "url": ""},
            {"position": 22, "domain": "www.acme.com", "url": ""},
            {"position": 23, "domain": "yelp.com", "url": ""},
            {"position": 24, "domain": "bigfranchise.com", "url": ""},
            {"position": 26, "domain": "goodroof.com", "url": ""},
            {"position": 33, "domain": "goodroof.com", "url": ""},
            {"position": 35, "domain": "otherroof.com", "url": ""},
        ]

    def test_keeps_only_page_three_and_four(self):
        picked = {c["domain"] for c in select_candidates(self.rows(), {"bigfranchise.com"})}
        self.assertEqual(picked, {"goodroof.com", "otherroof.com"})

    def test_drops_domain_that_also_ranks_top_twenty(self):
        picked = [c["domain"] for c in select_candidates(self.rows(), set())]
        self.assertNotIn("acme.com", picked)

    def test_keeps_best_position_per_domain(self):
        best = {c["domain"]: c["position"] for c in select_candidates(self.rows(), set())}
        self.assertEqual(best["goodroof.com"], 26)

    def test_google_page_mapping(self):
        self.assertEqual((google_page(21), google_page(30), google_page(31), google_page(40)), (3, 3, 4, 4))


class QualificationTests(unittest.TestCase):
    def test_roofing_requires_reviews(self):
        rule = {"min_reviews": 20}
        self.assertTrue(qualifies({"website": "a.com", "reviews": 20, "locations": 1}, rule))
        self.assertFalse(qualifies({"website": "a.com", "reviews": 19, "locations": 3}, rule))

    def test_aba_accepts_reviews_or_locations(self):
        rule = {"min_reviews": 10, "min_locations": 2}
        self.assertTrue(qualifies({"website": "a.com", "reviews": 10, "locations": 1}, rule))
        self.assertTrue(qualifies({"website": "a.com", "reviews": 2, "locations": 2}, rule))
        self.assertFalse(qualifies({"website": "a.com", "reviews": 2, "locations": 1}, rule))

    def test_website_is_mandatory(self):
        self.assertFalse(qualifies({"website": "", "reviews": 500, "locations": 9}, {"min_reviews": 1}))


class EmailExtractionTests(unittest.TestCase):
    def test_keeps_on_domain_mailto_only(self):
        html = (
            '<a href="mailto:Info%40acme.com">a</a>'
            '<a href="mailto:someone@gmail.com">b</a>'
            '<a href="mailto:noreply@acme.com">c</a>'
        )
        self.assertEqual(extract_mailto_emails(html, "https://www.acme.com"), ["info@acme.com"])

    def test_plain_text_addresses_are_never_harvested(self):
        self.assertEqual(extract_mailto_emails("Email us at office@acme.com", "acme.com"), [])

    def test_no_mailto_returns_empty(self):
        self.assertEqual(extract_mailto_emails("<p>call us</p>", "acme.com"), [])


class FakeSemrush:
    def __init__(self, rows_by_keyword):
        self.rows_by_keyword = rows_by_keyword
        self.calls = []

    def phrase_organic(self, phrase, database="us", display_limit=40):
        self.calls.append(phrase)
        return self.rows_by_keyword.get(phrase, [])


class FakePlaces:
    def __init__(self, businesses):
        self.businesses = businesses

    def lookup_business(self, domain, city, state):
        return self.businesses.get(domain)


class FakeEmails:
    def find_email(self, website):
        return "info@" + root_domain(website)


class PipelineTests(unittest.TestCase):
    def build(self, max_per_industry=200):
        rows = [
            {"position": 22, "domain": "roofa.com", "url": ""},
            {"position": 24, "domain": "roofb.com", "url": ""},
        ]
        semrush = FakeSemrush({
            "roofing company Denver": rows,
            "roofer Denver": [{"position": 25, "domain": "roofa.com", "url": ""}],
        })
        places = FakePlaces({
            "roofa.com": {"name": "Roof A", "website": "https://roofa.com", "phone": "303-555-0100",
                          "reviews": 40, "rating": 4.8, "locations": 1, "address": "Denver"},
            "roofb.com": {"name": "Roof B", "website": "https://roofb.com", "phone": "",
                          "reviews": 5, "rating": 4.1, "locations": 1, "address": "Denver"},
        })
        return LeadPipeline(semrush, places, FakeEmails(), UsageMeter(), set(), max_per_industry)

    def test_dedupes_and_filters_unqualified(self):
        leads = self.build().run([{"city": "Denver", "state": "CO"}], ["roofing"])
        self.assertEqual(len(leads), 1)
        self.assertEqual(leads[0]["company"], "Roof A")
        self.assertEqual(leads[0]["current_google_page"], "3")
        self.assertEqual(leads[0]["contact_name"], "")

    def test_respects_per_industry_cap(self):
        pipeline = self.build(max_per_industry=0)
        self.assertEqual(pipeline.run([{"city": "Denver", "state": "CO"}], ["roofing"]), [])

    def test_csv_written_with_expected_columns(self):
        import tempfile

        leads = self.build().run([{"city": "Denver", "state": "CO"}], ["roofing"])
        with tempfile.TemporaryDirectory() as tmp:
            path = write_leads(leads, Path(tmp) / "leads.csv")
            header = path.read_text(encoding="utf-8").splitlines()[0]
        self.assertEqual(header.split(","), CSV_COLUMNS)

    def test_reason_mentions_keyword_and_page(self):
        reason = build_reason({"reviews": 40, "locations": 2, "rating": 4.8}, "roofing", "roofer Denver", 24)
        self.assertIn("page 3", reason)
        self.assertIn("roofer Denver", reason)
        self.assertIn("2 locations", reason)


class UsageMeterTests(unittest.TestCase):
    def test_accumulates_per_step(self):
        meter = UsageMeter()
        meter.record("semrush.phrase_organic", calls=1, units=400)
        meter.record("places.text_search", calls=3, units=3)
        self.assertEqual(meter.total_units(), 403)
        self.assertTrue(any("places.text_search: 3 calls" in line for line in meter.report_lines()))


if __name__ == "__main__":
    unittest.main()
