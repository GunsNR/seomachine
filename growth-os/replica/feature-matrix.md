# Feature and capability matrix

The code registry is `src/lib/capabilities.ts` (shown in Settings → Capabilities). This page adds the provider view. Vendor facts come from `research/vendor-capabilities.md`: official pages retrieved 2026-11-03, each labelled Verified or Unverified there.

## Status words

| Status | Meaning |
| --- | --- |
| Implemented | Code exists; not exercised by a test |
| Tested with demo data | Automated tests or browser journeys pass on synthetic fixtures |
| Sandbox verified | Round trip with a provider sandbox, with evidence |
| Live verified | Authorized real round trip, with evidence |
| Manual fallback | A person does it; the app prepares it |
| Blocked | Needs something we don't have (account, review, approval) |
| Deferred | Out of the current milestone |

**Nothing is sandbox or live verified yet.**

## Integrations

| Platform | Operation | Requirement (per official docs) | Cost / quota | Status in Growth OS | Fallback | Next action |
| --- | --- | --- | --- | --- | --- | --- |
| ContentStudio | Publish to FB, IG, LinkedIn, TikTok, YouTube, GBP and more | API key; API plan or any paid plan | $15/mo API plan, 3,000 req/mo (quotas differ between two vendor pages) | Deferred | Dry-run adapter + manual hand-off | Approve plan purchase; then build `contentstudio` adapter behind `PublishAdapter` |
| Meta (FB Pages, IG) | Direct publish | App Review + Business Verification + Advanced Access for non-owned accounts; IG 100 posts/24h | Free | Blocked (review) | Via ContentStudio or manual | — |
| LinkedIn | Org posts | Vetted Community Management API | Free; dev tier 500 calls/24h | Blocked (partner vetting) | Via ContentStudio or manual | — |
| TikTok | Direct Post | Audit; unaudited = `SELF_ONLY`, ≤5 users/24h | Free | Blocked | Via provider or manual | — |
| YouTube | Upload | Vendor page says unverified projects are no longer private-locked (dated 2026-11-02) | 100 inserts/day default | Deferred | Manual | Re-verify the 1-day-old policy change before relying on it |
| Google Business Profile | Posts | Access application; profile verified 60+ days | Free | Deferred | Via ContentStudio or manual | — |
| WhatsApp | Templates / Status / Channels / Groups | Templates are paid per message; Status and Channels have no API | Per message | Manual fallback (Status/Channels), Deferred (templates) | Export + reminder | — |
| Search Console | Search Analytics, URL Inspection (read-only, no indexing API) | OAuth, property access | 2,000 inspections/day/site | Deferred | CSV import (not built) | Create OAuth client; grant read-only |
| GA4 | Data API reports | OAuth/service account | 200k tokens/property/day | Deferred | — | Same as GSC |
| Ahrefs | Enrichment | "Eligible paid plans" (wording conflicts) | Lite $129/mo listed | Deferred | Manual CSV with source + date | Confirm API eligibility in writing before buying |
| HighLevel | CRM sync | Basic API on Starter $97/mo; OAuth on Pro $497/mo | 100 req/10s, 200k/day | Not planned | Growth OS is the CRM | Only if a client already runs on HighLevel |
| Email / SMS sending | Follow-ups | Verified sending domain (SPF/DKIM/DMARC); provider onboarding | Unknown until chosen | Blocked | Drafts held with reason; copy and send by hand | Choose a provider; verify domain; approve live sending scope |
| Calendar | Bookings | OAuth | — | Manual fallback | Manual booking records | Pick Google Calendar or Cal.com |
| Anthropic | Drafting | API key; monthly cap | Opus 5.5 $4/$20, Haiku 5.5 $0.10/$0.50 per 1M tokens | Implemented, off | Templates | Approve a cap and a 20-draft evaluation |

## In-app capabilities

See Settings → Capabilities in the running app, or `src/lib/capabilities.ts`. The in-app table and this page must agree; change both in the same commit.
