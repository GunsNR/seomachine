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

`npm test` runs 69 behaviour tests. The journeys script makes 20 browser checks and needs `npm start` plus `npm run worker` running. The screens script captures screenshots and runs the a11y probe.

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
| G1 | `npm audit --omit=dev`: high advisories in transitive deps — `effect` and `deepmerge-ts` (via Prisma 6), `postcss` and `sharp` (via Next 15), `zod <4.6.6` | Mostly build-time or not reachable (no image optimisation of untrusted uploads), but unverified | Upgrade to Prisma 7, Next 16 and zod 4 in one reviewed change | **Your approval** (major upgrades) |
| G2 | Auth is DB sessions + bcrypt, modelled on SuperTool's reviewed design. It is not a maintained auth library. No email verification and no MFA. | Account-security features lag | Evaluate Better Auth / Auth.js before external users; add MFA for owners | Decision |
| G3 | No email delivery: invites and resets are one-time links the owner copies (2-minute httpOnly cookie, never in the URL) | Manual step | Connect a transactional email provider | Spending + domain DNS |
| G4 | No Postgres row-level security; isolation relies on the app-level tenant guard plus re-scoped reads | A future raw-SQL bug could bypass the guard | Add RLS policies keyed on `app.workspace_id`, set per transaction | Migration approval |
| G5 | Rate limiting trusts the first `X-Forwarded-For` value | Spoofable if not behind a proxy that overwrites it | Configure the host's trusted-proxy header | Hosting choice |
| G6 | An exported HTML page posts its form to Growth OS, which rejects other origins | Exported forms fail on a client's own domain | Per-site allowed-origin list | Small change |
| G7 | claude-api skill default: add server-side `fallbacks` for Opus 5.5. Not added while AI is off. | Refusals would surface as "declined" with no automatic retry | Switch the AI call to the beta messages endpoint with `fallbacks: "default"` when enabling AI | When AI is approved |
| G8 | Flash messages come from the `?ok=` / `?error=` query string | A crafted link can show misleading text (no script injection; React escapes it) | Move flashes to a signed cookie | Small change |
| G9 | The dry-run adapter's "accepted" memory is per process | After a restart, an ambiguous dry-run post would be re-simulated | Real adapters must look up by idempotency key at the provider | Part of the first real adapter |

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

All three were applied only to the local throwaway dev and test databases in this session. Applying them to any shared or production database requires your approval: `npm run db:deploy`.

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

A purge job is not built yet (tracked in `progress.md`).

## Monitoring

- Settings → System health lists failed (dead) jobs and lets you retry them.
- The worker logs a line per batch.
- Not connected yet: uptime check, error tracking. Pick these with the host.
