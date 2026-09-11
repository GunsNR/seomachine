# Lead Scraper

Finds local businesses stuck on Google **page 3-4** (positions 21-40) for
service keywords — visible enough to be real operators, weak enough to need
help — verifies them against Google Places, and pulls a contact email from
their own site.

## Setup

```bash
pip install -r data_sources/requirements.txt
```

Add to `data_sources/config/.env` (never commit real keys):

```
SEMRUSH_KEY=your_semrush_api_key
GOOGLE_PLACES_KEY=your_google_places_api_key
```

## Run

```bash
python3 scrape_leads.py                                   # all industries, metros.csv
python3 scrape_leads.py --industries roofing --limit 50
python3 scrape_leads.py --metros my_metros.csv --output output/roofing_leads.csv
```

## Inputs

| File | Contents |
| --- | --- |
| `metros.csv` | `city,state` rows |
| `franchise_blocklist.txt` | One root domain per line; `#` comments allowed |

Industry keyword templates live in `lead_scraper/config.py`:

- `roofing` → `roofing company {city}`, `roofer {city}`
- `aba` → `aba therapy {city}`

## Filter chain

1. **Semrush** `phrase_organic`, `database=us`, `display_limit=40`.
2. Keep domains at **positions 21-40**; drop any domain that also holds a
   position 1-20 for the same keyword; drop directories (yelp, bbb, angi,
   homeadvisor, facebook, reddit, youtube, forbes, psychologytoday) and every
   domain in `franchise_blocklist.txt`.
3. **Google Places** Text Search by business name derived from the domain.
   A Places record only counts when its `websiteUri` matches the same root
   domain. Qualification: website required, **and** roofing ≥ 20 reviews;
   aba ≥ 10 reviews **or** ≥ 2 locations.
4. Fetch homepage, `/contact`, `/about` and extract `mailto:` addresses **on
   the business's own root domain only**. Patterns are never guessed;
   `noreply@` is skipped; no email found leaves the field blank.
5. Dedupe by root domain, cap at 200 leads per industry, write `leads.csv`.

`contact_name` is always blank — no source in this pipeline provides it
reliably, and guessing it would poison outreach.

## Output

`output/leads.csv`:

`company, contact_name, email, phone, website, city, state, industry,
main_keyword, current_google_page, why_they_qualify`

## API usage

Every step is metered and printed at the end of a run:

```
API usage by step:
  places.text_search: 118 calls, 118 units
  semrush.phrase_organic: 12 calls, 4800 units
  web.page_fetch: 96 calls, 0 units
  TOTAL: 226 calls, 4918 units
```

Semrush units are an **estimate**: `lines_returned x SEMRUSH_UNITS_PER_LINE`
(default 10, override via env). Places units are counted as 1 per request
(Text Search Pro SKU). Confirm both against your own billing before relying
on the totals.

## Tests

```bash
python3 -m unittest tests.test_lead_scraper -v
```
