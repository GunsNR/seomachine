# Rehearsal-only migrations

These are **not** part of the product's migration history and must never be
copied into `supertool/prisma/migrations/`. They exist so
`scripts/db-recovery-drill.mjs` can stage a realistic migration incident against
a disposable database and rehearse recovering from it.

The drill copies `prisma/migrations/` into a temporary directory, appends the
directories here, and points the Prisma CLI at a schema file in that temporary
directory. The real history is read, never written.

`tests/migration-recovery-drill.test.ts` fails the build if either of these
directory names ever appears under `prisma/migrations/`, because a rehearsal
fixture that reaches production is a schema change nobody reviewed.

| Directory | Role |
| --- | --- |
| `20260831000000_measurementrun_one_run_per_day` | The migration that fails. Asserts one measurement run per project per UTC day — an assumption the product's own data disproves. |
| `20260831000001_measurementrun_daily_index_corrected` | The corrective forward-fix. Same query-performance intent, expressed in a form the data supports. |
