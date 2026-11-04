# Backend, security and operations

## Local setup (Windows Git Bash, macOS or Linux)

You need Node 22+ and PostgreSQL 16. The simplest route on Windows is the PostgreSQL installer from postgresql.org, or a free hosted Postgres (Neon or Supabase).

```bash
cd growth-os
npm install
cp .env.example .env        # then fill in values (names only are in the example)
npm run setup               # generate client, apply migrations, load demo data
npm run dev                 # http://localhost:3100
npm run worker              # second terminal: background jobs
```

**Demo sign-in (local fixtures only):**
- Staff: `owner@ranklogic.example`
- Client portal: `client@harborline.example`
- Password for both: the `SEED_PASSWORD` you set in `.env` (no credential is stored in the repo)

These accounts exist only in the seeded demo database. Never seed them into a shared or production database.

## Environment variables (names only)

| Variable | Required | Notes |
| --- | --- | --- |
| `DATABASE_URL`, `DIRECT_URL` | yes | Same value when there is no pooler |
| `TEST_DATABASE_URL` | for tests | Must differ from `DATABASE_URL`; tests refuse otherwise |
| `AUTH_SECRET` | yes | 32+ random bytes. Also derives the token-encryption key. |
| `APP_ORIGIN` | recommended | Used for canonicals and the form same-origin check |
| `LIVE_SENDING_ENABLED`, `LIVE_PUBLISHING_ENABLED`, `AI_LIVE_ENABLED` | no | All default off. Turning one on needs a recorded approval (below). |
| `ANTHROPIC_API_KEY`, `AI_MODEL` | no | Without them AI stays off and templates are used |
| `TRUST_PROXY_HOPS` | recommended in production | Number of proxies that append X-Forwarded-For; unset = don't trust it |
| ContentStudio / Resend keys | no | Not env vars: pasted in Settings → Integrations, stored AES-GCM encrypted per workspace |

## Verification commands

```bash
npm run typecheck
```

```bash
npm run lint
```

```bash
npm test
```

```bash
npm run build
```

```bash
npm run db:seed && node scripts/journeys.cjs
```

```bash
node scripts/screens.mjs replica/screens
```

```bash
node scripts/axe.cjs
```

`npm test` runs 95 behaviour tests. The journeys script makes 26 browser checks and needs `npm start` plus `npm run worker` running. The screens script captures screenshots and runs the a11y probe; `axe.cjs` runs an axe-core WCAG 2.2 AA audit on 23 screens. CI (`.github/workflows/growth-os.yml`) runs audit, migrations, typecheck, lint, tests, build and a seeded smoke test on every change to `growth-os/**`.

## Trust boundaries

1. **Browser → server actions.** Every action calls `requirePermission`. Tenant identity comes from the session row, never from form fields. Next.js server actions also check `Origin` against `Host`.
2. **Public internet → `/api/forms/[site]`.** Defences:
   - same-origin check
   - honeypot field
   - per-IP and per-site rate limits
   - 20 KB size cap
   - zod validation
   - idempotency key
3. **Server → arbitrary URLs (crawler).**
   - The DNS answer is validated inside the socket `lookup`, so the address checked is the address connected to.
   - Private, loopback, link-local, CGNAT and metadata ranges are blocked.
   - Only ports 80/443.
   - Every redirect hop is re-checked.
   - Each fetch is capped at 1.5 MB and 8 s.
4. **Provider and AI output → database.** Output is validated against a schema and never executed. Errors are redacted before storage. Website and upload text is wrapped as untrusted data in prompts.
5. **Worker → effects.** Every effect re-checks pause, approval, suppression, consent and stop rules at execution time.

## Known gaps — production gates (need a decision or approval)

| # | Gap | Risk | Proposed fix | Needs |
| --- | --- | --- | --- | --- |
| G1 | High `npm audit` advisories in production dependencies | — | **Fixed 2026-11-04**: patched `postcss`, `effect`, `deepmerge-ts`, `sharp` via `overrides` (same majors); `zod` upgraded to 4.6.7. Production audit: 0 vulnerabilities. Dev-only moderate advisories remain (vitest, eslint's minimatch). CI now fails on any high production advisory. | — |
| G2 | Auth is DB sessions + bcrypt, not a maintained auth library; no email verification or MFA | Account-security features lag | Evaluate Better Auth / Auth.js before external users; add MFA for owners | Decision |
| G3 | No email delivery for invites/resets | Manual step | **Partly addressed**: Resend sender built for workflow email. Invites and resets still use the copy-the-link flow (2-minute httpOnly cookie). | Wire invites to the sender once live sending is approved |
| G4 | No Postgres row-level security | A future raw-SQL bug could bypass the app's tenant guard | **Deliberately deferred.** RLS needs a per-transaction `set_config('app.workspace_id')`. The lead-intake, page-save and content-edit transactions would each need restructuring to set it first, and a partial version would protect nothing or break their atomicity. Plan: (1) wrap interactive transactions in a `tenantTx(workspaceId, fn)` helper that sets the variable first; (2) route non-transactional tenant queries through a batch transaction that sets it; (3) `ENABLE` + `FORCE ROW LEVEL SECURITY` with a `workspaceId = current_setting(...)` policy per tenant table; (4) give `systemDb` a separate bypass role. | Do before a second agency or external users |
| G5 | Rate limiting trusted the first X-Forwarded-For value | Spoofable | **Fixed**: `TRUST_PROXY_HOPS` decides which entry to trust. When unset, per-visitor limits are skipped (so visitors never share a bucket) and the per-site and per-account limits apply. | Set `TRUST_PROXY_HOPS` on your host |
| G6 | Exported pages couldn't post their form | Lost leads on client domains | **Fixed**: per-site allowed origins; exports post to the absolute `APP_ORIGIN` endpoint and include the key script | — |
| G7 | Refusal fallback missing | No automatic retry on a refusal | **Fixed**: Opus/Sonnet/Fable calls use the beta endpoint with `fallbacks: "default"`; usage is priced at the model that served the request | — |
| G8 | Unsigned flash messages | Crafted links could show misleading text | **Fixed**: HMAC-signed flash parameters; unsigned text is ignored. Flashes now also survive `#anchors`. | — |
| G9 | Ambiguous provider results | Possible double posts | **Fixed for real adapters**: ContentStudio never auto-resends after an unclear result. The dry-run adapter's in-memory lookup remains for tests only. | — |
| G10 | No route loading skeletons | Slow pages show nothing while loading | **Not added**: under Next 15.5, a `loading.tsx` boundary stopped server-action redirects from navigating (reproduced in the browser). Revisit after the Next 16 upgrade. | — |

## Live-action approval policy

A live switch is turned on only with a written approval recorded in `progress.md`. The approval must state:
- the workspaces and accounts it covers
- the content rules
- the budget (AI cap or message volume)
- the schedule
- the stop conditions

The workspace emergency pause overrides every switch. Revoking a membership ends that person's sessions immediately. Jobs re-check workspace pause, approvals and suppression at execution time.

## Migrations

| Migration | Change | Rollback |
| --- | --- | --- |
| `20261103181123_init` | Full schema | Drop database (fresh install only) |
| `20261103184617_marketing_cost` | Adds `MarketingCost` | `DROP TABLE "MarketingCost";` |
| `20261103200000_payment_idempotency` | Adds nullable `Payment.idempotencyKey` + unique index | `DROP INDEX "Payment_workspaceId_idempotencyKey_key"; ALTER TABLE "Payment" DROP COLUMN "idempotencyKey";` |
| `20261104010000_setup_adapters` | Adds `Destination.providerAccountId`, `Integration.meta`, `Site.allowedOrigins`, table `GscRow` | Drop the three columns and `DROP TABLE "GscRow";` |
| `20261104020000_outbound_provider_ref` | Adds `OutboundMessage.providerRef` | `ALTER TABLE "OutboundMessage" DROP COLUMN "providerRef";` |

All five were applied only to the local throwaway dev and test databases in this session. Applying them to any shared or production database requires your approval: `npm run db:deploy`.

## Backup and restore (tested locally 2026-11-03)

```bash
pg_dump -Fc "$DATABASE_URL" -f growthos.dump
```

```bash
createdb growthos_restore && pg_restore --no-owner -d growthos_restore growthos.dump
```

Restored row counts matched the source for Contact (11), Opportunity (11), Payment (3), ContentPiece (3), PageVersion (4), SeoFinding (6) and AuditEvent (13).

## Data retention and deletion (proposed policy)

- **Contacts and opportunities:** kept while the client relationship is active, plus 24 months. Deleting a contact cascades consents and opportunities.
- **Suppression (opt-out) entries:** never deleted. They are what keeps a person from being contacted again.
- **Audit events:** kept for 24 months.
- **Sessions:** revoked rows are kept for 90 days, then purged.
- **Crawl pages:** keep the last 10 runs per site.
- **Healthcare:** marketing inquiries only — no patient histories or clinical notes. The form omits free-text details for healthcare brands.

The worker runs this purge once a day (`src/lib/retention.ts`).

## Monitoring

- `GET /api/health` reports database status, worker backlog (jobs waiting over 5 minutes), failed jobs and the live switches. It contains no secrets or client data.
- Settings → System health lists failed (dead) jobs and lets you retry them.
- The worker logs a line per batch.
- Not connected yet: uptime check, error tracking. Pick these with the host.
