# Operations runbook — Rank Logic SuperTool

Status: Phase 2 · last reviewed 2026-08-24

This is what an operator needs at 3am. It documents the production posture
introduced in Phase 2, the failure modes that posture is designed around, and
the residual risks that Phase 2 did **not** close.

**Nothing here has run in production.** No deployment exists. Every procedure
below was exercised against a local PostgreSQL 16 instance and CI, and that is
the extent of the evidence. Treat each one as reviewed and rehearsed, not as
battle-tested.

---

## 1. Required configuration

| Variable | Required | Effect if unset |
| --- | --- | --- |
| `DATABASE_URL` | yes | The app cannot start. Must be a `postgresql://` URL. |
| `AUTH_SECRET` | yes in production | Refuses to boot in production. In development, falls back to a deliberately obvious key. Must be ≥ 32 characters. |
| `TRUSTED_PROXY_COUNT` | effectively yes behind a proxy | Defaults to `0`, meaning `X-Forwarded-For` is **ignored**. See §4. |
| `CORS_ALLOWED_ORIGINS` | no | Only origins of connected sites get a CORS grant. |
| `HEALTH_TOKEN` | no | The detailed health view is unavailable rather than public. |
| `CRON_SECRET` | no | Scheduled runs are disabled. |

`TRUSTED_PROXY_COUNT` is the one that is easy to get wrong in both directions.
Set it to the number of proxies that will **always** be in front of the app.

- **Too low** (e.g. `0` behind a load balancer): every caller shares one
  rate-limit bucket. Legitimate traffic throttles itself. Annoying, not
  dangerous.
- **Too high**: the app reads an entry the caller controls, and rate limiting
  becomes bypassable by sending a longer header. Dangerous.

When unsure, set it too low.

---

## 2. Database and migrations

PostgreSQL with a reviewed migration history in `supertool/prisma/migrations`.
`prisma db push` is **not** a deployment mechanism — it mutates a schema with no
recorded, reviewable, reversible step. See ADR-009 and ADR-014.

### Deploying a schema change

```bash
# 1. Always back up first. There is no undo for a bad migration.
pg_dump "$DATABASE_URL" > backup-$(date +%Y%m%d-%H%M%S).sql

# 2. Apply. This is the command CI exercises on every run.
npx prisma migrate deploy

# 3. Confirm the migrations and the schema still agree.
npx prisma migrate diff \
  --from-schema-datasource prisma/schema.prisma \
  --to-schema-datamodel prisma/schema.prisma \
  --exit-code
```

Step 3 catches the failure that only shows up at deploy time: migrations that no
longer reproduce the declared schema. CI runs all three on every push.

### Rolling back

Prisma has no `migrate down`. The strategy is **forward-fix**, with restore as
the escape hatch:

1. If the migration is additive and the app is unhappy, roll back the *app* and
   leave the column. An unused column is harmless.
2. If the migration destroyed or transformed data, restore from the backup taken
   in step 1. There is no cleverer option, which is why step 1 is not optional.
3. Write a new forward migration that corrects the state. Never edit an applied
   migration file — it has already run somewhere.

**Not yet rehearsed against production-shaped data.** The migration has been
applied to an empty database and to a local instance. It has never run against a
copy of real customer data, because no such data exists. That rehearsal is a
Phase 2 acceptance criterion that remains open until there is something to
rehearse against.

---

## 3. The job queue

One table, `Job`, plus `JobLock` for recurring activities. No Redis, no SQS —
the load does not justify the operational dependency.

### Reading the queue

```sql
SELECT status, count(*) FROM "Job" GROUP BY status;
SELECT id, kind, attempts, "errorCategory", "lastError"
FROM "Job" WHERE status = 'dead' ORDER BY "finishedAt" DESC LIMIT 20;
```

`GET /api/health` with `Authorization: Bearer $HEALTH_TOKEN` returns the same
counts.

### What each status means

| Status | Meaning | Action |
| --- | --- | --- |
| `queued` | Waiting, or backing off after a retryable failure | None |
| `running` | A worker holds a live lease | None |
| `succeeded` | Done | None |
| `cancelled` | Someone asked it to stop | None |
| `dead` | **Gave up.** Attempts exhausted, or a permanent failure | Investigate |

`dead` is deliberately distinct from `failed`. `failed` would mean one attempt
did not work; `dead` means the system stopped trying. Only `dead` needs a human.

### A job is stuck in `running`

It is not stuck. A lease expires after five minutes; `claimNext` treats a lapsed
lease as claimable, so a worker that died mid-job releases it automatically.
`reapExpiredLeases()` makes that recovery visible in the table rather than
implicit.

If jobs are *repeatedly* going lease-lost, the worker is dying or the work
exceeds the lease. Check `errorCategory = 'lease_lost'` counts before assuming
the queue is broken.

### Draining a bad job

```sql
UPDATE "Job" SET "cancelRequestedAt" = now() WHERE id = '...';
```

A queued job cancels at once. A running job stops at its next checkpoint, so
whatever it has durably written stays written.

---

## 4. Security posture and residual risk

Phase 2 closed these. Each has a regression test named beside it.

| Boundary | Before | After | Test |
| --- | --- | --- | --- |
| Session revocation | Logout deleted the cookie; the JWT stayed valid for 14 days | Server-side `Session` row checked per request | `tests/sessions.test.ts` |
| Roles | `Membership.role` never read; every member could do everything | Enforced per route | `tests/rbac.test.ts` |
| API keys | All-or-nothing, immortal | Scoped, revocable, expiring, quota'd | `tests/apikey-scopes.test.ts` |
| SSRF | Literal hostname only | DNS-resolved, every address checked, every redirect re-checked | `tests/net-fetch.test.ts` |
| Rate limiting | Per-process, keyed on caller-chosen `X-Forwarded-For` | Shared table, trusted-proxy arithmetic | `tests/client-ip.test.ts` |
| CORS | `Access-Control-Allow-Origin: *` | Explicit allowlist, `Vary: Origin` | `tests/api-auth.test.ts` |
| `past_due` | Fully entitled forever | Bounded grace window | `tests/billing.test.ts` |
| Health endpoint | Config and DB errors public | Minimal public, detail behind a token | `tests/health.test.ts` |
| Referral attribution | Caller could assert `engine` | Always derived; provenance recorded | `tests/lead-attribution.test.ts` |
| Secrets in logs | `console.error(err)` | Redacted at the boundary | `tests/observability.test.ts` |

### Residual risks — known and open

1. **DNS rebinding.** The guard resolves and checks every address, then calls
   `fetch`, which resolves again. Between those two resolutions the name can
   change. Closing it properly requires pinning the socket to the validated
   address via a custom agent. The practical attacks are closed; this narrow
   race is not.

2. **The shared rate limiter fails open.** On a database error it allows the
   request. A limiter that fails closed converts a database blip into a total
   sign-in outage. The exposure is the length of the outage.

3. **No worker process is deployed.** The queue, leases and retries are
   implemented and tested, but nothing runs them on a schedule yet. Enqueued
   jobs will sit until a worker exists.

4. **No production migration rehearsal.** See §2.

5. **Backups are documented, not automated.** The `pg_dump` above is a
   procedure, not a cron job. No backup exists because no database exists.

---

## 5. Incident checklist

1. **Is it up?** `GET /api/health` — 200 means the database answers.
2. **Which tenant?** Every log line carries `requestId`, and `orgId` where known.
3. **Is it the queue?** Check `dead` count and `errorCategory` distribution.
4. **Is it a provider?** `errorCategory` of `transient` or `rate_limited` across
   many jobs points outward, not inward.
5. **Did a deploy cause it?** Check whether a migration ran, then run the drift
   check in §2.
6. **Contain.** Cancel offending jobs (§3). Revoke a leaking API key
   (`revokeApiKey`). Revoke sessions for a compromised account
   (`revokeAllSessions`).

Never fix an incident by weakening a Gate 0 or Gate 1 invariant. A measurement
that cannot be taken truthfully is reported as unavailable, including during an
incident.
