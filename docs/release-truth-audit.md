# Release truth audit — Rank Logic SuperTool

**Baseline commit:** `82c171b0c13a09cbfa5ff77a42f27cf43ab7cdba`
**Gate:** 1 (trustworthy measurement) — supersedes the Gate 0 audit below
**Last verified against source:** 2026-08-23
**Owner:** product-owner

This document and `supertool/src/lib/capabilities.ts` are the same statement in
two forms. The registry is the machine-readable one and drives what pricing and
plan copy are allowed to say; this file is the human-readable one and carries
the reasoning. `supertool/tests/capabilities.test.ts` fails the build if they
disagree, so neither can drift without the other noticing.

**This product is not market-ready.** It is a working prototype with real,
tested internals and a large amount of unvalidated surface area. Gates 1–5 —
measurement validity, production data and security, the pilot product, pilot
evidence, and the controlled-improvement control plane — have not been started.
Nothing below should be read as a claim that a capability is ready for a paying
customer.

---

## How to read the status column

| Status | Meaning |
| --- | --- |
| `verified` | Implemented, covered by automated tests, and exercised against the real external dependency it needs — or it has none. |
| `beta` | Implemented and tested in-repo, but never validated against the live third-party system it depends on. |
| `demo_only` | Exists and can be demonstrated with sample data, but must not be relied on as a measurement of anything real. |
| `unavailable` | Not usable today. Several of these were advertised before this pass and have now been withdrawn. |
| `planned` | Intended, not started. |

Only `verified` and `beta` may appear in a plan, a price, or any public claim.
`planFeatureLabel()` throws for anything else, so an unshippable feature cannot
reach a pricing table by accident.

---

## Capability matrix

### Sellable today

| Capability | Status | Actual source / data | User-visible label | Test evidence | External validation | Permitted marketing language |
| --- | --- | --- | --- | --- | --- | --- |
| `measurement_foundation` | `beta` | Immutable `MeasurementRun` and `Observation` records. Rates computed inside one run by run id, never by date; failed/unavailable excluded from rate denominators and reported as coverage; 95% Wilson interval on every binary rate; run-to-run spread reported separately. | Run-scoped measurement with confidence intervals | `tests/measurement-stats.test.ts`, `tests/measurement-run.test.ts` | The arithmetic and run lifecycle are unit- and database-tested. They have never operated on a live provider response, because no engine is measurable. | "Every figure is tied to a specific run, states how much of that run produced data, and carries a confidence interval rather than a bare percentage." |
| `site_audit` | `verified` | SuperTool crawls the URL you give it and applies a fixed 25-rule set to what it fetches. | Site audit | `tests/crawler.integration.test.ts`, `tests/scoring.test.ts` | None required — the audit reads only the site under test. | "Crawls your pages and reports technical, on-page, schema and answer-readiness issues with a fix for each." |
| `geo_scoring` | `beta` | A nine-signal heuristic over page text. Weights were chosen by hand. | Answer-readiness scoring | `tests/scoring.test.ts` | **No held-out dataset, no outcome data.** The score is not known to predict citations or anything else. | "Grades a draft against nine structural signals and names what to change. It is a heuristic, not a prediction of citations." |
| `content_briefs` | `beta` | Generated from the project keyword set and prompt set. | Content briefs | `tests/brief.test.ts` | Not benchmarked against live SERP data — no SERP provider is connected. | "Produces an outline, target questions and a word-count target for a page you plan to write." |
| `keyword_research` | `beta` | DataForSEO volume and CPC when credentials are configured; an in-product model otherwise. Difficulty is *always* partly modelled. | Keyword research | `tests/keyword-data.test.ts`, `tests/keywords.test.ts`, `tests/estimate.test.ts` | The DataForSEO adapter has never been run against the live API from this environment. | "Volume and CPC from DataForSEO when you connect it, clearly labelled estimates when you do not." |
| `csv_export` | `verified` | Your own stored rows, written out unchanged. | CSV and JSON export | `tests/csv.test.ts` | None required. | "Export every project — prompts, checks, keywords, audits and articles — as CSV or JSON at any time." |
| `scheduled_runs` | `beta` | A cron endpoint that works out which projects are due and runs their prompt sets. | Scheduled runs | CI boot check in `.github/workflows/supertool.yml` | Single process, no durable queue, no retry, no partial-run persistence. A crash mid-run loses the run (Gate 1). | "Re-runs your prompt set on a schedule so you have a trend rather than a snapshot." |
| `wordpress_publishing` | `beta` | WordPress core REST API with an application password, posting native block markup. | WordPress publishing | `tests/wordpress.test.ts`, `tests/wordpress.integration.test.ts` — both against a **stubbed** API | **Never executed against a real WordPress installation.** No PHPUnit suite, no plugin activation test (Gate 3). | "Publishes drafts to WordPress as native blocks through the REST API. Validated against a stubbed API, not yet against a live site." |
| `elementor_widgets` | `beta` | Six template JSON files and free-tier widget registration in the plugin. | Elementor templates | CI JSON validation | **Never imported into, or rendered by, a real Elementor installation.** Compatibility is inferred from file format only. | "Ships Elementor templates and widgets. Not yet verified against a live Elementor install." |
| `public_api` | `beta` | Hashed per-project keys authenticating the `/api/v1` endpoints the WordPress plugin uses. | Project API keys | `tests/crypto.test.ts` | Keys have no scopes, no per-key quota and no rotation flow (Gate 2). | "Issue a per-project API key so the WordPress plugin — or your own scripts — can read your data." |
| `billing` | `beta` | Stripe Checkout and Billing Portal, idempotent webhook handling. | Subscriptions and billing | `tests/billing.test.ts` | **Never run against a real Stripe account, not even in test mode.** | "Subscriptions are handled by Stripe Checkout." |
| `transactional_email` | `beta` | Resend or SMTP, whichever is configured. | Transactional email | `tests/email.test.ts`, `tests/password-reset.test.ts` | No message has been delivered through a real provider from this environment. | "Sends password resets and account email through your configured provider." |

### Not sellable — shown in-product with an explicit limitation

| Capability | Status | Actual source / data | User-visible label | Test evidence | External validation | Permitted marketing language |
| --- | --- | --- | --- | --- | --- | --- |
| `lead_attribution` | `demo_only` | A public endpoint the WordPress plugin calls with a **caller-supplied** referrer. Forgeable by anyone, matched by substring rather than parsed hostname, and records an anonymous visit rather than a verified lead. | Referral events (renamed from "Leads") | None — there is no test asserting the events are trustworthy, because they are not. | The chain from an assistant answer to a real conversion has never been demonstrated end to end. | **Not sold.** Shown only with a standing in-product notice, and never described as leads. |

### Withdrawn in Gate 1 — pipeline built, no trustworthy source

The Gate 1 provider audit applied three tests to every answer engine: a compliant
public API, an adapter that **actually enables web retrieval**, and a model
**confirmed against the vendor's own current documentation**. Any one failing
forces `unavailable`.

The decisive finding was the second test. Four of five adapters make a plain
completion call with no web-search tool. Asking an ungrounded model "which SEO
tool is best" measures what it absorbed during training months earlier — not
what a search returns today. Reporting that as *AI search visibility* is a real
number about the wrong thing, the same category of error as answering Google AI
Mode with Gemini.

| Capability | Status | Actual source / data | User-visible label | Test evidence | External validation | Permitted marketing language |
| --- | --- | --- | --- | --- | --- | --- |
| `ai_visibility_tracking` | `unavailable` | Adapters exist for five vendors and the Gate 1 pipeline is complete, but no engine passes the audit. | "No answer engine is currently measurable" panel | `tests/provider-audit.test.ts` | None. No credential exercised; vendor documentation unreachable from the build environment. | "Not available. The measurement pipeline is built and tested, but no answer engine currently meets the bar for a trustworthy measurement." |
| `citation_monitoring` | `unavailable` | An ungrounded adapter returns no citations at all, so a citation rate against it would be zero for reasons unrelated to the brand. | Not offered | `tests/provider-audit.test.ts` | Never validated against real citation payloads. | "Not available. Citation evidence requires a grounded answer engine." |
| `competitor_share_of_voice` | `unavailable` | Depends on observed answers, and none can be observed. | Not offered | `tests/ai.test.ts` | Never validated against real answers. | "Not available. Depends on observed answers." |

#### Per-engine audit result

| Engine | API | Grounding requested | Docs verified | Verdict |
| --- | --- | --- | --- | --- |
| ChatGPT | official | **no** — plain `/v1/chat/completions`, no `web_search` tool | no | unavailable; also pinned to a preview model identifier |
| Claude | official | **no** — `/v1/messages` with no `tools` array | no | unavailable; would return zero citations by construction |
| Gemini | official | **no** — `generateContent` with no `google_search` tool | no | unavailable; parses `groundingMetadata` that can never populate |
| Grok | official | **no** — no live-search parameters | no | unavailable |
| Perplexity | official | yes — Sonar retrieves intrinsically | no | unavailable **on documentation grounds only** |
| Google AI Mode | none | n/a | n/a | unavailable; no public API |

**Why documentation could not be verified:** every official vendor documentation
domain (`platform.openai.com`, `developers.openai.com`, `docs.anthropic.com`,
`ai.google.dev`, `docs.x.ai`, `docs.perplexity.ai`) is blocked by this
environment's network egress proxy. Third-party summaries and model recollection
were deliberately **not** substituted — that would be exactly the unsourced claim
Gate 0 removed from this product.

**What unblocks each engine:** wire the vendor's web-retrieval tool into the
adapter, then verify the model identifier against the vendor's own docs from an
environment with egress, then record the source URL and check date in
`engines.ts`. Availability is derived from those facts, so it flips
automatically — it cannot be hand-set.

### Withdrawn earlier — previously advertised, does not exist

| Capability | Status | Actual source / data | User-visible label | Test evidence | External validation | Permitted marketing language |
| --- | --- | --- | --- | --- | --- | --- |
| `rank_tracking` | `unavailable` | No SERP provider integration. The only ranking rows anywhere are seeded demo data. | "Rank tracking is not available" panel | `tests/provenance.test.ts` | n/a — the capability does not exist. | "Not available. SuperTool does not track search positions today." |
| `backlink_tracking` | `unavailable` | No backlink provider, no crawl index. Existing rows are seeded demo data. | "Backlink data is not available" panel | `tests/provenance.test.ts` | n/a | "Not available. SuperTool has no backlink index and no provider integration." |
| `content_generation` | `unavailable` | Nothing writes article body copy. Briefs and scoring exist; drafting does not. | — (claim removed) | No route or library generates article text. | n/a | "Not available. SuperTool briefs and scores content; it does not write it." |
| `google_ai_mode` | `unavailable` | No official API, no compliant third-party source. **Previously answered by the Gemini developer API** — a different surface with different retrieval. That mapping has been removed, not relabelled. | Listed as Unavailable in Settings, with the reason | `tests/provenance.test.ts` | n/a | "Not available. Google AI Mode cannot be measured compliantly today, so SuperTool does not claim to measure it." |
| `google_search_console` | `planned` | None. | — | None. | Not started. | "Not available." |
| `google_analytics` | `planned` | None. | — | None. | Not started. | "Not available." |
| `local_device_tracking` | `planned` | None. Runs carry no locale, city or device dimension at all. | — | None. | Not started. | "Not available." |
| `approval_workflow` | `planned` | None. Publishing goes straight from the dashboard to WordPress with no review step. | — | None. | Not started. | "Not available." |
| `teams_rbac` | `planned` | `Membership` rows carry a `role` column, but no code reads it, there is no invitation flow, and every member has full access. | — | None. | Not started. | "Not available. Roles exist in the schema but are not enforced." |
| `white_label_reporting` | `planned` | None. | — | None. | Not started. | "Not available." |
| `byo_provider_keys` | `planned` | Provider credentials are read from deployment environment variables only. There is no per-tenant credential store. | — | None. | Not started. | "Not available." |

---

## Proof and claims removed in this pass

Everything below was present in the product and was **invented**. It was
deleted rather than rewritten, because there is nothing real to replace it
with yet.

| Removed | Where it lived | Why |
| --- | --- | --- |
| Four named testimonials with roles and companies | `TESTIMONIALS` in `src/content/site.ts`, `Testimonials.tsx` | No customers exist. The people and companies were fictional. |
| Three case results (`+312%`, `4.2x`, `-63%`) with client descriptions | `RESULTS` in `src/content/site.ts`, `Results.tsx` | No engagements exist. The figures were invented. |
| `aggregateRating` of 4.9 from 384 reviews, emitted as JSON-LD on the home and pricing pages | `softwareApplicationSchema()` | No reviews exist. Fabricated review markup is a Google structured-data policy violation as well as a false statement to the reader. |
| Five trust badges: Google Premier Partner, Microsoft Advertising Select, Inc. 5000 2025, G2 High Performer, SOC 2 Type II | `TRUST_BADGES`, site footer | No partnership, award, listing or audit has taken place. SOC 2 in particular asserts a completed third-party audit. |
| "41% average citation lift — first 90 days across onboarded sites" | `STATS` | No onboarded sites, no measurement. |
| "1,200+ pages scored daily" | `STATS` | Not measured, and not true of any deployment. |
| "Half your buyers now ask an assistant before they ever open a search results page" | Hero | Unsourced statistic presented as fact. |
| "5-minute WordPress setup" (hero, home page, WordPress docs) | Hero, home, docs | The plugin has never been installed on a live WordPress site from this codebase. |
| "Rewrites typically move citation rate within two to six weeks" | Multiple feature pages | No outcome data links a scored rewrite to a later citation. |
| "Above 85 puts you in the band where citation rate reliably improves" | Content feature page | The GEO score has never been validated against any outcome. |
| "All 6 answer engines" on every plan | `PRICING`, pricing comparison table | Only five surfaces are measurable, and only those with a configured credential. |
| White-label reporting, multi-seat workspaces, per-client API keys, bring-your-own provider keys | Scale plan, agencies solution page, FAQs | None is implemented. |
| Lead attribution as a sold feature | Growth/Scale plans, attribution feature page | The underlying telemetry is forgeable and records visits, not leads. |
| Search Console and GA4 integration claims | Keywords feature page, in-house solution page, recover-traffic FAQ | Neither integration exists. |
| "Import historical Search Console data to backfill sixteen months" | Recover-traffic solution page | No import exists. |
| Whole pages: `/platform/rank-tracking`, `/platform/attribution`, `/solutions/agencies`, `/solutions/scale-content` | `src/content/platform.ts` | Each page existed solely to sell a capability that does not exist. Removed rather than reduced to a placeholder. |
| Placeholder postal address and phone number emitted as `Organization` structured data | `organizationSchema()` | Publishing placeholder contact details as structured data asserts a real-world business location that does not exist. Now gated on `brand.identityVerified`. |

---

## Containment: how demo data is kept out of real workspaces

1. **Schema.** `Organization.dataMode` and `Project.dataMode` are `live` by
   default. Only the seed script writes `demo`.
2. **Provider layer.** `ask()` takes an explicit `mode`. `demo` always
   simulates and never touches a provider endpoint; `live` never simulates,
   whatever goes wrong. The two paths are mutually exclusive.
3. **Row level.** `AiCheck.status` is one of `live | simulated | failed |
   unavailable`, alongside `errorCategory`, `errorDetail`, `model` and
   `latencyMs`. A failed or unavailable row carries no metrics.
4. **Aggregation.** Every rate is computed over *observed* rows only. A failed
   call is a hole in coverage, never a zero — the previous behaviour would have
   reported a provider outage as a collapse in brand visibility.
5. **Presentation.** `summarizeProvenance()` labels a set `live` only when
   every row is a successful live call. A mixed set is `mixed` and is flagged
   as unusable. Coverage is shown next to every headline number, and the
   `/api/v1` widget endpoint returns the same provenance so an embedded score
   on a customer's website cannot render demo data as live.
6. **Free tool.** With no engine connected, `/api/tools/ai-check` returns 503
   and says so, rather than producing a simulated baseline a visitor cannot
   distinguish from a real one.

---

## Known defects fixed in this pass

| Defect | Fix |
| --- | --- |
| "Google AI Mode" dispatched to the Gemini developer API using `SERP_API_KEY`, and its output was stored and scored as AI Mode data. | Surface marked `unavailable`; the Gemini mapping removed; never called, never simulated, excluded from every score. |
| A failed live provider call silently returned simulated text with the error tucked into a string field. | Four explicit statuses; a failure is stored as `failed` with a categorised reason and no answer. |
| A missing credential silently produced simulated data in a real workspace. | Recorded as `unavailable`; simulation requires `mode: 'demo'`. |
| A run was called "simulated" only when *every* row was simulated, so one live result could hide five simulated ones. | A set is `live` only when every row is live; any mixture is reported as such. |
| `/api/contact` wrote every public enquiry into `project.findFirst()` — the oldest project in the database — as a `Lead`. | Enquiries now go to a tenant-neutral `ContactInquiry` model that touches no customer data, behind a rate limit. |
| Keyword rows carried one row-level `dataSource` even though volume, CPC and difficulty have different provenance, and blended paid competition was labelled organic difficulty. | Per-field `volumeSource`, `difficultySource`, `cpcSource` and `dataProvider`; difficulty is labelled `blended` whenever a provider is involved. |
| Rank and backlink screens rendered seeded demo rows, or empty tables that read as "you have no backlinks". | Both are gated on a provider that does not exist; a live workspace sees an explicit unavailable panel with the reason. |
| Traffic and monetary forecasts were shown with false precision and no label. | Shown as approximations, explicitly labelled modelled, and `null` (not zero) when no position exists to forecast from. |
| Provider error strings could carry a credential into stored data and logs. | `redact()` strips `?key=` parameters and common key prefixes before any error is stored or logged. |

---

## What Gate 0 did *not* fix

These are real and remain open. They are Gate 1–3 work and are listed here so
nobody mistakes this pass for a clean bill of health.

- `ChatGPT` is still pinned to the retired `gpt-4o-search-preview` model.
- No adapter enables its provider's current grounded web-search tool.
- Stored observations still lack a run ID, prompt version, locale, token usage
  and cost. Runs are still grouped by UTC date, so two runs on one day merge.
- The simulator is still seeded by day, so repeated same-day demo runs are
  identical.
- The composite visibility score still uses unvalidated fixed weights and
  exposes no uncertainty. It is labelled a convenience index in the UI, but it
  has not been removed or replaced.
- No repeated sampling, no confidence intervals, no minimum-sample rule.
- Legal documents are drafts and are marked as requiring counsel review. **No
  compliance claim is made or implied.**

## Closed in Phase 2

Each of these was listed above as open after Gate 0. Each now has a named
regression test; none was closed by relaxing an expectation.

| Was | Now | Test |
| --- | --- | --- |
| SQLite with `db push` and no migration history | PostgreSQL with a reviewed migration history; CI runs `migrate deploy` plus a drift check | `.github/workflows/supertool.yml` |
| No durable queue, retry, partial-run persistence or distributed lock | `Job` table with atomic claim, expiring leases, classified retry with jittered backoff, cancellation, dead-letter; `JobLock` for recurring sweeps | `tests/jobs.test.ts` |
| SSRF guard did not resolve DNS; redirects were not revalidated | Every resolved address checked; the socket pinned to the checked address; every redirect hop revalidated and re-pinned; credentials stripped on cross-origin redirect | `tests/net-fetch.test.ts`, `tests/net-pinned.test.ts` |
| Rate limiting per process, keyed on a spoofable header | Shared counter table; client identity derived from an explicit trusted-proxy count | `tests/client-ip.test.ts` |
| Password changes did not revoke other sessions | Server-side `Session` rows; logout, password change and reset all revoke | `tests/sessions.test.ts` |
| Membership roles not enforced | Four roles enforced per route, with a structural test that no mutating route is unguarded | `tests/rbac.test.ts` |
| API keys had no scopes or quotas | Scoped, revocable, expiring, daily-quota'd | `tests/apikey-scopes.test.ts` |
| API keys had no rotation flow, so a leaked key could only be revoked — breaking the integration at the moment the leak was found | Rotation issues a replacement immediately and puts the predecessor on a 24-hour overlap it cannot outlive; the pair shares one daily budget, and concurrent rotations resolve to exactly one successor | `tests/apikey-rotation.test.ts` |
| Quota admission read the counter, decided, then wrote it back, so simultaneous requests were each admitted against the same count | One row per tenant-scoped group per UTC day, incremented by a single statement that enforces the limit inside itself; a refused request spends nothing and a new day is a new row | `tests/apikey-quota.test.ts` |
| Quota groups were inferred from an empty-string sentinel, so a misread would have pooled every key in the database into one budget | Every key carries a required, non-empty group and a tenant column; the migration backfills each pre-existing key to its own id, and the lookup constrains on tenant as well as group | `tests/apikey-rotation.test.ts` |
| `/api/v1` had wildcard CORS | Explicit allowlist from connected sites plus configuration; `Vary: Origin` | `tests/api-auth.test.ts` |
| `past_due` fully entitled indefinitely | Bounded grace window, stamped from the Stripe transition | `tests/billing.test.ts` |
| Health endpoint exposed configuration detail publicly | Minimal public shape; detail behind a token | `tests/health.test.ts` |
| Referral endpoint accepted a caller-supplied engine | Engine always derived; evidence provenance recorded; unverified attribution never counted as measured | `tests/lead-attribution.test.ts` |
| Provider errors could carry a credential into logs | Redaction at the logging boundary and on job error text | `tests/observability.test.ts` |

**Quota admission is atomic.** The daily counter was read and then written in
separate statements, with no atomic increment and no row lock, so simultaneous
requests could each read the same count and each be admitted. It now lives in
`ApiQuotaCounter`, one row per tenant-scoped key group per UTC day, and
admission is a single `INSERT … ON CONFLICT DO UPDATE` whose `WHERE` clause
carries the limit: at the limit the update is skipped, the statement returns no
rows, and the refusal *is* the fact that nothing was spent. Concurrent callers
serialize on the unique index. Measured against the previous implementation,
twelve simultaneous requests against a limit of three were all admitted; the
same test now admits exactly three. **Phase 2 criterion 7 is satisfied: keys
carry scopes, quotas and a rotation flow, and the quota is enforced
atomically.** Phase 2 as a whole remains in progress — criteria for
representative-data migration, rollback rehearsal and a deployed worker are
still open.

**A registry correction went with this.** `capabilities.ts` still described
`public_api` as having *"no scopes, no per-key quota and no rotation flow"* and
cited only `tests/crypto.test.ts`, long after scopes and quotas had shipped.
Two-thirds of that sentence was false and the evidence pointer was incomplete.
Both are corrected; `public_api` stays `beta`, because a rotation flow proven in
tests is not the same as one a third-party integrator has used.

**No capability status changed as a result.** These are security and durability
fixes, not new customer-facing capabilities. In particular:

- `lead_attribution` stays `demo_only`. Closing the forgery hole makes the data
  less wrong; it does not make a client-supplied referrer trustworthy evidence.
- `teams_rbac` stays `planned`. Role *enforcement* now exists and is tested, but
  there is no member-management surface and no invitation flow, so the
  capability a customer would buy does not exist.
- `scheduled_runs` stays `beta`. The durable queue exists; **no worker process
  is deployed to drain it.**

## Closed after Phase 2

One item listed below as open has since been closed. It is recorded here rather
than edited out of the list above, so the sequence stays visible.

| Was | Now | Test |
| --- | --- | --- |
| DNS rebinding open in a narrow race: the guard resolved and checked an address, then `fetch` resolved the name again and could get a different one | The connection is opened to the address that was checked, through a resolver that is asked once; each redirect hop is resolved, checked and pinned on its own | `tests/net-pinned.test.ts`, `tests/net-fetch.test.ts` |
| The address check read one spelling of an address — a dotted quad. `127.1`, `0177.0.0.1`, `0x7f000001`, `2130706433` and `::ffff:7f00:1` all reach blocked addresses and were treated as ordinary hostnames | Addresses are parsed to bytes and classified as bytes, in every notation a resolver accepts, for both families | `tests/ip-address.test.ts`, `tests/net-guard.test.ts` |

**No capability status changed as a result**, and no roadmap phase moved. This
closes one of `phase-2`'s acceptance criteria — "SSRF protection resolves DNS
and defends against redirects and rebinding" — and leaves the phase's other
criteria exactly as they were.

## What Phase 2 did *not* fix

- **The migration has now run against a hosted database, but not against
  production-sized data.** On 2026-08-25 the full runbook procedure passed
  against Railway PostgreSQL 16.15: migrations applied to the provisioned
  database with zero drift, and a `pg_dump`/`pg_restore` round trip preserved
  tenant scoping, run identity, observation provenance, key scopes and the
  idempotency constraint, field for field. The dataset was production-*shaped*
  synthetic data — two tenants, four projects, eight runs, twenty-four
  observations — so production-*sized* data remains untested, as do the
  provider's own snapshot/PITR path and any pooled endpoint. The run also found
  that the hosted server **offers TLS without enforcing it** and presents a
  self-signed certificate. See
  `evidence/2026-08-25-hosted-postgres-validation-railway.md`.
- **No worker is deployed.** Enqueued jobs sit until something runs them.
- **The shared rate limiter fails open** on a database error — a deliberate
  trade, documented in `docs/operations-runbook.md`.
- **Backups are a documented procedure, not automation.**
- Missing Stripe configuration still unlocks all workspaces implicitly. That is
  the intended self-hosted behaviour, not an oversight, but it is worth stating.
- `ChatGPT` remains pinned to a retired model and no adapter enables grounded
  search — Phase 1 work, still externally blocked.
