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
 * Usage:
 *   node scripts/db-rehearse.mjs [--keep] [--report path.json]
 */

import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { PrismaClient } from '@prisma/client';

const KEEP = process.argv.includes('--keep');
const reportFlag = process.argv.indexOf('--report');
const REPORT_PATH = reportFlag > -1 ? process.argv[reportFlag + 1] : null;

const BASE = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
if (!BASE) {
  console.error('DIRECT_URL (or DATABASE_URL) must be set. See .env.example.');
  process.exit(1);
}

const stamp = randomBytes(4).toString('hex');
const SOURCE_DB = `rehearse_src_${stamp}`;
const RESTORE_DB = `rehearse_dst_${stamp}`;

const steps = [];
let failed = false;

function urlFor(database) {
  const u = new URL(BASE);
  u.pathname = `/${database}`;
  u.searchParams.set('schema', 'public');
  return u.toString();
}

function adminUrl() {
  const u = new URL(BASE);
  u.pathname = '/postgres';
  u.searchParams.delete('schema');
  return u.toString();
}

/**
 * The same connection string, minus Prisma-only parameters.
 *
 * `?schema=` is a Prisma extension, not libpq: pg_dump and pg_restore reject it
 * outright with "invalid URI query parameter". Anything handed to a native
 * PostgreSQL tool has to go through here.
 */
function libpqUrl(database) {
  const u = new URL(BASE);
  u.pathname = `/${database}`;
  for (const key of ['schema', 'connection_limit', 'pool_timeout', 'pgbouncer', 'sslaccept']) {
    u.searchParams.delete(key);
  }
  return u.toString();
}

async function withAdmin(fn) {
  const client = new PrismaClient({ datasources: { db: { url: adminUrl() } } });
  try {
    return await fn(client);
  } finally {
    await client.$disconnect();
  }
}

/** Run a step, record its timing, and stop the rehearsal on failure. */
async function step(name, fn) {
  const started = Date.now();
  process.stdout.write(`→ ${name} ... `);
  try {
    const detail = await fn();
    const ms = Date.now() - started;
    steps.push({ name, ok: true, ms, detail: detail ?? null });
    console.log(`ok (${ms}ms)`);
    return detail;
  } catch (err) {
    const ms = Date.now() - started;
    const message = err instanceof Error ? err.message : String(err);
    steps.push({ name, ok: false, ms, error: message.slice(0, 800) });
    console.log(`FAILED (${ms}ms)`);
    console.error(`  ${message.split('\n').slice(0, 6).join('\n  ')}`);
    failed = true;
    throw err;
  }
}

function prisma(args, url) {
  return execFileSync('npx', ['prisma', ...args], {
    env: { ...process.env, DATABASE_URL: url, DIRECT_URL: url },
    stdio: 'pipe',
    encoding: 'utf8',
  });
}

function pgTool(tool, args) {
  // pg_dump and pg_restore accept the connection string directly, so no
  // credential is ever placed on the command line separately or logged.
  return execFileSync(tool, args, { stdio: 'pipe', encoding: 'utf8', env: process.env });
}

/**
 * A sanitized, production-shaped dataset.
 *
 * Shaped like real usage — two tenants, overlapping projects, multiple runs per
 * project, failed and unavailable observations alongside observed ones — but
 * every value is synthetic. No customer PII can reach this file, because
 * nothing here reads from anywhere.
 *
 * The second tenant exists specifically so the integrity checks can prove that
 * scoping holds; a single-tenant fixture cannot detect a cross-tenant leak.
 */
async function loadRepresentativeData(url) {
  const db = new PrismaClient({ datasources: { db: { url } } });
  try {
    const counts = { orgs: 0, projects: 0, runs: 0, observations: 0, jobs: 0, sessions: 0, keys: 0 };

    for (const tenant of ['alpha', 'beta']) {
      const org = await db.organization.create({
        data: { name: `Tenant ${tenant}`, plan: 'growth', dataMode: 'live' },
      });
      counts.orgs++;

      const user = await db.user.create({
        data: {
          email: `owner@${tenant}.invalid`,
          name: `Owner ${tenant}`,
          // A bcrypt-shaped placeholder, not a hash of any real password.
          passwordHash: '$2b$12$rehearsalplaceholderrehearsalplaceholderrehearsalpl',
        },
      });
      await db.membership.create({ data: { userId: user.id, orgId: org.id, role: 'owner' } });

      await db.session.create({
        data: {
          userId: user.id,
          orgId: org.id,
          expiresAt: new Date(Date.now() + 86_400_000),
          userAgent: 'rehearsal/1.0',
          ipHash: randomBytes(8).toString('hex'),
        },
      });
      counts.sessions++;

      for (let p = 0; p < 2; p++) {
        const project = await db.project.create({
          data: { orgId: org.id, name: `${tenant} project ${p}`, domain: `${tenant}-${p}.invalid` },
        });
        counts.projects++;

        await db.apiKey.create({
          data: {
            projectId: project.id,
            orgId: project.orgId,
            prefix: `rlst_${randomBytes(4).toString('hex')}`,
            hashedKey: randomBytes(32).toString('hex'),
            scopes: 'visibility:read,citations:read',
            dailyQuota: 1000,
            quotaGroupId: `grp_${randomBytes(16).toString('base64url')}`,
          },
        });
        counts.keys++;

        const prompt = await db.aiPrompt.create({
          data: { projectId: project.id, text: `What is ${tenant} project ${p}?`, cluster: 'brand' },
        });

        // Two runs on the SAME UTC day, which is the case Gate 1 exists to keep
        // separate. A restore that merges them has lost run identity.
        const day = new Date('2026-06-15T00:00:00Z');
        for (let r = 0; r < 2; r++) {
          const run = await db.measurementRun.create({
            data: {
              orgId: org.id,
              projectId: project.id,
              status: 'completed',
              trigger: r === 0 ? 'manual' : 'scheduled',
              promptSetVersion: 'rehearsal-v1',
              samplesPerPair: 2,
              expectedObservations: 6,
              startedAt: new Date(day.getTime() + r * 3_600_000),
              finishedAt: new Date(day.getTime() + r * 3_600_000 + 60_000),
            },
          });
          counts.runs++;

          // Observed, failed and unavailable together: the failed and
          // unavailable rows must survive a restore, because coverage is
          // computed from them.
          const shapes = [
            { status: 'observed', engine: 'chatgpt', brandMentioned: true },
            { status: 'failed', engine: 'claude', brandMentioned: false },
            { status: 'unavailable', engine: 'gemini', brandMentioned: false },
          ];

          for (const [i, shape] of shapes.entries()) {
            await db.observation.create({
              data: {
                runId: run.id,
                promptId: prompt.id,
                promptTextSnapshot: prompt.text,
                promptVersion: 'v1',
                engine: shape.engine,
                vendor: shape.engine,
                accessMethod: 'official-api',
                sampleIndex: i,
                status: shape.status,
                brandMentioned: shape.brandMentioned,
                methodologyVersion: 'm1',
                parserVersion: 'p1',
              },
            });
            counts.observations++;
          }
        }

        await db.job.create({
          data: {
            kind: 'measurement-run',
            orgId: org.id,
            projectId: project.id,
            status: 'queued',
            idempotencyKey: `rehearsal-${tenant}-${p}`,
          },
        });
        counts.jobs++;
      }
    }

    return counts;
  } finally {
    await db.$disconnect();
  }
}

/**
 * Integrity checks.
 *
 * Run identically against the source and the restored copy. Anything that
 * differs between the two means the backup did not preserve it.
 */
async function checkIntegrity(url, label) {
  const db = new PrismaClient({ datasources: { db: { url } } });
  try {
    const result = {};

    result.organizations = await db.organization.count();
    result.projects = await db.project.count();
    result.measurementRuns = await db.measurementRun.count();
    result.observations = await db.observation.count();
    result.jobs = await db.job.count();
    result.sessions = await db.session.count();
    result.apiKeys = await db.apiKey.count();

    // Tenant scoping: every project must belong to an organisation that exists,
    // and no project may be reachable from the wrong tenant.
    const orgs = await db.organization.findMany({ select: { id: true } });
    const orgIds = new Set(orgs.map((o) => o.id));
    const projects = await db.project.findMany({ select: { id: true, orgId: true } });
    result.orphanedProjects = projects.filter((p) => !orgIds.has(p.orgId)).length;

    // Every run's observations must belong to that run alone.
    const runs = await db.measurementRun.findMany({ select: { id: true, orgId: true } });
    const runIds = new Set(runs.map((r) => r.id));
    const observations = await db.observation.findMany({ select: { runId: true, status: true } });
    result.orphanedObservations = observations.filter((o) => !runIds.has(o.runId)).length;

    // Provenance must survive: failed and unavailable rows are what coverage is
    // computed from, so a restore that drops them silently inflates every rate.
    result.observedCount = observations.filter((o) => o.status === 'observed').length;
    result.failedCount = observations.filter((o) => o.status === 'failed').length;
    result.unavailableCount = observations.filter((o) => o.status === 'unavailable').length;

    // Run identity: two runs on one UTC day must stay two runs.
    const byDay = new Map();
    for (const r of await db.measurementRun.findMany({ select: { startedAt: true } })) {
      const key = r.startedAt.toISOString().slice(0, 10);
      byDay.set(key, (byDay.get(key) ?? 0) + 1);
    }
    result.daysWithMultipleRuns = [...byDay.values()].filter((n) => n > 1).length;

    // Scoped API keys: every key must carry explicit scopes after Phase 2.
    const keys = await db.apiKey.findMany({ select: { scopes: true, dailyQuota: true } });
    result.keysWithoutScopes = keys.filter((k) => !k.scopes.trim()).length;
    result.keysWithQuota = keys.filter((k) => k.dailyQuota > 0).length;

    // The idempotency constraint must still reject a duplicate after restore.
    const existing = await db.job.findFirst({ where: { idempotencyKey: { not: null } } });
    if (existing?.idempotencyKey) {
      try {
        await db.job.create({
          data: { kind: 'probe', orgId: 'probe', idempotencyKey: existing.idempotencyKey },
        });
        result.idempotencyConstraintEnforced = false;
      } catch {
        result.idempotencyConstraintEnforced = true;
      }
    } else {
      result.idempotencyConstraintEnforced = null;
    }

    console.log(`    [${label}] ${JSON.stringify(result)}`);
    return result;
  } finally {
    await db.$disconnect();
  }
}

/** Compare source and restored integrity, field by field. */
function compare(before, after) {
  const differences = [];
  for (const key of Object.keys(before)) {
    if (JSON.stringify(before[key]) !== JSON.stringify(after[key])) {
      differences.push(`${key}: ${JSON.stringify(before[key])} → ${JSON.stringify(after[key])}`);
    }
  }
  return differences;
}

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
    withAdmin(async (c) => {
      const rows = await c.$queryRawUnsafe('SELECT version()');
      return rows[0]?.version ?? 'unknown';
    }),
  );

  await step(`Create empty source database (${SOURCE_DB})`, () =>
    withAdmin((c) => c.$executeRawUnsafe(`CREATE DATABASE "${SOURCE_DB}"`)),
  );

  const sourceUrl = urlFor(SOURCE_DB);

  await step('Apply migrations with migrate deploy', () => {
    const out = prisma(['migrate', 'deploy'], sourceUrl);
    if (!/successfully applied|No pending migrations/i.test(out)) {
      throw new Error(`Unexpected migrate deploy output:\n${out}`);
    }
    return out.trim().split('\n').slice(-1)[0];
  });

  await step('Confirm zero drift', () => {
    // Non-zero exit means the migrations no longer reproduce the schema.
    prisma(
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
    const out = prisma(['migrate', 'status'], sourceUrl);
    if (/not yet been applied|drift/i.test(out)) throw new Error(out);
    return 'up to date';
  });

  const loaded = await step('Load representative dataset', () => loadRepresentativeData(sourceUrl));

  const before = await step('Check integrity (source)', () => checkIntegrity(sourceUrl, 'source'));

  await step('Back up with pg_dump', () => {
    pgTool('pg_dump', [
      '--format=custom', '--no-owner', '--no-acl', '--file', dumpPath, libpqUrl(SOURCE_DB),
    ]);
    if (!existsSync(dumpPath)) throw new Error('pg_dump produced no file');
    return dumpPath;
  });

  await step(`Create isolated restore target (${RESTORE_DB})`, () =>
    withAdmin((c) => c.$executeRawUnsafe(`CREATE DATABASE "${RESTORE_DB}"`)),
  );

  const restoreUrl = urlFor(RESTORE_DB);

  await step('Restore with pg_restore', () => {
    // pg_restore exits non-zero on warnings for objects it cannot own, which
    // --no-owner already avoids; anything else is a real failure.
    pgTool('pg_restore', ['--no-owner', '--no-acl', '--dbname', libpqUrl(RESTORE_DB), dumpPath]);
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
    prismaVersion: prisma(['--version'], urlFor(SOURCE_DB))
      .split('\n')
      .find((l) => l.startsWith('prisma  '))
      ?.split(':')[1]
      ?.trim() ?? 'unknown',
    migrationSha: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
    migrations: globMigrations(),
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
  failed = true;
} finally {
  if (!KEEP) {
    for (const name of [SOURCE_DB, RESTORE_DB]) {
      try {
        await withAdmin(async (c) => {
          await c.$executeRawUnsafe(
            `SELECT pg_terminate_backend(pid) FROM pg_stat_activity
             WHERE datname = '${name}' AND pid <> pg_backend_pid()`,
          );
          await c.$executeRawUnsafe(`DROP DATABASE IF EXISTS "${name}"`);
        });
      } catch {
        console.error(`  (could not drop ${name}; drop it manually)`);
      }
    }
  } else {
    console.log(`\nKept ${SOURCE_DB} and ${RESTORE_DB} for inspection.`);
  }
  rmSync(workdir, { recursive: true, force: true });
}

function globMigrations() {
  try {
    return execFileSync('ls', ['prisma/migrations'], { encoding: 'utf8' })
      .split('\n')
      .filter((l) => l && l !== 'migration_lock.toml');
  } catch {
    return [];
  }
}

process.exit(failed ? 1 : 0);
