# Migration recovery drill — 2026-08-31

Phase 2 criterion 3 reads: *"Restoration and rollback or forward-fix have been
rehearsed."* Restoration was rehearsed on 2026-08-25
(`2026-08-25-hosted-postgres-validation-railway.md`). This is the other half.

Machine-readable result: `2026-08-31-migration-recovery-drill.json`.
Reproduce with `npm run db:recovery-drill` from `supertool/`; CI runs it on
every push.

---

## 1. The strategy, and why

**Forward-fix, with restore from backup as the escape hatch.**

Prisma's supported recovery surface is `prisma migrate resolve`, which takes
`--applied` or `--rolled-back`. `--rolled-back` is valid **only for a migration
Prisma recorded as failed**; it errors on one that succeeded. So undoing a
*successful* migration is not a supported operation at all — it requires a
hand-written down script (`migrate diff --to-migrations --script`, applied via
`db execute`) plus a hand-edit of `_prisma_migrations`. Both manufacture exactly
the drift `npm run db:drift` exists to detect, and neither can recover data: a
down script that re-adds a dropped column gives you a column of nulls.

Restore is therefore not a worse rollback, it is the *only* remedy for one
specific class of failure — see §6.

---

## 2. The incident rehearsed

A migration denormalises the UTC day onto `MeasurementRun` and then enforces one
run per project per day:

```sql
ALTER TABLE "MeasurementRun" ADD COLUMN "runDay" TEXT;
UPDATE "MeasurementRun" SET "runDay" = to_char("startedAt", 'YYYY-MM-DD');
ALTER TABLE "MeasurementRun" ALTER COLUMN "runDay" SET NOT NULL;
CREATE UNIQUE INDEX "MeasurementRun_projectId_runDay_key"
    ON "MeasurementRun"("projectId", "runDay");   -- fails
```

The first three statements succeed. The fourth asserts something the product's
own semantics contradict: Gate 1 requires two measurement runs on one UTC day to
remain two distinct runs, and the drill's fixture deliberately contains exactly
that. Observed failure:

```
Error: P3018  A migration failed to apply.
Database error code: 23505
ERROR: could not create unique index "MeasurementRun_projectId_runDay_key"
DETAIL: Key ("projectId", "runDay")=(cmthqifmo00077dtmhejhb5fc, 2026-06-15) is duplicated.
```

This shape was chosen because it is the one that actually breaks deployments:
additive, reviewed, green against an empty database and against a developer's
sparse local copy, red only where the data is real. It is not a contrived
error — the constraint is wrong about the product, and the data says so.

The migration is **not** part of the product's history. It and its correction
live in `supertool/scripts/rehearsal-migrations/`. The drill copies
`prisma/migrations/` into a temporary directory and appends them there, so the
real history is read and never written;
`supertool/tests/migration-recovery-drill.test.ts` fails the build if either ever
appears under `prisma/migrations/`.

---

## 3. What the failure actually left behind

Measured by the drill rather than assumed, so it stays truthful if the engine or
the CLI changes:

| Observation | Result |
| --- | --- |
| `runDay` column survived | **No** |
| Unique index survived | **No** |
| `_prisma_migrations` row for the failed migration | **Yes** — `finished_at` null, `applied_steps_count` 0 |
| Subsequent `prisma migrate deploy` | **Blocked — P3009** |

PostgreSQL applies DDL transactionally and Prisma sends a migration as one
implicit transaction, so the schema change rolled back in full. **The schema was
never damaged. The deployment pipeline was.** Every subsequent `migrate deploy`
refuses — including migrations with nothing to do with the failure — until the
history is resolved.

That correction matters operationally: an operator hunting for half-applied DDL
is looking in the wrong place. The drill asserts the P3009 refusal explicitly
rather than inferring it.

---

## 4. The recovery executed

Every command below is one an operator would type, and the drill runs each and
asserts the result.

| # | Command | Asserted outcome |
| --- | --- | --- |
| 1 | `pg_dump --format=custom` *(before the migration)* | dump file exists |
| 2 | `prisma migrate status` | names `migrate resolve --rolled-back "<name>"` |
| 3 | `prisma db execute --file undo.sql` | idempotent `DROP ... IF EXISTS`; no-op here |
| 4 | `prisma migrate resolve --rolled-back <name>` | "marked as rolled back" |
| 5 | *withdraw the bad migration from the repository* | — |
| 6 | `prisma migrate deploy` | "No pending migrations to apply" |
| 7 | `prisma migrate status` | "Database schema is up to date" |
| 8 | `prisma migrate diff … --exit-code` | **zero drift** |
| 9 | `prisma migrate deploy` *(corrected migration)* | applied cleanly |

Step 5 is not bookkeeping. A rolled-back migration still present in
`prisma/migrations/` **is retried by the next deploy** — Prisma treats
rolled-back as not-applied. Withdrawing it is safe precisely because it never
applied anywhere.

The corrective migration keeps the intent and drops the false claim: the same
`runDay` column, backfilled, with a **non-unique** index. It is written
idempotently, because a forward-fix runs against a database whose exact state
depends on how far the failure got.

---

## 5. What was genuinely proven

Against PostgreSQL 16.13, Prisma 6.16.2, 34 asserted steps, ~23s:

- A migration that fails on real data **can be recovered from without data
  loss**, using only commands Prisma supports.
- Recovery returns the database to a state where `prisma migrate deploy`
  succeeds and `migrate diff --exit-code` reports **zero drift** against the
  declared schema — the incident leaves no trace.
- **Tenant data, relationships and integrity are unchanged** across the whole
  cycle. Four integrity snapshots — pre-incident, post-recovery,
  post-forward-fix, and post-restore — are compared field by field: row counts
  per table, orphaned projects and observations, observed/failed/unavailable
  provenance counts, same-day run identity, API-key scopes and quotas, and live
  enforcement of the job idempotency constraint. All four are identical.
- The corrected forward-fix **applies cleanly and the application can still
  write through it** — proven by creating an org, project, run and observation
  through the ordinary generated Prisma client, then reading them back across
  the relationships.
- The forward-fix's **blast radius is exactly what it claims**: `migrate diff
  --script` against the declared datamodel contains statements touching
  `runDay` and nothing else.
- The **restore path also works**: the pre-migration dump restores into a fresh
  database, the real history deploys onto it with zero drift, and its integrity
  snapshot matches pre-incident.
- The drill **fails closed**. Verified by deliberately breaking it three ways:
  removing `UNIQUE` from the incident migration (drill fails — "the incident
  migration SUCCEEDED … proves nothing"); making the forward-fix column
  `NOT NULL` (drill fails — "the running application could not insert a run");
  and making the forward-fix `DELETE` duplicate rows to satisfy the constraint
  (drill fails — "the forward-fix destroyed the data it was fixing").

---

## 6. What remains unproven

Stated plainly, because a drill that oversells itself is worse than none.

- **Not run against a hosted provider.** Local and CI PostgreSQL only. Nothing
  here says anything about Railway's pooler, connection limits, TLS, failover,
  snapshot or PITR behaviour. Provider-native restore remains untested; only the
  portable `pg_dump`/`pg_restore` path has been exercised.
- **Not run at production volume.** The fixture is production-*shaped* — two
  tenants, four projects, eight runs, twenty-four observations — not
  production-*sized*. It says nothing about how long a backfill or an index
  build takes on millions of rows, whether the migration would hold locks long
  enough to cause an outage, or whether the backup window is survivable. On real
  volume, lock duration is usually the thing that hurts, and this drill cannot
  see it.
- **Not run against real data.** Every value is synthetic. A migration can fail
  on data shapes nobody anticipated; a drill can only rehearse the shapes it was
  given.
- **One incident class only.** A migration that fails on a constraint, with
  transactional DDL. Not rehearsed: a migration killed mid-run by a process or
  connection death; a migration whose DDL is *not* transactional (`CREATE INDEX
  CONCURRENTLY`, several `ALTER TYPE` forms) and so genuinely can leave a
  half-applied schema; a destructive migration where restore is the only remedy
  and the data written since the backup is genuinely lost; concurrent
  application traffic during the migration and recovery.
- **No downtime measurement.** The drill proves correctness, not availability.
  It does not measure how long the application would have been degraded, and
  there is no rehearsed app-rollback step to pair with the schema recovery.
- **`--rolled-back` on a *successful* migration is still unrehearsed**, because
  Prisma does not support it. If a successful migration ever needs undoing, the
  procedure is restore-from-backup, and the window of lost writes is real.

---

## 7. Effect on Phase 2 criterion 3

Criterion 3 — *"Restoration and rollback or forward-fix have been rehearsed"* —
is **satisfied against a disposable PostgreSQL, and not against a hosted
provider or production-sized data**. Restoration was rehearsed on 2026-08-25 and
runs in CI; forward-fix recovery is rehearsed here and now runs in CI too.

`roadmap.ts` is unchanged by this work. The remaining Phase 2 entries under
`externallyBlocked` — a representative *real-data* copy, provider-native backup,
and a pooled endpoint — are exactly the gaps §6 names, and they still stand.
