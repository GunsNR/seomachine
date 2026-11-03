# Architecture

Status: decided 2026-11-03 (reversible). Starting commit `seomachine@211fc45`.

## Decision 1: where Growth OS lives

**Recommendation:** a new sibling app at `seomachine/growth-os/`. SuperTool (`supertool/`) is untouched.

Why:
- SuperTool's constitution scopes it to an SEO SaaS. Adding CRM, social publishing and a site builder would be a material product change that needs owner sign-off (§10).
- The same stack (Next.js 15, Prisma 6, Postgres) and patterns (DB sessions, leased jobs, guarded fetch) were reused by design, not by import. Each product can therefore change independently.
- The approved ADR-012 palette could be used here immediately. SuperTool's palette is frozen until its Phase 5.

Alternatives rejected:
- **Extend SuperTool.** Rejected for scope and governance reasons, and because its CI gates would apply.
- **Separate repository.** Rejected for now: it adds setup friction and has no benefit at pilot scale.

## Decision 2: build, buy, or configure HighLevel / ContentStudio

**Recommendation:** own the domain model, app, client data, brand memory, approvals and reporting. Use replaceable adapters for commodity delivery (email, publishing, calendars, analytics). No subscription is required to run the MVP.

| Option | Verdict |
| --- | --- |
| Configure existing HighLevel | Not chosen as system of record. Its CRM, calendars and API v2 are real (research row 1). Basic API is on Starter at $97/mo. But choosing it moves the data, approvals and attribution rules outside our control and adds recurring cost per agency. It remains a possible *adapter* later, behind one-way import with external IDs. |
| ContentStudio as the publishing engine | **Recommended as the first real publishing adapter** once approved. It is a public REST API covering 11 networks, $15/mo on the API plan (research row 2). It lets us skip Meta, LinkedIn and TikTok app reviews. Approval and queue logic stay ours; ContentStudio only receives already-approved posts. |
| Fully independent direct integrations | Deferred. Meta, LinkedIn and TikTok each need app review or partner status (research rows 3–5). |

## System of record per entity

| Entity | System of record | Notes |
| --- | --- | --- |
| Workspace, membership, roles | Growth OS | |
| Contact, company, opportunity, task, activity | Growth OS | If a HighLevel adapter is added later: one-way import first, `externalId` per row, Growth OS wins on conflict, webhook events deduped by provider event id |
| Booking | Growth OS (manual), calendar provider (future) | A provider booking will carry `source=provider`, `verified=true` |
| Payment | Growth OS (manual) | A future payment provider writes rows with `providerEventId` (unique) |
| Brand profile, facts | Growth OS | Versioned. Generators read only the current approved version. |
| Content, approval, publication | Growth OS | Provider receives approved versions only. Delivery status is reconciled back. |
| Site, page, version | Growth OS | Served at `/s/<site>/`; HTML export available |
| SEO findings | Growth OS | GSC/GA4 data would be stored as dated, sourced snapshots |

## Shape

```
Next.js app (server components + server actions)        worker (tsx src/worker)
  ├─ /app      staff UI (7 sections)                       └─ claims Job rows (FOR UPDATE SKIP LOCKED)
  ├─ /portal   client portal (3 screens)                       ├─ workflow.step
  ├─ /s/*      public client sites, sitemap, robots            ├─ publication.dispatch / reconcile
  ├─ /preview  private, noindex                                └─ seo.crawl
  └─ /api      forms (public), assets, exports
            │
            ▼
   src/lib (domain)  ──  tenant-guarded Prisma client  ──  PostgreSQL (single DB)
```

- **One modular monolith, one database.** No microservices, no vector DB, no agent framework, no Redis. The job queue and rate limiter are Postgres tables.
- **Tenancy:**
  - Every tenant row has `workspaceId`.
  - `src/lib/db.ts` refuses any tenant-model query without it.
  - Every read is re-scoped from the session, never from a client-supplied id alone.
  - Postgres row-level security is a production gate (see `backend.md`).
- **AI:** adapter only (`src/lib/ai/provider.ts`), off by default, budget-capped and schema-validated, with output cached per brand version. AI proposes; server code validates permissions and performs the action.
- **Money:** integer minor units plus explicit currency. Never summed across currencies.
- **Time:** UTC instants plus an IANA zone. DST rules are in `spec.md` REQ-SCH-01.

## Recurring cost model (as of 2026-11-03)

| Item | Now | When switched on | Source |
| --- | --- | --- | --- |
| Local app + Postgres | $0 | — | — |
| Hosting (app + managed Postgres + worker) | $0 (not deployed) | **Unknown — needs a quote.** Choose a host first. | — |
| ContentStudio API | $0 | $15/mo (3,000 requests/mo) | Vendor research row 2, Verified |
| HighLevel | $0 | Not needed. Starter $97/mo if ever used as an adapter. | Research row 1a, Verified |
| Ahrefs API | $0 | Lite $129/mo listed with API, but API eligibility wording conflicts. Verify before buying. | Research row 11, Conflicting |
| Anthropic API | $0 (AI off) | Per token: Opus 5.5 $4/$20, Haiku 5.5 $0.10/$0.50 per 1M in/out. Capped per workspace. | claude-api skill table, cached 2026-10-06 |
| Email sending provider | $0 | Unknown until chosen | — |
