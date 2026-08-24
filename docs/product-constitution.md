# Rank Logic product constitution

Status: governing document for `GunsNR/seomachine`
Established: 2026-08-24, at main `2bd2b6b`
Supersedes: nothing. Sits above every other document in `docs/`.

---

## 0. What this document is for

This is the standing set of rules the product is built under. It is not a plan
and not a description of what exists — `docs/master-roadmap.md` is the plan and
`src/lib/capabilities.ts` is the description.

The division matters, and it is the reason this file exists at all:

| Question | Authoritative answer |
| --- | --- |
| What can the product do **today**? | `src/lib/capabilities.ts` |
| Why do we believe that? | `docs/release-truth-audit.md` |
| What may we **say** in public? | `marketingLanguage` in the capability registry |
| What are we building **next**? | `src/lib/roadmap.ts`, read via `docs/master-roadmap.md` |
| What rules govern all of the above? | This document |

A roadmap entry is never evidence of a capability. A capability is never
evidence of an outcome. Those two sentences are most of what this document
protects.

---

## 1. Mission

Build the easiest serious all-in-one SEO operating system for agencies and
growing businesses: classic organic research and tracking, technical SEO, local
SEO, backlinks and digital PR, AI-answer-engine visibility, the content
lifecycle, competitive intelligence, analytics and reporting, and approval and
publishing workflows — with WordPress and Elementor as first-class destinations.

The product turns fragmented data into an ordered loop:

**Know what changed → understand why → see the highest-value next action →
approve or execute it → publish safely → measure the outcome → learn what
works.**

The wedge is Rank Logic's own agency workflow on real client accounts. The later
product is a scalable SaaS. One platform, one data model, different permissions
and vocabulary for agency operators, specialists, business owners and clients.

Success is not a longer feature list than a competitor. Success is the chosen
customer completing important SEO work more accurately, more quickly, with less
confusion, and with defensible evidence of impact.

---

## 2. The honest competitive objective

No engineer and no product can guarantee rankings, revenue, or permanent
superiority. That promise is never made.

The enforceable form:

> Rank Logic must maintain a measured competitive advantage for its target
> customer and priority workflows. Every material claim of superiority must be
> backed by a dated, reproducible benchmark, real-user evidence, or verified
> product data.

Scorecard, method and evidence rules live in `docs/competitive-scorecard.md`.

Competitor source code, protected assets, testimonials, copy and distinctive
creative expression are never copied. Workflows and interaction principles may
be learned from; the expression must be original.

---

## 3. Constitutional invariants

These came from Truth Gate 0 and Measurement Gate 1. They are not open for
convenient reinterpretation. A change that conflicts with one of these is
rejected, and the rejection is explained rather than worked around.

1. A live failure stays failed or unavailable. It is never silently replaced
   with simulated output.
2. Simulation exists only in an explicit demo mode, labelled at row, run, API,
   export and UI level.
3. Mixed, failed, unavailable, estimated, modelled, imported and live data are
   never presented as equivalent.
4. Every metric carries source, provenance, timestamp, freshness, coverage, and
   confidence or evidence status where applicable.
5. AI visibility is stored and computed as `MeasurementRun` and `Observation`,
   with immutable run identity and prompt-version identity.
6. Repeated sampling and statistical uncertainty are shown. Insufficient
   evidence is never converted into a confident score.
7. Every public claim is allowed by the capability registry and supported by
   testable evidence.
8. No fabricated testimonial, logo wall, review count, certification, benchmark,
   case result or customer outcome enters the product.
9. Unavailable features are not sold. Planned work is not worded as delivered.
10. Provider errors and secrets are redacted before storage, logging, display or
    export.
11. The release truth audit and the capability registry stay synchronized, and
    CI enforces it.
12. Google AI Mode stays unavailable until a compliant, first-party-supported
    method can reproduce and measure the actual consumer experience. A Gemini
    completion is not Google AI Mode.

### How each invariant is actually held

Invariants that live only in a document decay. These are the checks:

| Invariant | Enforced by |
| --- | --- |
| 1, 2, 3, 4 | `tests/provenance.test.ts`, `tests/ai.test.ts` |
| 5, 6 | `tests/measurement-run.test.ts`, `tests/measurement-stats.test.ts` |
| 7, 9 | `tests/capabilities.test.ts` — `planFeatureLabel()` throws for a non-sellable id, so the build fails rather than the customer being misled |
| 8 | `tests/marketing-truth.test.ts`, and `tests/constitution.test.ts` for planning documents |
| 10 | `tests/provenance.test.ts` |
| 11 | `tests/capabilities.test.ts` |
| 12 | `tests/provider-audit.test.ts` |
| 9, plus roadmap drift | `tests/constitution.test.ts` — a capability is sellable only if its delivering phase is complete |

---

## 4. The claim ladder

Words that sound similar and mean very different things. Reports and marketing
must pick the right rung and never round up.

1. **Implemented** — code exists.
2. **Tested** — automated tests cover it in this repository.
3. **Externally verified** — exercised against the real third-party system it
   depends on, with repeatable evidence.
4. **Merged** — on `main`.
5. **Deployed** — running in production.
6. **Observed customer outcome** — a real customer got a real result.

A local green test is not external validation. A screenshot is not functional
proof. A simulator is not live measurement. Code merged is not code deployed.
Code deployed is not a successful customer outcome.

The word "finished" is not used for the product. Reports state which phase and
which acceptance criteria are complete.

---

## 5. Data rules

Data quality is a product feature, not an implementation detail. The full
strategy is `docs/data-provider-strategy.md`. The rules that are constitutional:

- First-party customer data is preferred wherever it exists — Search Console,
  GA4, Business Profile, and the connected CMS.
- Web-scale and SERP data comes from licensed providers, never from invented
  numbers.
- Every data family has a versioned internal contract, so product identity is
  never welded to one vendor.
- Every visible data point is traceable to its origin.

Never: scrape a protected service against its terms; relabel an estimate as
measured; merge metrics with different definitions without disclosing it; expose
one tenant's data to another; let a stale value appear current; store or
redistribute data beyond contractual rights.

---

## 6. Improvement rules

"Self-improving" means a controlled, observable, reversible product-learning
loop. It does not mean an AI silently rewriting or deploying production code.
The mechanism is `docs/continuous-improvement-system.md`.

Constitutionally:

- AI may draft specifications, tests, migrations, code, documentation and pull
  requests.
- CI, security checks, evaluation gates, capability truth checks, human review,
  feature flags, canaries and rollback plans remain mandatory.
- No autonomous production deployment, secret creation, external purchase, legal
  acceptance, destructive migration, customer communication, pricing change or
  marketing claim.
- Every accepted change updates architecture decisions, capability evidence,
  tests, documentation and release notes.

---

## 7. Experience rules

The full system is `docs/ux-and-design-system.md`. The non-negotiable parts:

- **Action-first.** Default to the few most valuable next actions, not a wall of
  charts.
- **Progressive disclosure.** A business owner sees clarity; an expert can open
  the full evidence.
- **One vocabulary.** The same metric means the same thing everywhere.
- **Visible trust.** Source, freshness, coverage, confidence and data state are
  always reachable.
- **Reversible execution.** Preview, approve, publish, verify, roll back.
- **Complete states.** Loading, empty, partial, stale, estimated,
  insufficient-evidence, failed, unavailable, demo, permission-denied and
  recovery are all designed, not left to chance.
- **Accessible and fast.** WCAG 2.2 AA; p75 LCP ≤ 2.5s, INP ≤ 200ms, CLS ≤ 0.1
  on priority pages.

### The brand identity

The canonical Rank Logic palette, decided 2026-08-24 (ADR-012):

| Role | Colour |
| --- | --- |
| Woodsmoke | `#0c0d0e` |
| Raw Sienna | `#d16c42` |
| Tasman | `#dbdcdb` |
| Corduroy | `#646c6c` |

This is the identity. It is **not** what the code renders today, and that gap is
intentional: the runtime UI is preserved until Phase 5 implements and visually
tests the complete responsive design system. The existing blue may continue
afterwards as a functional or data-visualization colour if Phase 5 accessibility
and UX testing justifies it, but it is not the primary brand identity. Changing
the canonical palette requires a superseding ADR.

Business identity — postal address, phone, legal pages — stays unpublished while
`brand.identityVerified` is `false` (ADR-013). Placeholder contact details must
never appear in `Organization` structured data, because structured data is an
assertion about a real-world entity rather than decorative copy.

---

## 8. Prioritization

Score work on customer severity and frequency, strategic fit with the
agency-first wedge, expected verified outcome, confidence and evidence, reach,
effort and dependency, data and legal feasibility, security and trust risk,
recurring operating cost, and ability to create a durable advantage.

Security, truth, data integrity and broken core workflows outrank net-new
feature breadth. Always.

Reach reliable parity on table-stakes workflows, then win decisively on: one
prioritized cross-module Action Center; combined Google and AI visibility;
evidence and provenance; WordPress and Elementor execution; agency and client
simplicity; recommendation-to-publish-to-outcome learning; mobile approval and
reporting; transparent value and cost.

---

## 9. Engineering rules

- Inspect before editing. Preserve unrelated changes.
- Follow existing repository conventions unless an ADR changes them.
- Add tests with behaviour changes — success, failure, permission, stale,
  partial, empty, retry, idempotency and cross-tenant cases.
- Use official vendor documentation for integrations. A third-party summary is
  not documentation.
- Pin and audit new dependencies. Install the smallest justified set. Do not add
  a tool because it exists.
- Keep provider logic behind interfaces and pure calculations free of I/O.
- Use feature flags for incomplete or risky work.
- Never expose secrets in logs, fixtures, screenshots, commits or reports.
- Do not weaken a test to make CI green unless the prior expectation is
  demonstrably wrong — and then document why in the same change.

Full verification means: typecheck, lint, unit and integration tests,
production build, database schema check, PHP lint, Elementor JSON validation,
and any relevant live or browser verification.

---

## 10. Authorization boundary

Proceed autonomously on routine engineering decisions.

Stop and ask only for: spending money; creating or changing external accounts;
adding credentials; accepting legal terms; deploying to production; destructive
migrations; merging a pull request; or a material product or pricing decision.

Never stop after presenting a plan when the task authorized implementation.
Never claim completion without exact evidence.

---

## 11. Change control for this document

This document changes by pull request, never in passing. A change that weakens a
Section 3 invariant requires the reason to be written into
`docs/architecture-decision-log.md` as a superseding decision, with the
alternative that was rejected. A pull request that edits Section 3 and no test
is presumed wrong.
