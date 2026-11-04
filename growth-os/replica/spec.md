# Spec: requirements → implementation → evidence

One source of truth for MVP scope. Status uses the claim ladder:

- **Tested** — an automated behaviour test exercises it.
- **Journey** — the browser journey (`scripts/journeys.cjs`) exercises it through the real UI.
- **Inspected** — checked by hand in the browser.
- **Manual fallback**, **Blocked** and **Deferred** are as defined in `feature-matrix.md`.

Nothing here is live verified.

Tests live in `tests/*.test.ts` (95 tests). Journeys are J0–J8 (26 checks).

## CRM and sales

| ID | Requirement | Implementation | Evidence | Status |
| --- | --- | --- | --- | --- |
| REQ-CRM-01 | Contact, company, opportunity, booking, payment are distinct records; tags, notes, owner, consent history, source | `prisma/schema.prisma`, `lib/crm/ops.ts` | `crm.test.ts` | Tested |
| REQ-CRM-02 | Same submission → one effect; a genuine new inquiry → new opportunity; a shared phone is never a merge | `lib/crm/intake.ts` | `crm.test.ts` acceptance 1 (5 cases incl. concurrency); J2c | Tested + Journey |
| REQ-CRM-03 | Intake from forms, manual entry, CSV import; CSV export | `api/forms`, `crm/actions.ts`, `api/export/contacts` | `units.test.ts` (CSV parse, formula guard); J2, J4d | Tested + Journey |
| REQ-CRM-04 | Two separate pipelines: agency acquisition (A) and client sales (B), configurable stages | `lib/crm/pipelines.ts`, `Pipeline.stages` | Seed + `crm.test.ts` | Tested |
| REQ-CRM-05 | Bookings with reschedule/cancel/no-show; a manual record is labelled as not a calendar reservation | `createBooking`, `setBookingStatus`, lead page | `crm.test.ts` (verified=false); Inspected | Tested |
| REQ-CRM-06 | Versioned proposals with scope, deliverables, price and currency; printable export | `createProposal`/`reviseProposal`, `/proposals/[id]/print` | Inspected | Inspected |
| REQ-CRM-07 | Retainer, one-time and performance components; performance stays draft-only until metric, baseline, source, window, cap, exclusions and approval rule are set | `lib/offers.ts`, `setProposalStatus` | `units.test.ts` offers | Tested |
| REQ-CRM-08 | Client outcome confirmation (qualified, appointment, won, value, paid) with who and when; client vs agency vs provider kept separate | `recordOutcome`, `recordPayment`, `/portal` | `crm.test.ts`; J4b | Tested + Journey |
| REQ-CRM-09 | Lost requires a reason; won ≠ paid | `moveStage` | `crm.test.ts`; J1c | Tested + Journey |

## Automation

| ID | Requirement | Implementation | Evidence | Status |
| --- | --- | --- | --- | --- |
| REQ-AUT-01 | Finite triggers and steps (form, assignment, stage, booking; task, draft, wait, send, stage condition, assign) | `lib/workflows/definition.ts` | `workflows.test.ts` (bounds) | Tested |
| REQ-AUT-02 | Runs snapshot their workflow version; bounded steps; overlapping executions produce one effect | `advanceRun` (CAS + idempotency keys; un-claim on failure) | `workflows.test.ts`, `review-regressions.test.ts` | Tested |
| REQ-AUT-03 | Suppression, consent, pause and stop rules checked at dispatch, not only at enqueue | `stopReasonNow`, `dispatchMessage` | acceptance 6 (4 cases) | Tested |
| REQ-AUT-04 | Stop on reply, opt-out, booking, disqualification, close; manual takeover; workspace emergency pause | `stopRunsFor`, `takeoverAction`, `pauseAction` | `workflows.test.ts`; J5a | Tested + Journey |
| REQ-AUT-05 | Live email only with a verified domain + DMARC + LIVE_SENDING_ENABLED; idempotency key per send; opt-out re-checked at send time; unclear results held, not resent | `dispatchMessage`, `lib/integrations/email.ts` | `workflows.test.ts`, `adapters.test.ts` | Tested against mock · not live verified |

## Websites

| ID | Requirement | Implementation | Evidence | Status |
| --- | --- | --- | --- | --- |
| REQ-WEB-01 | Section-based pages from brand facts (hero, benefits, services, verified proof, FAQ, form, booking CTA, footer) | `lib/site/sections.ts` (template, not AI) | `site-seo.test.ts` | Tested |
| REQ-WEB-02 | Reorder, theme/typography, scoped edit requests, versions, preview, rollback | `websites/actions.ts`, editor | J3; `site-seo.test.ts` rollback | Tested + Journey |
| REQ-WEB-03 | Draft, preview and published are distinct; publish is separate from save | `Page.draftVersion`/`publishedVersion`, `publishVersion` | `site-seo.test.ts` | Tested |
| REQ-WEB-04 | A change against an outdated version is rejected, never overwrites a newer human edit | `saveVersion` CAS, `applyChange` | acceptance 10 | Tested |
| REQ-WEB-05 | Server-rendered, semantic and accessible pages; canonical without redirect; sitemap of published, indexable pages only; robots; structured data consistent with visible content | `lib/site/render.ts`, `/s/[site]` | `site-seo.test.ts`; curl check of canonical/sitemap | Tested + Inspected |
| REQ-WEB-06 | Previews are private and noindex; drafts are never public | `/preview/[pageId]`, `X-Robots-Tag` | `site-seo.test.ts`; J6 | Tested + Journey |
| REQ-WEB-07 | Public forms: honeypot, rate limits, same-origin, validation, consent wording stored, idempotent | `api/forms/[site]` | J2a, J2e, J2f | Journey |
| REQ-WEB-08 | Only approved facts render as proof; healthcare forms collect minimal fields | `render.ts` | `site-seo.test.ts` | Tested |
| REQ-WEB-09 | Export and deployment path | HTML export route | Inspected | Export works · custom domain **Deferred** |

## Content

| ID | Requirement | Implementation | Evidence | Status |
| --- | --- | --- | --- | --- |
| REQ-CON-01 | Brand profile per brand: versioned facts with provenance; inferred facts need review | `lib/brand.ts` | `site-seo.test.ts`, `ai-brand.test.ts` | Tested |
| REQ-CON-02 | Sourced briefs; sources stored with retrieval date as discovery until verified; templates use approved facts only; prohibited claims blocked | `content/actions.ts`, `templates.ts` | `ai-brand.test.ts` | Tested |
| REQ-CON-03 | Platform variants; researched hashtags, validated mentions and internal tags kept separate; CTA plus UTM content ID per piece | `content/variants.ts` | `ai-brand.test.ts` (UTM) | Tested |
| REQ-CON-04 | Approval binds to version + destinations + schedule + approver; edits or a send-back revoke it; worker refuses stale versions | `lib/content/publish.ts` | acceptance 5; `review-regressions.test.ts` | Tested |
| REQ-CON-05 | Per-destination status; acceptance, delivery and URL kept separate; partial success visible; timeout reconciles before resend | `dispatchPublication`, `reconcilePublication` | acceptance 7 (4 cases) | Tested |
| REQ-CON-06 | One branded image/carousel export path | `content/svg.ts`, `/api/assets` | Inspected | Inspected |
| REQ-CON-07 | Real publishing adapter; never fake-connected; never auto-resend after unclear result | `lib/integrations/contentstudio.ts`, `lib/setup.ts` | `adapters.test.ts` (6 cases), `setup.test.ts` | Tested against mock · not live verified |
| REQ-CON-08 | Manual hand-off package + mark as posted (current approved version only) | `/api/export/post/[pubId]`, `markPostedByHand` | `adapters.test.ts`, `review-regressions.test.ts` | Tested |

## SEO

| ID | Requirement | Implementation | Evidence | Status |
| --- | --- | --- | --- | --- |
| REQ-SEO-01 | Bounded crawler for authorized sites; SSRF-guarded live fetch | `lib/seo/crawl.ts`, `lib/net.ts` | `units.test.ts` (blocked ranges); duplicate-job test | Tested (owned sites) · live crawl not run against a real site |
| REQ-SEO-02 | Evidence-backed findings: urls, freshness, intent, proposal, hypothesis, effort, risk, verification; no ranking guarantees | `lib/seo/rules.ts` | `site-seo.test.ts` | Tested |
| REQ-SEO-03 | Owned pages: versioned patch → approve → publish → recheck → rollback; external sites: proposal only | `seo/patches.ts` | acceptance 10; J3 | Tested + Journey |
| REQ-SEO-04 | Dismissed stays dismissed; unreachable pages reported as gaps | `executeCrawl`, `fetch_failed` | `review-regressions.test.ts` | Tested |
| REQ-SEO-05 | Search Console data (CSV import, period + source, matched by site domain only) | `lib/integrations/gsc.ts`, SEO queue | `adapters.test.ts` | Tested · API sync, GA4 and Ahrefs **Deferred** |

## Measurement

| ID | Requirement | Implementation | Evidence | Status |
| --- | --- | --- | --- | --- |
| REQ-MEA-01 | Separate agency and client contexts | per-workspace reports | Seed + Inspected | Inspected |
| REQ-MEA-02 | First-touch and last-touch source/medium/campaign/content captured; unknown stays unknown | `lib/attribution.ts` | `units.test.ts`; acceptance 2; J2d | Tested + Journey |
| REQ-MEA-03 | Won ≠ collected; replays count once; refunds reduce net | `netCollections` | acceptance 3 | Tested |
| REQ-MEA-04 | Minor units + currency; no cross-currency sums; revenue-to-cost unavailable on zero, missing or mixed denominators; profit ROI unavailable without margin | `lib/money.ts`, `reports.ts` | `units.test.ts` | Tested |
| REQ-MEA-05 | Coverage and freshness shown with outcomes; missing metrics are unavailable, not zero | Reports page | Inspected | Inspected |
| REQ-MEA-06 | Resubmissions are not new submissions | `reports.ts` | `review-regressions.test.ts` | Tested |

## Security, AI, scheduling, UX

| ID | Requirement | Implementation | Evidence | Status |
| --- | --- | --- | --- | --- |
| REQ-SEC-01 | Tenant guard on every tenant query | `lib/db.ts` | `tenant-guard.test.ts` | Tested |
| REQ-SEC-02 | No cross-client access to records, drafts, background results, previews, exports | domain ops + routes | acceptance 4; J4c, J4d, J6 | Tested + Journey |
| REQ-SEC-03 | Sessions re-checked per request; revocation is immediate; invites and resets single-use and hashed; an invite to an existing account needs its password | `lib/session.ts`, `/invite`, `/reset` | `isolation.test.ts` | Tested (sessions) · Inspected (invite) |
| REQ-SEC-04 | SSRF protection with DNS pinned at connect | `lib/net.ts` | `units.test.ts` | Tested |
| REQ-SEC-05 | Secrets never in code or logs; provider errors redacted; encrypted provider tokens | `lib/crypto.ts` | `units.test.ts` redaction | Tested |
| REQ-SEC-06 | Login rate limit; generic auth errors; security headers; app not indexable | `session-actions.ts`, `next.config.mjs`, `robots.ts` | Inspected | Inspected |
| REQ-AI-01 | AI off by default; truthful disabled state | `aiStatus` | `ai-brand.test.ts` | Tested |
| REQ-AI-02 | Per-workspace monthly cap checked before paid work | `generateStructured` | `ai-brand.test.ts` | Tested |
| REQ-AI-03 | Cache keyed by brand version; no cross-brand leakage | `AiCache` | acceptance 11 | Tested |
| REQ-AI-04 | Untrusted sources wrapped as data; output schema-validated | `generateStructured` | Code inspection | Implemented — no live call made |
| REQ-SCH-01 | UTC + IANA zone. A spring-forward gap moves forward; a fall-back overlap takes the first occurrence; daily posts keep local time across DST | `lib/time.ts` | acceptance 8 (`time.test.ts`) | Tested |
| REQ-UX-01 | Navigation: Today, CRM, Content, Websites, SEO, Reports, Settings; active workspace always visible | shell | Inspected at 390/768/1440 | Inspected |
| REQ-UX-02 | Core journeys work end to end | — | J1, J2, J3, J4 | Journey |
| REQ-UX-03 | No overflow, visible focus, labelled controls, ≥24px targets at 390/768/1440 | `globals.css`, components | `a11y-probe.cjs` across 16 screens | Inspected (automated probe) |
| REQ-OPS-01 | Durable leased jobs, retries with backoff, failed-job visibility and retry | `lib/jobs/queue.ts`, Settings → System health | `content.test.ts`, `workflows.test.ts` | Tested |
| REQ-OPS-02 | Data persists across restarts | Postgres | DB and app restarted; journey lead still present (`progress.md`) | Inspected |

## Setup and operations (added 2026-11-04)

| ID | Requirement | Implementation | Evidence | Status |
| --- | --- | --- | --- | --- |
| REQ-SET-01 | Agency creates isolated client workspaces; nothing published or switched on by default | `createClientWorkspace`, Settings → Clients | `setup.test.ts`; J7a | Tested + Journey |
| REQ-SET-02 | Brand profile editor; website/inferred facts always need review; testimonials need attribution | `saveBrandVersion`, `addFact`, `reviewFact` | `setup.test.ts`; J7b–c | Tested + Journey |
| REQ-SET-03 | Pipeline stage editor (one won, one lost, can't drop stages holding deals) | `updateStages` | `setup.test.ts`; J7d | Tested + Journey |
| REQ-SET-04 | Workflow builder with versioning; new workflows start off; assignment trigger reachable | `saveWorkflow`, `assignOwner` | `setup.test.ts`, `ops.test.ts`; J7e | Tested + Journey |
| REQ-OPS-03 | Retention purge (suppression never deleted); health endpoint | `lib/retention.ts`, `/api/health` | `ops.test.ts`; curl | Tested |
| REQ-SEC-07 | Signed flash messages; trusted-proxy IP; per-site allowed origins | `lib/flash.ts`, `lib/client-ip.ts`, forms route | `ops.test.ts`, `review-regressions.test.ts`; J8 | Tested + Journey |
| REQ-UX-04 | WCAG 2.2 AA automated audit | `scripts/axe.cjs` | 23 screens, 0 violations | Inspected (automated) |

## Deferred, outside the MVP

- Public SaaS billing
- Marketplace
- Native apps
- Accounting
- Call centre and voice agents
- Patient records
- Real e-signature and payment processing
