# Hosted PostgreSQL validation — Railway — 2026-08-25

Status: **executed against a hosted database — passed**

This is the hosted run of `docs/hosted-postgres-validation.md`. It supersedes
[the blocked provisioning attempt](2026-08-25-hosted-postgres-provisioning-attempt.md)
recorded earlier the same day, which reached no database at all.

Machine-readable evidence: [`2026-08-25-hosted-railway-report.json`](2026-08-25-hosted-railway-report.json).

Phase 2 remains `in-progress`. Two of its acceptance criteria are now met and
the rest are untouched, so **no capability claim moves as a result of this run**.

---

## 1. What was validated, and where

| | |
| --- | --- |
| Provider | Railway, Hobby plan, $5 included usage |
| Project / environment | `rank-logic-pilot` / `production` |
| Database | PostgreSQL **16.15** (Debian 16.15-1.pgdg13+2), image `ghcr.io/railwayapp-templates/postgres-ssl:16` |
| Database region | `iad` (US East) |
| Runner region | `iad` (US East) — same region, so the latency figures are not cross-region |
| Client tools | `pg_dump` / `pg_restore` **16.15** (Debian 16.15-1.pgdg12+2) |
| Prisma | 6.16.2 |
| Commit under test | `458b32bf0128f2dbd66ffeda71fc46ce4e35c707` |

The database was reachable **only** over Railway's private network. It has no
public TCP proxy, no `DATABASE_PUBLIC_URL` and no domain, and none was created.
No database credential was read, printed, logged, committed or documented at any
point; the runner received the connection string as a Railway reference variable
(`${{Postgres.DATABASE_URL}}`) that no human or agent ever resolved.

## 2. Results

### The database Railway provisioned, migrated in place

Not a database the rehearsal created for itself — the real one.

| Command | Exit | Output |
| --- | --- | --- |
| `prisma migrate deploy` | 0 | `All migrations have been successfully applied.` |
| `prisma migrate status` | 0 | `Database schema is up to date!` |
| `prisma migrate diff --exit-code` | 0 | `No difference detected.` |

Both migrations applied: `20260824172219_phase2_production_foundation` and
`20260824173435_phase2_lead_attribution_provenance`.

### The full rehearsal

`scripts/db-rehearse.mjs`, byte-identical to the file at the commit under test,
pointed at the hosted `DIRECT_URL`. Exit 0, 14 of 14 steps passed, 5319 ms.

| Step | ms |
| --- | --- |
| Check `pg_dump`/`pg_restore` present and compatible | 51 |
| Read server version | 78 |
| Create empty source database | 205 |
| Apply migrations with `migrate deploy` | 1291 |
| Confirm zero drift | 1095 |
| Confirm migration status is applied | 1129 |
| Load representative dataset | 271 |
| Check integrity (source) | 108 |
| Back up with `pg_dump` | 138 |
| Create isolated restore target | 378 |
| Restore with `pg_restore` | 472 |
| Check integrity (restored) | 100 |
| Compare source and restored | 0 |
| Assert the dataset was actually loaded | 0 |

Source and restored integrity were **identical on every field**: 2 organizations,
4 projects, 8 measurement runs, 24 observations (8 observed / 8 failed /
8 unavailable), 4 jobs, 2 sessions, 4 API keys, 0 orphaned projects, 0 orphaned
observations, 1 day carrying multiple runs, 0 keys without scopes, 4 keys with a
quota, idempotency constraint still enforced after restore.

The dataset is synthetic and generated in-process. No customer data existed on
this instance at any point.

### TLS

| Mode | Result |
| --- | --- |
| `sslmode=require` | Connected, **encrypted: TLSv1.3, TLS_AES_256_GCM_SHA384, 256-bit** |
| `sslmode=disable` | **Also connected** |
| `sslmode=verify-full` | Refused — no trusted root for the server certificate |

Server reports `ssl = on`.

Two findings here deserve to be read plainly rather than as a green tick:

- **TLS is available, not enforced.** The server accepted an unencrypted
  connection. On a private-network-only instance that is defensible, but an
  application must be configured to *require* TLS rather than assume it.
- **The certificate is self-signed**, so `verify-full` cannot succeed. This is
  encryption without certificate-chain authentication, and it is not evidence
  about any public endpoint, because there is none.

### Latency

Round trips from the runner to the database, both inside Railway's private
network, same region, 50 samples of `SELECT 1`:

| min | p50 | p95 | max |
| --- | --- | --- | --- |
| 0.473 ms | 0.666 ms | 1.732 ms | 3.546 ms |

First connect was 71.481 ms, which **includes Prisma query-engine startup and the
TLS handshake** and is therefore not a network figure. Use the per-query numbers.

These are figures for an idle trial instance. They say nothing about application
concurrency, a pooled endpoint, or production data volume.

## 3. How the evidence was retrieved, and its limits

The runner served exactly three routes: `/health` returning only `OK`
unauthenticated, `/status` returning only a phase name, and `/report` returning
the sanitized JSON once to a caller holding a cryptographically random bearer
token, burned after one delivery. No route returned an environment variable,
a connection string, stdout, or a stack trace.

**The report was not retrieved over that endpoint.** This session's egress policy
answers `403` to `CONNECT` for `*.up.railway.app`, exactly as it does for the
Railway control plane — the same denial recorded in the earlier attempt. The
temporary domain was created and the listener bound to `:8080`, but no external
request ever reached it and Railway's HTTP proxy logs for the deployment are
empty. The evidence came instead from the container's stdout via the Railway MCP
logs API, as sanitized base64, and was scanned for `postgres://`, `postgresql://`,
userinfo pairs, `*.railway.internal`, `*.railway.app`, both bearer tokens and
credential keywords before being written to this directory. It was clean.

The runner redacted its own output before emitting it, and refused to emit
anything that still matched a credential shape.

### One honest caveat about the migration SHA

The runner carried the repository's files without their git history, so
`scripts/db-rehearse.mjs` — which reads `git rev-parse HEAD` — reported a
synthetic local commit, recorded in the JSON as `localWorktreeSha`. The real
commit travels separately as `sourceCommit`, and the payload's SHA-256 was
computed before upload and re-verified inside the container
(`payloadSha256Matches: true`), which is what actually ties this run to
`458b32b`.

## 4. What this still does not prove

Unchanged from §2 of the runbook, and none of it was exercised:

- **Pooler behaviour.** This database has no separate pooled endpoint.
- **Connection limits** under application concurrency.
- **Railway's own snapshot/PITR backup path.** `pg_dump`/`pg_restore` is the
  portable path only; provider-native backup is a separate mechanism with
  separate failure modes and needs its own rehearsal.
- **Production data volume.** Twenty-four observations is production-*shaped*,
  not production-*sized*.
- **Certificate-chain verification against a public CA.**
- **Failure injection.** Killing a migration mid-run was not attempted.

## 5. State left behind

- The `rank-logic-pilot` PostgreSQL service is **still private-network-only**.
  No TCP proxy, no domain, volume and data intact.
- Its primary database now carries the Phase 2 schema, applied by this run.
- The rehearsal's disposable databases dropped themselves, as designed.
- **Teardown is incomplete.** Deleting a Railway service requires two-factor
  verification in the dashboard, which an API/MCP token cannot supply, so the
  temporary `validation-runner` service and its domain
  (plus `validation-runner-iad`, an empty service created while diagnosing the
  region fault) are **staged for deletion and awaiting a human apply**. Pending
  that, the runner was neutralized: both bearer tokens were rotated to fresh
  random values, the payload variables were cleared, and its start command now
  exits immediately so nothing listens on the domain.
