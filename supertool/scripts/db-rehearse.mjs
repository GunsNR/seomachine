#!/usr/bin/env node
/**
 * Migration, backup and restore rehearsal.
 *
 * Runs the whole procedure from docs/hosted-postgres-validation.md against
 * whatever PostgreSQL `DIRECT_URL` points at, creating and destroying its own
 * disposable databases. It needs no hosted credential, so CI executes it on
 * every push — the point being that a restore nobody has performed is a hope,
 * not a plan.
 *
 *   1. Create an empty database.
 *   2. `prisma migrate deploy` onto it.
 *   3. Prove zero drift between the migrations and the schema.
 *   4. Load a sanitized, production-shaped dataset (no real customer data).
 *   5. Check integrity: tenant scoping, runs, observations, jobs, sessions and
 *      the API-key scope constraints.
 *   6. `pg_dump` it.
 *   7. `pg_restore` into a separate, isolated database.
 *   8. Re-run every integrity check on the restored copy.
 *   9. Emit a machine-readable report with timings and versions.
 *
 * A hosted run is the same script pointed at the hosted DIRECT_URL. What it
 * cannot do without a hosted target is prove anything about that provider's
 * latency, connection limits, pooler behaviour or backup tooling — see the
 * runbook's "what this does not prove".
 *
 * The companion drill is `db-recovery-drill.mjs`, which rehearses recovering
 * from a migration that fails. This script proves you can get the data back;
 * that one proves you can get the deployment back. They share their fixture and
 * their integrity checks (`lib/rehearsal-support.mjs`) so that a claim proven by
 * one means the same thing in the other.
 *
 * Usage:
 *   node scripts/db-rehearse.mjs [--keep] [--report path.json]
 */

import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';

import {
  resolveBaseUrl,
  urlFor,
  libpqUrl,
  createDatabase,
  dropDatabases,
  createStepRunner,
  prismaCli,
  pgTool,
  loadRepresentativeData,
  checkIntegrity,
  compare,
  listMigrations,
  withAdmin,
} from './lib/rehearsal-support.mjs';

const KEEP = process.argv.includes('--keep');
const reportFlag = process.argv.indexOf('--report');
const REPORT_PATH = reportFlag > -1 ? process.argv[reportFlag + 1] : null;

let BASE;
try {
  BASE = resolveBaseUrl();
} catch (err) {
  console.error(err.message);
  process.exit(1);
}

const stamp = randomBytes(4).toString('hex');
const SOURCE_DB = `rehearse_src_${stamp}`;
const RESTORE_DB = `rehearse_dst_${stamp}`;

const { step, steps, state } = createStepRunner();

const workdir = mkdtempSync(join(tmpdir(), 'rl-rehearse-'));
const dumpPath = join(workdir, 'backup.dump');
const startedAt = new Date();

try {
  await step('Check pg_dump and pg_restore are present and compatible', () => {
    // A client older than the server refuses to dump it. Failing here with both
    // version numbers beats failing four steps later with "server version
    // mismatch" and no context.
    let dumpVersion;
    try {
      dumpVersion = pgTool('pg_dump', ['--version']).trim();
      pgTool('pg_restore', ['--version']);
    } catch {
      throw new Error(
        'pg_dump/pg_restore not found. Install the PostgreSQL client tools ' +
          'matching your server major version.',
      );
    }
    return dumpVersion;
  });

  const version = await step('Read server version', async () =>
    withAdmin(BASE, async (c) => {
      const rows = await c.$queryRawUnsafe('SELECT version()');
      return rows[0]?.version ?? 'unknown';
    }),
  );

  await step(`Create empty source database (${SOURCE_DB})`, () => createDatabase(BASE, SOURCE_DB));

  const sourceUrl = urlFor(BASE, SOURCE_DB);

  await step('Apply migrations with migrate deploy', () => {
    const out = prismaCli(['migrate', 'deploy'], sourceUrl);
    if (!/successfully applied|No pending migrations/i.test(out)) {
      throw new Error(`Unexpected migrate deploy output:\n${out}`);
    }
    return out.trim().split('\n').slice(-1)[0];
  });

  await step('Confirm zero drift', () => {
    // Non-zero exit means the migrations no longer reproduce the schema.
    prismaCli(
      [
        'migrate', 'diff',
        '--from-schema-datasource', 'prisma/schema.prisma',
        '--to-schema-datamodel', 'prisma/schema.prisma',
        '--exit-code',
      ],
      sourceUrl,
    );
    return 'no difference detected';
  });

  await step('Confirm migration status is applied', () => {
    const out = prismaCli(['migrate', 'status'], sourceUrl);
    if (/not yet been applied|drift/i.test(out)) throw new Error(out);
    return 'up to date';
  });

  const loaded = await step('Load representative dataset', () => loadRepresentativeData(sourceUrl));

  const before = await step('Check integrity (source)', () => checkIntegrity(sourceUrl, 'source'));

  await step('Back up with pg_dump', () => {
    pgTool('pg_dump', [
      '--format=custom', '--no-owner', '--no-acl', '--file', dumpPath, libpqUrl(BASE, SOURCE_DB),
    ]);
    if (!existsSync(dumpPath)) throw new Error('pg_dump produced no file');
    return dumpPath;
  });

  await step(`Create isolated restore target (${RESTORE_DB})`, () =>
    createDatabase(BASE, RESTORE_DB),
  );

  const restoreUrl = urlFor(BASE, RESTORE_DB);

  await step('Restore with pg_restore', () => {
    // pg_restore exits non-zero on warnings for objects it cannot own, which
    // --no-owner already avoids; anything else is a real failure.
    pgTool('pg_restore', ['--no-owner', '--no-acl', '--dbname', libpqUrl(BASE, RESTORE_DB), dumpPath]);
    return 'restored';
  });

  const after = await step('Check integrity (restored)', () => checkIntegrity(restoreUrl, 'restored'));

  await step('Compare source and restored', () => {
    const differences = compare(before, after);
    if (differences.length) {
      throw new Error(`Restored copy differs from source:\n  ${differences.join('\n  ')}`);
    }
    return 'identical';
  });

  await step('Assert the dataset was actually loaded', () => {
    // Guards against a rehearsal that "passes" by comparing two empty
    // databases — the failure mode that would make all of this meaningless.
    if (before.organizations < 2) throw new Error('Expected at least two tenants.');
    if (before.observations < 1) throw new Error('Expected observations.');
    if (before.daysWithMultipleRuns < 1) throw new Error('Expected same-day runs.');
    if (before.idempotencyConstraintEnforced !== true) {
      throw new Error('Idempotency constraint was not enforced after restore.');
    }
    if (before.orphanedProjects !== 0 || before.orphanedObservations !== 0) {
      throw new Error('Tenant scoping violated in the source dataset.');
    }
    return `${loaded.orgs} tenants, ${loaded.observations} observations`;
  });

  const report = {
    startedAt: startedAt.toISOString(),
    finishedAt: new Date().toISOString(),
    totalMs: Date.now() - startedAt.getTime(),
    postgresVersion: version,
    prismaVersion: prismaCli(['--version'], urlFor(BASE, SOURCE_DB))
      .split('\n')
      .find((l) => l.startsWith('prisma  '))
      ?.split(':')[1]
      ?.trim() ?? 'unknown',
    migrationSha: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
    migrations: listMigrations(),
    sourceIntegrity: before,
    restoredIntegrity: after,
    steps,
    result: 'passed',
  };

  if (REPORT_PATH) {
    writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2));
    console.log(`\nReport written to ${REPORT_PATH}`);
  }

  console.log(`\nRehearsal passed in ${report.totalMs}ms.`);
} catch {
  state.failed = true;
} finally {
  if (!KEEP) {
    await dropDatabases(BASE, [SOURCE_DB, RESTORE_DB]);
  } else {
    console.log(`\nKept ${SOURCE_DB} and ${RESTORE_DB} for inspection.`);
  }
  rmSync(workdir, { recursive: true, force: true });
}

process.exit(state.failed ? 1 : 0);
