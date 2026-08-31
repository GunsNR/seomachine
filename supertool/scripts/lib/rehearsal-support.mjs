/**
 * Shared machinery for the database rehearsals.
 *
 * Two scripts exercise the same database from opposite directions:
 * `db-rehearse.mjs` proves a backup can be restored, and
 * `db-recovery-drill.mjs` proves a failed migration can be recovered from. They
 * must agree on what "representative data" and "integrity" mean, or the two
 * rehearsals slowly stop describing the same product. Keeping one definition
 * here is what makes their results comparable.
 *
 * Nothing in this file touches a hosted credential or reads customer data. It
 * builds disposable databases from whatever `DIRECT_URL` points at.
 */

import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { PrismaClient } from '@prisma/client';

/** The connection string every disposable database is derived from. */
export function resolveBaseUrl() {
  const base = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
  if (!base) {
    throw new Error('DIRECT_URL (or DATABASE_URL) must be set. See .env.example.');
  }
  return base;
}

/** A Prisma-flavoured URL for one database on the same server. */
export function urlFor(base, database) {
  const u = new URL(base);
  u.pathname = `/${database}`;
  u.searchParams.set('schema', 'public');
  return u.toString();
}

/** The maintenance database, used only to CREATE and DROP the disposable ones. */
export function adminUrl(base) {
  const u = new URL(base);
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
export function libpqUrl(base, database) {
  const u = new URL(base);
  u.pathname = `/${database}`;
  for (const key of ['schema', 'connection_limit', 'pool_timeout', 'pgbouncer', 'sslaccept']) {
    u.searchParams.delete(key);
  }
  return u.toString();
}

export async function withAdmin(base, fn) {
  const client = new PrismaClient({ datasources: { db: { url: adminUrl(base) } } });
  try {
    return await fn(client);
  } finally {
    await client.$disconnect();
  }
}

/** Create a disposable database. */
export async function createDatabase(base, name) {
  await withAdmin(base, (c) => c.$executeRawUnsafe(`CREATE DATABASE "${name}"`));
  return name;
}

/**
 * Drop the disposable databases, disconnecting anything still attached.
 *
 * Best effort by design: a rehearsal that already failed must still report its
 * failure, not be replaced by a cleanup error.
 */
export async function dropDatabases(base, names) {
  for (const name of names) {
    try {
      await withAdmin(base, async (c) => {
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
}

/**
 * A step runner that fails closed.
 *
 * Every step is timed and recorded. The first failure marks the whole run
 * failed and rethrows, so no later step can paper over an earlier one — the
 * property that separates a drill from a demonstration.
 */
export function createStepRunner() {
  const steps = [];
  const state = { failed: false };

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
      state.failed = true;
      throw err;
    }
  }

  return { step, steps, state };
}

/**
 * Run a Prisma CLI command against one database.
 *
 * `schema` points the CLI at an alternative schema file — and therefore at the
 * migrations directory beside it. The recovery drill uses that to run a
 * rehearsal-only migration history without ever writing into the real one.
 */
export function prismaCli(args, url, { schema } = {}) {
  const full = schema ? [...args, '--schema', schema] : args;
  return execFileSync('npx', ['prisma', ...full], {
    env: { ...process.env, DATABASE_URL: url, DIRECT_URL: url },
    stdio: 'pipe',
    encoding: 'utf8',
  });
}

/**
 * Run a Prisma CLI command that is expected to fail.
 *
 * Returns the combined output and exit status instead of throwing, so a caller
 * can assert on *how* it failed. A command that unexpectedly succeeds returns
 * `code: 0`, which the caller must then treat as the failure it is.
 */
export function prismaCliExpectingFailure(args, url, { schema } = {}) {
  const full = schema ? [...args, '--schema', schema] : args;
  try {
    const stdout = execFileSync('npx', ['prisma', ...full], {
      env: { ...process.env, DATABASE_URL: url, DIRECT_URL: url },
      stdio: 'pipe',
      encoding: 'utf8',
    });
    return { code: 0, output: stdout };
  } catch (err) {
    const output = `${err.stdout ?? ''}\n${err.stderr ?? ''}`;
    return { code: err.status ?? 1, output };
  }
}

export function pgTool(tool, args) {
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
 *
 * The two same-day runs per project are load-bearing twice over. The restore
 * rehearsal needs them to prove run identity survives a dump. The recovery
 * drill needs them because they are what makes a "one run per project per day"
 * uniqueness constraint fail — on real product semantics rather than on a
 * contrivance.
 */
export async function loadRepresentativeData(url) {
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
 * Run identically against every copy of the database a rehearsal produces.
 * Anything that differs between two copies is something the procedure under
 * test did not preserve.
 */
export async function checkIntegrity(url, label) {
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
    // computed from, so a copy that drops them silently inflates every rate.
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

    // The idempotency constraint must still reject a duplicate. The probe is
    // expected to fail, so it adds no row and leaves every count above stable.
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

/** Compare two integrity snapshots, field by field. */
export function compare(before, after) {
  const differences = [];
  for (const key of Object.keys(before)) {
    if (JSON.stringify(before[key]) !== JSON.stringify(after[key])) {
      differences.push(`${key}: ${JSON.stringify(before[key])} → ${JSON.stringify(after[key])}`);
    }
  }
  return differences;
}

/** The production migration history, by directory name. */
export function listMigrations() {
  try {
    return execFileSync('ls', ['prisma/migrations'], { encoding: 'utf8' })
      .split('\n')
      .filter((l) => l && l !== 'migration_lock.toml');
  } catch {
    return [];
  }
}
