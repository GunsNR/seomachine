# Hosted PostgreSQL provisioning attempt — 2026-08-25

Status: **not provisioned — blocked by network egress policy**

This records an authorized attempt to create the hosted PostgreSQL staging
environment for the private Rank Logic pilot, what stopped it, and what was
executed instead. It is evidence only: no capability claim changes as a result,
and Phase 2's hosted acceptance criterion remains open.

---

## 1. What was authorized

One Railway free-trial account and project named `ranklogic-pilot`, with a
single PostgreSQL 16 staging database in a US East region, `public` schema,
credentials held outside the repository. Explicitly **not** authorized, and not
attempted: any paid plan, card charge, public app deployment, custom domain,
customer-data upload, or additional external service.

## 2. What happened

The Railway CLI (`@railway/cli` 5.43.3, the official CLI) was installed and
`railway login --browserless` was run. It never reached the point of issuing a
device-authorization URL or pairing code, so there was nothing to present for
approval. The request failed at the network layer:

```
error sending request for url (https://backboard.railway.com/oauth/device/auth)
Caused by:
    0: client error (Connect)
    1: tunnel error: unsuccessful
```

The session's egress proxy recorded the reason:

```json
{
  "kind": "connect_rejected",
  "detail": "gateway answered 403 to CONNECT (policy denial or upstream failure)",
  "host": "backboard.railway.com:443"
}
```

`backboard.railway.com`, `railway.com`, `railway.app` and `api.railway.app` are
all unreachable from this environment. Per the proxy's own operating
instructions, a 403 CONNECT is an organization egress-policy denial and must be
reported rather than retried or routed around. No workaround was attempted.

### A second, independent blocker

Even with a credential in hand, this environment could not have validated a
hosted database. The egress proxy carries HTTPS CONNECT only; raw TCP to
PostgreSQL's port is not routed:

```
TCP 5432 to an external host: blocked/unreachable
```

Prisma, `psql`, `pg_dump` and `pg_restore` all speak raw TCP on 5432. So the
hosted portion of this task is blocked twice over, and clearing only the
Railway control-plane denial would not be sufficient.

## 3. What was executed instead

The full procedure in `hosted-postgres-validation.md` was run end to end against
a **local** PostgreSQL 16 cluster with synthetic data, to confirm the tooling,
migrations and runbook commands are correct and ready for the hosted run.

| Command | Result |
| --- | --- |
| `npm run db:deploy` | Both migrations applied to an empty database |
| `npm run db:status` | `Database schema is up to date!` |
| `npm run db:drift` | `No difference detected.` — exit 0 |
| `npm run db:rehearse` | Passed, 5118 ms, 14/14 steps |

Rehearsal integrity, source vs restored — identical on every field:

```
organizations 2 · projects 4 · measurementRuns 8 · observations 24
jobs 4 · sessions 2 · apiKeys 4
orphanedProjects 0 · orphanedObservations 0
observedCount 8 · failedCount 8 · unavailableCount 8
daysWithMultipleRuns 1 · keysWithoutScopes 0 · keysWithQuota 4
idempotencyConstraintEnforced true
```

Environment recorded:

- Server: `PostgreSQL 16.13 (Ubuntu 16.13-0ubuntu0.24.04.1) on x86_64-pc-linux-gnu`
- Client: `pg_dump (PostgreSQL) 16.13` — major version matches the server
- Prisma: `6.16.2`
- Migration SHA: `eb57f0823dbc43c69e3d0d485b2d8983f696ad57` (main, PR #6 merge)
- Migrations: `20260824172219_phase2_production_foundation`,
  `20260824173435_phase2_lead_attribution_provenance`

Full machine-readable report: `2026-08-25-rehearsal-local-pg16.json`. It was
scanned for credentials before being committed; it contains none, and no
connection string appears in it.

Data used was synthetic throughout — generated in-process by the rehearsal
script, which reads from no external source. No customer data was involved.

## 4. What this evidence does and does not establish

**Established:** the migrations apply cleanly to an empty PostgreSQL 16 database,
produce zero drift, and survive a `pg_dump`/`pg_restore` round trip with tenant
scoping, run identity, observation provenance, API-key scopes and the
idempotency constraint all intact.

This duplicates what CI already proves on every push. It is preparation for the
hosted run, not a substitute for it.

**Not established — every one of these remains open:**

| Requested check | State |
| --- | --- |
| Migration against the hosted target | Not run — no hosted target |
| Backup / restore on the provider | Not run. `pg_dump`/`pg_restore` was exercised locally; Railway's own snapshot and PITR mechanisms are separate and untested |
| Tenant integrity on hosted data | Verified locally only |
| TLS | A local connection negotiated TLSv1.3 / `TLS_AES_256_GCM_SHA384`, which says nothing about Railway's certificate chain, `sslmode` requirements, or whether the provider enforces TLS |
| Connectivity | Local loopback only |
| PostgreSQL version | 16.13 locally; the hosted server's exact patch level is unknown |
| Observed latency | **Not measured.** Every timing above is loopback and reflects local process and disk behaviour. No number here may be read as a hosted latency figure |
| Pooler behaviour, connection limits, production data volume | Unproven, per §2 of the validation runbook |

## 5. What would unblock this

Either of these, and both are the product owner's to arrange:

1. Egress policy permitting this environment to reach the provider's control
   plane (`backboard.railway.com` and related hosts) **and** outbound TCP 5432
   to the database endpoint.
2. The procedure run from an environment that already has both — a local
   machine or a CI runner with unrestricted egress — following
   `hosted-postgres-validation.md` §1 and filing the `--report` JSON here.

Until one of them happens, no claim of hosted validation may be made anywhere in
this repository or in any public-facing material.
