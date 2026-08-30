# Current and target capability map

Generated against main `2bd2b6b` on 2026-08-24, by reading `src/lib/capabilities.ts`,
`src/lib/roadmap.ts` and the actual source tree — not from memory.

`tests/constitution.test.ts` re-checks the id, status and owning phase of every
row below against the code on every CI run. If this table and the registry
disagree, the build fails. The prose around the table is not checked, so the
table is the part to trust.

---

## 1. The whole registry, by status

`status` is what the product may claim today. `phase` is the roadmap phase that
owns the capability — for anything not `verified` or `beta`, it is the phase
that must complete before the capability can be sold at all.

| id | Label | Status | Phase | Evidence | Not externally verified |
| --- | --- | --- | --- | --- | --- |
| `csv_export` | CSV and JSON export | `verified` | foundation | tests/csv.test.ts | None required. |
| `site_audit` | Site audit | `verified` | foundation | tests/crawler.integration.test.ts, tests/scoring.test.ts | None required — the audit reads only the site under test. |
| `billing` | Subscriptions and billing | `beta` | foundation | tests/billing.test.ts | Never run against a real Stripe account, not even in test mode. |
| `content_briefs` | Content briefs | `beta` | foundation | tests/brief.test.ts | Briefs are not benchmarked against live SERP data — no SERP provider is connected. |
| `elementor_widgets` | Elementor templates | `beta` | foundation | CI JSON validation in .github/workflows/supertool.yml | Never imported into, or rendered by, a real Elementor installation. Compatibility is inferred from the file format only. |
| `geo_scoring` | Answer-readiness scoring | `beta` | foundation | tests/scoring.test.ts | No held-out dataset, no outcome data. The score is not known to predict anything. |
| `keyword_research` | Keyword research | `beta` | foundation | tests/keyword-data.test.ts, tests/keywords.test.ts, tests/estimate.test.ts | The DataForSEO adapter has never been run against the live API in this environment. |
| `measurement_foundation` | Run-scoped measurement with confidence intervals | `beta` | foundation | tests/measurement-stats.test.ts, tests/measurement-run.test.ts, docs/measurement-spec.md | The arithmetic and the run lifecycle are unit- and database-tested. They have never operated on a live provider response, because no engine is currently measurable. |
| `public_api` | Project API keys | `beta` | foundation | tests/crypto.test.ts | Keys have no scopes, no per-key quota and no rotation flow. |
| `scheduled_runs` | Scheduled runs | `beta` | foundation | tests/measurement-run.test.ts, CI boot check in .github/workflows/supertool.yml | Gate 1 made runs durable and retries idempotent: the run row is written before any provider call, each observation is persisted as it completes, and a uniqueness constraint means a retry fills gaps rather than duplicating. Phase 2 put both producers behind the durable queue: `POST /api/app/run-check` and the cron sweep now enqueue a `measurement.run` job rather than measuring inside the request, the sweep holds a named lock so two overlapping deliveries cannot both sweep, and a per-period idempotency key means a retried delivery joins the existing job instead of creating a second. A worker entrypoint (`npm run worker`) claims, renews leases, retries with classified backoff, honours cancellation and drains on SIGTERM. It stays `beta` because no worker is deployed anywhere: the flow is complete in code and tested against real PostgreSQL, and enqueued jobs sit until something runs them. |
| `transactional_email` | Transactional email | `beta` | foundation | tests/email.test.ts, tests/password-reset.test.ts | No message has been delivered through a real provider from this environment. |
| `wordpress_publishing` | WordPress publishing | `beta` | foundation | tests/wordpress.test.ts, tests/wordpress.integration.test.ts (both against a stubbed API) | Never executed against a real WordPress installation. No PHPUnit suite and no plugin activation test exist. |
| `lead_attribution` | Referral telemetry | `demo_only` | foundation | None. There is no test asserting the events are trustworthy, because they are not. | The attribution chain from an assistant answer to a real conversion has never been demonstrated end to end. |
| `ai_visibility_tracking` | AI visibility tracking | `unavailable` | phase-1 | tests/provider-audit.test.ts, tests/measurement-run.test.ts, tests/measurement-stats.test.ts | None. No provider credential has been exercised, and official vendor documentation is unreachable from the build environment, so no model identifier could be verified against a primary source. |
| `backlink_tracking` | Backlink tracking | `unavailable` | phase-4 | tests/provenance.test.ts | Not applicable — the capability does not exist. |
| `citation_monitoring` | Citation monitoring | `unavailable` | phase-1 | tests/ai.test.ts, tests/provider-audit.test.ts | Never validated against real provider citation payloads. |
| `competitor_share_of_voice` | Competitor share of voice | `unavailable` | phase-1 | tests/ai.test.ts | Never validated against real answers. |
| `content_generation` | Content generation | `unavailable` | phase-6 | No route or library generates article text. | Not applicable — the capability does not exist. |
| `google_ai_mode` | Google AI Mode tracking | `unavailable` | foundation | tests/provenance.test.ts asserts this surface is never called and never simulated. | Not applicable — the capability does not exist. |
| `rank_tracking` | Rank tracking | `unavailable` | phase-4 | tests/provenance.test.ts asserts a live project cannot be shown seeded rankings. | Not applicable — the capability does not exist. |
| `approval_workflow` | Review and approval workflow | `planned` | phase-6 | None. | Not started. |
| `byo_provider_keys` | Bring your own provider keys | `planned` | phase-2 | None. | Not started. |
| `google_analytics` | GA4 integration | `planned` | phase-3 | None. | Not started. |
| `google_search_console` | Search Console integration | `planned` | phase-3 | None. | Not started. |
| `local_device_tracking` | City and device level tracking | `planned` | phase-4 | None. | Not started. |
| `teams_rbac` | Multi-seat workspaces | `planned` | phase-2 | None. | Not started. |
| `white_label_reporting` | White-label reporting | `planned` | phase-7 | None. | Not started. |

Counts: 2 `verified`, 11 `beta`, 1 `demo_only`, 7 `unavailable`, 6 `planned`.
Thirteen of twenty-seven are sellable. That ratio is the honest state of the
product and is not something to be embarrassed about — it is the output of Gate 0
and Gate 1 doing their job.

---

## 2. What actually exists in the source tree

Counted from main `2bd2b6b`.

### Application routes — 30 pages

Marketing (16): `/`, `/about`, `/blog`, `/blog/[slug]`, `/contact`,
`/docs/wordpress`, `/platform`, `/platform/[slug]`, `/pricing`, `/privacy`,
`/solutions`, `/solutions/[slug]`, `/terms`, `/tools/ai-visibility-check`,
`/tools/site-audit`, plus the marketing layout.

Auth (4): `/login`, `/signup`, `/forgot-password`, `/reset-password`.

Dashboard (12): `/app`, `/app/account`, `/app/ai-visibility`, `/app/audit`,
`/app/backlinks`, `/app/billing`, `/app/citations`, `/app/content`,
`/app/keywords`, `/app/leads`, `/app/onboarding`, `/app/rankings`,
`/app/settings`.

### API routes — 32

- `/api/app/*` (14): account, api-keys, brief, competitors, export, keywords,
  onboarding, projects, prompts, run-audit, run-check, score,
  wordpress/connect, wordpress/publish.
- `/api/auth/*` (5): login, logout, signup, forgot-password, reset-password.
- `/api/billing/*` (3): checkout, portal, webhook.
- `/api/v1/*` (5): wordpress/citations, wordpress/lead, wordpress/publish,
  wordpress/verify, wordpress/visibility.
- Other (5): `/api/contact`, `/api/cron/run-checks`, `/api/health`,
  `/api/tools/ai-check`, `/api/tools/audit`.

### Data model — 22 Prisma models

`User`, `PasswordResetToken`, `ProcessedWebhookEvent`, `Organization`,
`Membership`, `Project`, `Keyword`, `RankSnapshot`, `AiPrompt`, `AiCheck`,
`Competitor`, `AuditRun`, `AuditIssue`, `ContentBrief`, `Article`, `Backlink`,
`Lead`, `SiteConnection`, `ApiKey`, `ContactInquiry`, `MeasurementRun`,
`Observation`.

`MeasurementRun` and `Observation` are the Gate 1 records. `AiCheck` is the
pre-Gate-1 legacy table, still read but never counted into a rate.

### Answer-engine adapters — 6 registered, 0 measurable

| Engine | Availability | Grounding | Docs verified |
| --- | --- | --- | --- |
| chatgpt | unavailable | absent | no |
| claude | unavailable | absent | no |
| gemini | unavailable | absent | no |
| grok | unavailable | absent | no |
| perplexity | unavailable | intrinsic | no |
| google-ai-mode | unavailable | n/a — no public API | n/a |

Availability is derived in `src/lib/ai/engines.ts` from access method, grounding
status and documentation verification. It cannot be hand-set, so an engine
cannot drift back to available without someone changing a fact about it.

### WordPress and Elementor surfaces

Plugin `wordpress/rank-logic-supertool/`: main plugin file, `uninstall.php`,
`readme.txt`, 7 includes (API client, attribution, Elementor bridge, REST,
schema, SEO bridge, settings), 4 widget classes (base, citation feed, engine
breakdown, visibility score), and `assets/attribution.js`.

Also `wordpress/seo-machine-yoast-rest.php` (MU-plugin exposing Yoast fields)
and `wordpress/functions-snippet.php`.

Elementor kit: 6 templates — hero, stat bar, services grid, process, CTA band,
FAQ — plus `build-kit.mjs`.

CI validates PHP syntax across 15 files and JSON validity across 6 templates.
Neither has ever been activated in a real WordPress or Elementor install.

### Test suite — 26 files, 384 tests

Truth and provenance: `capabilities.test.ts`, `marketing-truth.test.ts`,
`provenance.test.ts`, `provider-audit.test.ts`, `ai.test.ts`.
Measurement: `measurement-run.test.ts`, `measurement-stats.test.ts`.
SEO engine: `crawler.integration.test.ts`, `scoring.test.ts`, `keywords.test.ts`,
`keyword-data.test.ts`, `estimate.test.ts`, `brief.test.ts`, `metrics.test.ts`,
`text.test.ts`, `csv.test.ts`.
Platform: `billing.test.ts`, `crypto.test.ts`, `email.test.ts`,
`password-reset.test.ts`, `rate-limit.test.ts`, `net-guard.test.ts`,
`contact.test.ts`, `wordpress.test.ts`, `wordpress.integration.test.ts`.
Plus `constitution.test.ts`, added by Phase 0.

---

## 3. Target surface, and the distance to it

Section 5 of the master prompt describes twelve module families. Mapped against
what exists:

| Target module | State today | Gap |
| --- | --- | --- |
| A. Command Center / Action Center | Not started | No cross-module recommendation queue exists. `/app` is a dashboard, not an action surface. Phase 5. |
| B. Keyword, topic and SERP intelligence | Partial | Keyword research is `beta` with DataForSEO unproven live; no SERP feature data, no clustering, no topic maps. Phase 4. |
| C. Rank tracking | Absent | `RankSnapshot` exists as a table; `rank_tracking` is `unavailable` and no measured position is ever shown. Phase 4. |
| D. AI visibility and answer engines | Pipeline complete, no source | Gate 1 built run identity, sampling, coverage and intervals. Zero engines measurable. Phase 1. |
| E. Technical SEO | Partial | `site_audit` is `verified` — a 25-rule crawl. No JS rendering, no Core Web Vitals, no issue ownership or recurrence tracking. Phase 4. |
| F. Backlinks, brand, digital PR | Absent | `Backlink` table exists; `backlink_tracking` is `unavailable`. Needs a licensed provider. Phase 4. |
| G. Content operating system | Partial | Briefs and answer-readiness scoring are `beta`. No inventory, decay detection, refresh, consolidation or repurposing. `content_generation` is `unavailable`. Phase 6. |
| H. Local SEO | Absent | No Business Profile connection, no map-grid, no NAP consistency. Phase 7. |
| I. Competitor and market intelligence | Minimal | `Competitor` table and CRUD exist. Share of voice is withdrawn. Phase 4 and 7. |
| J. Analytics, forecasting, attribution, reporting | Minimal | No GSC, no GA4. `lead_attribution` is `demo_only` and forgeable. No reporting engine. Phase 3 and 7. |
| K. Publishing and integrations | Partial | WordPress publishing and the Elementor kit are `beta`, never run against a real install. Phase 3. |
| L. Agency and SaaS controls | Partial | Organizations, memberships and Stripe billing exist. Roles are unenforced; no white-label, no client portal, no scoped keys. Phase 2 and 7. |

---

## 4. Deliberately out of scope

Recorded so the absence reads as a decision rather than an oversight:

- **A proprietary web-scale crawl index.** Ahrefs-scale link data is bought, not
  built, until there is a specific technical and legal justification.
- **Microservices.** A modular monolith until scale proves otherwise.
- **Non-WordPress CMS destinations** (Webflow, Shopify, HubSpot) until customer
  demand is evidenced.
- **Any engine surface without a compliant public API**, Google AI Mode
  included.
- **Autonomous production deployment** by any AI system, permanently.
