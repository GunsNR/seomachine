# Master roadmap

The enforceable version of this roadmap is `src/lib/roadmap.ts`. This document
is the readable view of it. `tests/constitution.test.ts` checks that every phase
below carries the same state the code declares, so the two cannot drift.

Baseline: main `2bd2b6b`, with Truth Gate 0 and Measurement Gate 1 merged and
green.

---

## How to read this

A phase state is one of `complete`, `in-progress`, `not-started`.

The rule that gives the roadmap teeth: **a capability may be sellable only if
the phase that delivers it is `complete`.** Listing something in a future phase
is therefore evidence that it is *not* available — the opposite of the usual
roadmap failure, where planned work slowly acquires the present tense. Moving a
phase to `complete` is the only way to unlock a sellable capability, and that
move is gated on the acceptance criteria below.

Phases run in dependency order. A phase cannot be marked `complete` while
anything it depends on is outstanding.

---

## Phase table

| Phase | Title | State | Depends on | Delivers | Owner action needed |
| --- | --- | --- | --- | --- | --- |
| `foundation` | Truth Gate 0 and Measurement Gate 1 | `complete` | — | 14 capabilities incl. `site_audit`, `csv_export`, `measurement_foundation`, `wordpress_publishing` | None |
| `phase-0` | Product constitution and executable blueprint | `complete` | `foundation` | — (documentation only) | None |
| `phase-1` | Grounded provider activation | `not-started` | `phase-0` | `ai_visibility_tracking`, `citation_monitoring`, `competitor_share_of_voice` | Credentials, doc access, spend, legal review |
| `phase-2` | Production data, jobs, tenancy and security | `in-progress` | `phase-0` | `teams_rbac`, `byo_provider_keys` | Hosted PostgreSQL instance, representative data copy for migration rehearsal |
| `phase-3` | First-party integrations and verified publishing | `not-started` | `phase-2` | `google_search_console`, `google_analytics` | Google Cloud project, real WordPress install, Stripe test account, email provider |
| `phase-4` | Core classic SEO intelligence | `not-started` | `phase-3` | `rank_tracking`, `backlink_tracking`, `local_device_tracking` | Licensed data provider contracts, recurring spend, legal review |
| `phase-5` | Action-first product and original design system | `not-started` | `phase-4` | — (experience, not new capabilities) | Access to representative users |
| `phase-6` | Content, approval and execution engine | `not-started` | `phase-5` | `content_generation`, `approval_workflow` | None |
| `phase-7` | Local, agency, reporting, API and SaaS controls | `not-started` | `phase-6` | `white_label_reporting` | Business Profile API approval, white-label domain strategy |
| `phase-8` | Pilot evidence and calibration | `not-started` | `phase-7` | — (evidence, not features) | Five real pilot customers, written permission for outcomes |
| `phase-9` | Controlled improvement plane and launch hardening | `not-started` | `phase-8` | — (governance) | Production hosting, monitoring, on-call commitment |

Two phases deliver no capability at all (`phase-5`, `phase-8`) and two deliver
only governance (`phase-0`, `phase-9`). That is deliberate. Experience quality,
pilot evidence and release governance are not features and should not be
smuggled into the registry as if they were.

---

## Acceptance criteria

These are the conditions for marking a phase `complete`. They live in
`src/lib/roadmap.ts` and are reproduced here.

### `foundation` — complete

- No live failure is ever replaced with simulated output.
- Simulation appears only in demo mode and is labelled at row, run, API, export
  and UI level.
- Every capability in the registry carries source, evidence and
  external-validation fields.
- Public marketing sells nothing the registry marks non-sellable.
- AI visibility is stored as immutable `MeasurementRun` and `Observation`
  records.
- Failed and unavailable observations are excluded from rate denominators and
  reported as coverage.

### `phase-0` — in progress

- One unambiguous product constitution exists in the repository.
- Current, target and planned capabilities are mapped against the real source
  tree.
- The roadmap is dependency-aware and carries acceptance criteria per phase.
- A competitive scorecard and its evidence rules exist.
- A data-provider and legal-review strategy exists.
- A UX system and research plan exist.
- Continuous-improvement governance is written down.
- No public claim changed merely because it appears in the target roadmap.
- CI remains green, including every Gate 0 and Gate 1 truth and measurement
  check.

### `phase-1` — grounded provider activation

- Each available engine has a grounded retrieval path taken from that vendor's
  current official documentation.
- Documentation verification cites a first-party vendor URL and a retrieval date.
- Stored observations carry provider, model, tool, prompt version, locale,
  timing, usage, cost, sources and provenance.
- No silent fallback exists on any path.
- A real credentialed call has succeeded and is recorded as repeatable evidence.
- Engines that fail any check stay unavailable with a published reason.

### `phase-2` — production data, jobs, tenancy and security

- PostgreSQL with reviewed migrations replaces SQLite and `prisma db push`.
- A migration runs cleanly against a representative copy of real data.
- Restoration and rollback or forward-fix have been rehearsed.
- Runs are durable and resumable through a real job system.
- Tenant and role boundaries are enforced and covered by regression tests.
- SSRF protection resolves DNS and defends against redirects and rebinding.
- API keys carry scopes, quotas and a rotation flow.
- CORS is explicit rather than wildcard on `/api/v1`.
- Billing entitlements are correct for trialing, active, past-due, canceled and
  misconfigured states.

### `phase-3` — first-party integrations and verified publishing

- Search Console, GA4 and Business Profile connect through real authorization
  flows where permitted.
- Source freshness and disconnection states are visible in the product.
- WordPress and Elementor workflows are exercised against a real installation in
  supported versions.
- Publishing, revision and rollback are demonstrated end to end.
- No capability status is upgraded without external evidence attached to the
  registry row.

### `phase-4` — core classic SEO intelligence

- Provider-independent contracts exist for keyword, SERP, rank, backlink,
  competitor and crawl data.
- Measured data replaces every seeded or modelled placeholder on these surfaces.
- Every metric is attributable to a provider and legally usable under that
  provider's terms.
- Scheduled tracking and alerts run reliably.
- Technical crawl findings reproduce across runs.

### `phase-5` — action-first product and original design system

- The information architecture is rebuilt around a single cross-module Action
  Center.
- The five priority workflows reach at least 90% unassisted completion with
  representative users.
- Mobile approval and reporting are first-class.
- WCAG 2.2 AA is met on priority pages.
- p75 LCP ≤ 2.5s, INP ≤ 200ms and CLS ≤ 0.1 on priority pages, enforced in CI or
  observability.
- Every data and error state is designed.
- No fabricated proof appears anywhere in the marketing system.

### `phase-6` — content, approval and execution engine

- Research, gaps, briefs, drafting, technical fixes, internal links and schema
  connect into one action chain.
- Action provenance and change history are preserved for every executed action.
- Preview and rollback are safe and demonstrated.
- Fact and policy checks run before publication.
- No autonomous mass publishing of low-value pages is possible.
- Outcomes link back to the action that caused them without asserting causation.

### `phase-7` — local, agency, reporting, API and SaaS controls

- A real agency portfolio workflow passes end to end.
- Client views reveal only authorized information.
- Entitlements and quotas behave correctly under failure states.
- Reports are reproducible from stored data.
- Unit economics and provider costs are observable per organization.

### `phase-8` — pilot evidence and calibration

- At least five representative real customers or projects use the product. Demos
  do not count.
- Onboarding, the weekly workflow, publishing and reporting are used in reality.
- Measurement noise and data quality are documented from real runs.
- Recommendation precision and false-positive rate are reviewed against outcomes.
- Usability failures found in pilot are fixed.
- Real outcomes are documented with written permission before any public use.
- Pricing and packaging are informed by observed usage and cost.

### `phase-9` — controlled improvement plane and launch hardening

- Improvement proposals are ranked by evidence, not enthusiasm.
- Model and provider changes pass shadow evaluation and canary release before
  general availability.
- No system can self-deploy to production.
- Marketing claims are generated from verified capability evidence.
- Launch checklist, support process, rollback and incident drills all pass.

---

## Everything blocked on the product owner

Collected from `externalBlockers()` in `src/lib/roadmap.ts`. Nothing here can be
unblocked by writing code.

**`phase-1`**
- Provider API credentials (OpenAI, Anthropic, Google, Perplexity, xAI) — none
  are configured.
- Network egress to official vendor documentation domains, which this build
  environment blocks.
- Per-call provider spend for live contract tests and canaries.
- Legal review of each provider's terms for storage and redistribution of
  returned content.

**`phase-2`**
- A hosted PostgreSQL instance.
- A representative data copy to rehearse migration against.

**`phase-3`**
- Google Cloud project, OAuth client and consent screen.
- A real WordPress installation with Elementor for verification.
- Stripe test-mode account.
- A transactional email provider account and verified sending domain.

**`phase-4`**
- Licensed SERP, rank and backlink data provider contracts.
- Recurring provider spend and a documented unit-cost model.
- Legal review of storage and redistribution rights per provider.

**`phase-5`**
- Access to representative users for moderated usability testing.

**`phase-7`**
- Google Business Profile API access approval.
- A white-label domain and certificate strategy.

**`phase-8`**
- Five real customers or client projects willing to pilot.
- Written permission before any customer outcome becomes a public claim.

**`phase-9`**
- Production hosting, monitoring and error-tracking accounts.
- An on-call and incident-response commitment.

---

## Sequencing rationale

Phase 1 comes before Phase 2 for one reason: the product's distinguishing claim —
AI answer-engine visibility — is currently unbuyable, and every week it stays
that way is a week the wedge does not exist. It is also the cheapest phase to
attempt, because the code is already written and tested; what is missing is
credentials, documentation access and a grounded call path.

Phase 2 comes before Phase 3 because connecting real customer accounts to a
SQLite database with no migration history would create data that cannot be
safely migrated later.

Phase 4 comes after Phase 3 because licensed data costs recurring money, and
committing to a provider before first-party integrations prove the workflow is
the expensive order to get wrong.

Phase 5 comes after the data phases deliberately. Redesigning around an Action
Center before there is anything to recommend produces a beautiful empty state.
