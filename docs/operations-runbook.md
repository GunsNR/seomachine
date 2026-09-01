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
| `DATABASE_URL` | yes | The app cannot start. Runtime traffic; may be a pooled endpoint. |
| `DIRECT_URL` | yes | **Hard error at schema load**, not a fallback. Migrations, `pg_dump`, `pg_restore` and administration. Must not be pooled. Set it equal to `DATABASE_URL` where the provider has no separate direct endpoint. |
| `AUTH_SECRET` | yes in production | Refuses to boot in production. In development, falls back to a deliberately obvious key. Must be ≥ 32 characters. |
| `TRUSTED_PROXY_COUNT` | effectively yes behind a proxy | Defaults to `0`, meaning `X-Forwarded-For` is **ignored**. See §4. |
| `CORS_ALLOWED_ORIGINS` | no | Only origins of connected sites get a CORS grant. |
| `HEALTH_TOKEN` | no | The detailed health view is unavailable rather than public. |
| `CRON_SECRET` | no | Scheduled runs are disabled. |
| `PILOT_MODE` | no | Unset or `false`: signup is **open** — correct for a self-hosted install, wrong for a hosted pilot on a public URL. `true`: invitation-only. **Any other value refuses every signup**, `1`, `yes` and `on` included. See §4. |
| `PILOT_ALLOWED_EMAILS` | yes when `PILOT_MODE=true` | Comma-separated allowlist. With the gate on, a missing, empty or malformed list refuses **every** signup, invited ones included. |
| `PILOT_INVITE_CODE` | yes when `PILOT_MODE=true` | Shared invitation secret, ≥ 32 varied characters (`openssl rand -base64 24`). Missing or weak refuses every signup. Never logged, returned or persisted. Rotate or remove it once the intended accounts exist. |

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
#    Note: pg_dump rejects Prisma's ?schema= parameter — strip it.
pg_dump "${DIRECT_URL%%\?*}" --format=custom --no-owner --no-acl \
  --file backup-$(date +%Y%m%d-%H%M%S).dump

# 2. Apply. This is the command CI exercises on every run.
npm run db:deploy

# 3. Confirm the migrations and the schema still agree.
npm run db:drift

# 4. Confirm nothing is pending or applied outside this history.
npm run db:status
```

Step 3 catches the failure that only shows up at deploy time: migrations that no
longer reproduce the declared schema. CI runs all of it on every push.

### The commands, and which is for what

| Command | Use |
| --- | --- |
| `npm run db:migrate` | **Development only.** Creates a new migration from schema changes and applies it locally. |
| `npm run db:deploy` | Applies existing migrations. Development, CI and production. |
| `npm run db:status` | Reports pending migrations and drift. |
| `npm run db:drift` | Fails if the migrations no longer reproduce the schema. |
| `npm run db:generate` | Regenerates the Prisma client. Touches no database. |
| `npm run db:seed` | Loads the demo workspace. |
| `npm run db:rehearse` | Full migrate → drift → load → dump → restore → verify rehearsal. |
| `npm run setup` | First-run bootstrap: generate, deploy, seed. |

There is deliberately **no `db:push`**. `prisma db push` applies a computed diff
with no recorded, reviewable, reversible step, and
`tests/migration-safety.test.ts` fails the build if it returns to any package
script, workflow, shell script or test.

### Rehearsing a restore

```bash
npm run db:rehearse -- --report rehearsal-$(date +%Y%m%d).json
```

Creates disposable databases, applies migrations, loads a synthetic
production-shaped dataset, dumps, restores into an isolated database, and
compares integrity field by field. Runs in CI on every push. The full hosted
procedure is `docs/hosted-postgres-validation.md`.

### Recovering from a failed migration

Prisma has no `migrate down`. The strategy is **forward-fix**, with restore as
the escape hatch:

1. If the migration is additive and the app is unhappy, roll back the *app* and
   leave the column. An unused column is harmless.
2. If the migration destroyed or transformed data, restore from the backup taken
   in step 1. There is no cleverer option, which is why step 1 is not optional.
3. Write a new forward migration that corrects the state. Never edit an applied
   migration file — it has already run somewhere.

#### Why forward-fix rather than rollback

Not a preference. Prisma's supported recovery surface is
`migrate resolve --applied|--rolled-back`, and `--rolled-back` is **only valid
for a migration Prisma recorded as failed** — it errors on one that succeeded.
Undoing a *successful* migration therefore means hand-writing a down script
(`migrate diff --to-migrations --script`, applied with `db execute`) and then
hand-editing `_prisma_migrations`: two unsupported operations that manufacture
exactly the drift `npm run db:drift` exists to catch. And a down script cannot
bring back data — re-adding a dropped column gives you a column of nulls. So
forward-fix is the default, and restore is the answer for the one case
forward-fix cannot address.

#### What a failed migration actually looks like

Measured, not assumed — `npm run db:recovery-drill` observes this on every CI
run rather than hard-coding it:

PostgreSQL applies DDL transactionally and Prisma sends a migration as one
implicit transaction, so **a migration whose statements can all run inside a
transaction leaves the schema untouched when it fails**. What it damages is the
*history*: `_prisma_migrations` keeps a row with `finished_at` null, and every
subsequent `prisma migrate deploy` — including migrations that have nothing to do
with the failure — refuses with **P3009**.

For that class of migration the incident is a wedged deployment pipeline, not a
corrupt schema, so check the history before hunting for half-applied DDL.

**The exception, and it matters here.** Some statements cannot run inside a
transaction — `CREATE INDEX CONCURRENTLY` above all, and several `ALTER TYPE`
forms. A migration containing one of those *can* genuinely leave a half-applied
schema, and the reassurance above does not apply to it. The drill rehearses the
transactional case only, so if the failed migration contains a
non-transactional statement, inspect the schema directly — do not assume it
rolled back.

#### The recovery, command by command

```bash
# 1. See it. Prisma names the failed migration and prints the fix.
npm run db:status

# 2. Undo any partial schema change. On PostgreSQL there is usually none, but
#    run it anyway — write it idempotently (DROP ... IF EXISTS) and it costs
#    nothing to be sure.
npx prisma db execute --url "$DIRECT_URL" --file undo.sql

# 3. Tell Prisma the migration is not applied.
npx prisma migrate resolve --rolled-back "<migration_name>"

# 4. Withdraw or correct the bad migration in the repository. A rolled-back
#    migration that is still in prisma/migrations/ WILL BE RETRIED by the next
#    deploy. Withdrawing it is safe precisely because it never applied.

# 5. Redeploy and prove the pipeline is unwedged.
npm run db:deploy
npm run db:status
npm run db:drift

# 6. Ship the corrected migration as a NEW migration. Never edit the failed one:
#    Prisma has recorded its checksum, and changing it turns one recoverable
#    incident into permanent drift.
npm run db:deploy
```

#### Restore instead, when

Forward-fix is the default, but it cannot invent data. Restore from the
pre-migration backup when **the migration destroyed or transformed data** — a
dropped column, a narrowed type, a backfill that wrote wrong values, a `DELETE`
that removed rows to satisfy a constraint. Also restore when drift is detected
*after* applying, since the database no longer matches any reviewed history.
Expect to lose everything written between the backup and the restore, and know
that window before you start.

#### The drill

```bash
npm run db:recovery-drill -- --report drill-$(date +%Y%m%d).json
```

Stages the incident above against disposable databases — a migration asserting
one measurement run per project per UTC day, which legitimate same-day runs
violate — and then executes the recovery, step by step, asserting each one. It
runs in CI on every push and fails the build if the incident does not occur, if
recovery does not produce a zero-drift deployable schema, or if any tenant row
changes along the way. Its rehearsal migrations live in
`supertool/scripts/rehearsal-migrations/` and are never added to the product's
history; `tests/migration-recovery-drill.test.ts` fails the build if one is.

See `docs/evidence/2026-08-31-migration-recovery-drill.md` for what the drill
proves and, more importantly, what it does not.

**Rehearsed, but never against a hosted provider.** `npm run db:rehearse` runs
the whole migrate → dump → restore → verify cycle against a synthetic
production-*shaped* dataset, and CI executes it on every push. What has not
happened is the same procedure against a hosted endpoint, which is the only
thing that can tell you about that provider's pooler, connection limits, TLS,
latency, backup tooling or behaviour at production *volume*. See
`docs/hosted-postgres-validation.md` §2 for exactly what remains unproven.

**One constraint worth knowing before you provision:** the migrations qualify
every object as `"public"."Table"`, so the target database must use the `public`
schema.

---

## 3. The job queue

One table, `Job`, plus `JobLock` for recurring activities. No Redis, no SQS —
the load does not justify the operational dependency.

### Running a worker

```bash
npm run worker          # from supertool/
```

It claims jobs, renews its lease while it works, reaps lapsed leases on a
schedule, and backs off when the queue is empty. Several may run at once:
claiming is a conditional update, so two workers cannot take the same job.

Environment: the same `DATABASE_URL` and `DIRECT_URL` as the web process, plus
whatever provider credentials the work needs. The worker reads credentials from
the environment and never from a job payload.

| Variable | Default | What it changes |
| --- | --- | --- |
| `WORKER_IDLE_MIN_MS` | `1000` | First delay after an empty poll |
| `WORKER_IDLE_MAX_MS` | `15000` | Ceiling that backoff climbs to |
| `WORKER_REAP_INTERVAL_MS` | `60000` | How often lapsed leases are swept |
| `WORKER_SHUTDOWN_GRACE_MS` | `30000` | How long SIGTERM waits before exiting non-zero |

**Stopping it.** SIGTERM stops new claims and lets the job in hand reach its
next checkpoint, then hands that job back to the queue as `queued` with
`errorCategory = 'transient'`. Nothing is abandoned silently. A second SIGTERM
exits immediately and says so in the log. Send the signal to the worker process
itself — a `npm run` or `npx` wrapper in between may not forward it, in which
case the process is killed rather than drained.

**Job kinds are an allowlist.** `src/lib/jobs/handlers/index.ts` names every
kind a worker will execute. A row with any other `kind` goes straight to `dead`
rather than being attempted, so a typo or a half-rolled-back deploy is visible
in the table instead of being run.

### Kinds

| Kind | What it does | Producers |
| --- | --- | --- |
| `measurement.run` | Executes one `MeasurementRun` over the project's prompt set | `POST /api/app/run-check`, `GET/POST /api/cron/run-checks` |

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
| SSRF | Literal hostname only | DNS-resolved, every address checked, socket pinned to the checked address, every redirect re-checked and re-pinned | `tests/net-fetch.test.ts`, `tests/net-pinned.test.ts`, `tests/ip-address.test.ts` |
| Rate limiting | Per-process, keyed on caller-chosen `X-Forwarded-For` | Shared table, trusted-proxy arithmetic | `tests/client-ip.test.ts` |
| CORS | `Access-Control-Allow-Origin: *` | Explicit allowlist, `Vary: Origin` | `tests/api-auth.test.ts` |
| `past_due` | Fully entitled forever | Bounded grace window | `tests/billing.test.ts` |
| Health endpoint | Config and DB errors public | Minimal public, detail behind a token | `tests/health.test.ts` |
| Referral attribution | Caller could assert `engine` | Always derived; provenance recorded | `tests/lead-attribution.test.ts` |
| Secrets in logs | `console.error(err)` | Redacted at the boundary | `tests/observability.test.ts` |

### The private-pilot signup gate

Signup is open by default. That is correct for a self-hosted install — there is
nobody to issue an invitation — and wrong for a hosted pilot, where the URL is
public and the intended user list has one name on it. `PILOT_MODE=true`,
`PILOT_ALLOWED_EMAILS` and `PILOT_INVITE_CODE` close it. **All three are
required together**: with the gate on, an allowlisted address presenting the
wrong code is refused, and so is the correct code from an address that is not
on the list.

`PILOT_MODE` has three states, and the third is the one worth reading twice:

| Value | Effect |
| --- | --- |
| unset, or `false` | Signup is open. A deployment may legitimately want this. |
| `true` | Invitation-only. |
| anything else | **Configuration error. Every signup is refused.** |

`1`, `yes` and `on` land in the third row. Someone who writes one of those meant
to close the door; reading the value as "not `true`, therefore open" would leave
a public signup form on a deployment whose owner believes it is shut, which is
the worst of the three possible readings.

Five properties are worth knowing before you rely on any of it:

- **The gate is in the route, not the page.** `POST /api/auth/signup` enforces
  it. A caller with `curl`, no browser, and no `inviteCode` field at all is
  refused identically.
- **It fails closed, on every input.** A bad mode flag, a missing, empty or
  malformed allowlist, or a missing or weak invitation code each refuse every
  signup rather than falling back to open. One malformed allowlist entry
  invalidates the whole list on purpose: silently dropping one address would
  lock a person out while the deployment looked healthy.
- **Refusals are indistinguishable.** Wrong code, uninvited address, broken
  configuration and "account already exists" all return the same status and the
  same message, so the form cannot be used to discover who is invited, who is
  registered, or whether a code was close. The address and the code are checked
  without short-circuiting, so a wrong address and a wrong code also cost the
  same time. The cost of all this is that a broken configuration is invisible
  from outside — read `checks.signup` in the detailed health view, which reports
  `invitation-only` or `misconfigured:<reason>` naming the wrong variable, and
  watch for the `signup: pilot configuration is unusable` log line.
- **The code never appears anywhere but the comparison.** It is not logged, not
  returned, not persisted, and not hashed into a log line. Comparison is
  constant-time over SHA-256 digests of both sides, so neither its value nor its
  length leaks through timing or through a length-mismatch shortcut.
- **It governs account creation only.** Sign-in and password reset never read
  any of it. An existing user never needs the code, removing their address
  cannot lock them out of an account they already hold, and adding an address
  grants nothing until someone signs up with it.

**Rotate or remove the code once the intended accounts exist.** It is a single
shared secret, not a per-person token: every invitee holds the same string, and
anyone they forward it to can sign up for as long as their address is still
listed. Replacing `PILOT_INVITE_CODE`, or clearing `PILOT_ALLOWED_EMAILS` —
which fails closed rather than opening up — costs nothing and shuts that window.
Existing accounts are unaffected by either.

What this still does **not** do: it is not a per-person invitation. Two people
sharing one code are indistinguishable to the server, and nothing expires on its
own. A wider programme needs single-use invitations, which this is not.

Behaviour is covered by `tests/pilot.test.ts` and `tests/pilot-signup.test.ts`.

### Closed since the last release

**DNS rebinding.** The guard used to resolve and check an address, then hand
the *hostname* to `fetch`, which resolved it again — so an attacker serving a
zero-TTL record answered the second lookup with the address the first one had
refused. Outbound requests now connect to the address that was checked
(`src/lib/net-pinned.ts`), and each redirect hop is resolved, checked and
pinned on its own. Operationally this means a blocked destination is now
reported as blocked at connection time rather than being reachable through a
racing DNS answer, and `Blocked` in a crawl result is a decision the product
made, not one it hoped for.

**Redirect replay and resolver hangs.** A redirect could still choose what was
*sent* to the host it named, even after the pin fixed where the request went.
Cross-origin hops that would repeat a non-GET method or a request body are now
refused, a 303 and a POST-answering 302 become GET with the body dropped, and
`Proxy-Authorization` is stripped alongside the other credentials. DNS
resolution runs inside the request's remaining timeout instead of before the
clock is read. Operationally: a publish to a site stored as `http://` that
redirects to `https://` now arrives as a GET and does not publish — store the
`https://` URL. See ADR-017.

### Residual risks — known and open

1. **The shared rate limiter fails open.** On a database error it allows the
   request. A limiter that fails closed converts a database blip into a total
   sign-in outage. The exposure is the length of the outage.

2. **No worker process is deployed.** The entrypoint exists and runs
   (`npm run worker`), and `measurement.run` is wired end to end from producer
   to completion, but nothing runs it in a hosted environment yet. Enqueued
   jobs will sit until a worker process is deployed alongside the web process.
   Until then a measurement queued from the dashboard stays `queued`, which the
   UI reports truthfully rather than as progress.

3. **No production migration rehearsal.** See §2.

4. **A pinned request does not fail over to a second address.** Every address
   a name resolves to is validated, but only one is connected to. A
   multi-homed host whose first address is unreachable fails the request
   instead of trying the next, where the previous implementation would have
   fallen back. This is the deliberate cost of pinning — see ADR-016 — and it
   shows up as a connection failure, never as a wrong destination.

5. **A timed-out DNS lookup is abandoned, not cancelled.** `dns.lookup` offers
   no cancellation, so a resolver that blows its budget may still be in flight
   after the request has failed. Nothing is learned from it and no socket is
   opened, but the operating system's resolver work continues until it
   finishes on its own.

6. **Backups are documented, not automated.** The `pg_dump` above is a
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
