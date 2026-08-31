#!/usr/bin/env node
/**
 * Migration recovery drill.
 *
 * `db-rehearse.mjs` proves a backup can be restored. This proves the other half
 * of Phase 2 criterion 3: that a migration which *fails in production* can be
 * recovered from — with the tenant data intact and the deployment pipeline
 * working again afterwards.
 *
 * It is a drill rather than a test of the recovery code, because there is no
 * recovery code. Prisma has no `migrate down`. What exists is a procedure a
 * human follows under pressure, and the only way to know a procedure works is
 * to execute it. Every command below is one an operator would type; the drill
 * runs them in order against a disposable database and asserts the result.
 *
 * ## The incident
 *
 * A migration denormalises the UTC day onto `MeasurementRun` and then asserts
 * one run per project per day. Three statements succeed. The fourth fails with
 * SQLSTATE 23505 on data the product legitimately produces — Gate 1 requires
 * two runs on one day to stay two runs. This is the migration shape that
 * actually breaks deployments: additive, reviewed, green on an empty database
 * and on a sparse local copy, red only where the data is real.
 *
 * ## The strategy under rehearsal: forward-fix
 *
 * Prisma's supported recovery surface is `migrate resolve --rolled-back` for a
 * migration it recorded as failed, followed by a corrected forward migration.
 * There is no supported way to roll back a migration that *succeeded*: a down
 * script has to be hand-written and `_prisma_migrations` hand-edited, and
 * neither can bring back data a destructive migration already dropped. So the
 * strategy is forward-fix, and restore-from-backup is the escape hatch for the
 * one case forward-fix cannot address. Both lines are rehearsed here.
 *
 * ## Isolation
 *
 * The rehearsal migrations live in `scripts/rehearsal-migrations/`, never in
 * `prisma/migrations/`. The drill copies the real history into a temporary
 * directory and appends them there, so the product's history is read and never
 * written. A fake production migration added to make a test pass would be a
 * schema change nobody reviewed, shipped to every environment, to prove
 * something about a database nobody has.
 *
 * ## Fail closed
 *
 * Every step asserts. A step that cannot prove its claim throws, and the first
 * throw ends the drill with a non-zero exit. In particular the incident step
 * fails the drill if the migration *succeeds* — that would mean the fixture no
 * longer represents the risk, and a drill that silently stops rehearsing
 * anything is worse than no drill.
 *
 * Usage:
 *   node scripts/db-recovery-drill.mjs [--keep] [--report path.json]
 */

import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync, cpSync, existsSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { randomBytes } from 'node:crypto';
import { PrismaClient } from '@prisma/client';

import {
  resolveBaseUrl,
  urlFor,
  libpqUrl,
  createDatabase,
  dropDatabases,
  createStepRunner,
  prismaCli,
  prismaCliExpectingFailure,
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

const APP = resolve(import.meta.dirname, '..');
const REAL_MIGRATIONS = join(APP, 'prisma', 'migrations');
const REAL_SCHEMA = join(APP, 'prisma', 'schema.prisma');
const REHEARSAL_MIGRATIONS = join(APP, 'scripts', 'rehearsal-migrations');

const CANDIDATE = '20260831000000_measurementrun_one_run_per_day';
const CORRECTED = '20260831000001_measurementrun_daily_index_corrected';

const BASE = resolveBaseUrl();
const stamp = randomBytes(4).toString('hex');
const INCIDENT_DB = `drill_incident_${stamp}`;
const RESTORE_DB = `drill_restore_${stamp}`;

const { step, steps, state } = createStepRunner();
const findings = {};

const workdir = mkdtempSync(join(tmpdir(), 'rl-recovery-'));
const dumpPath = join(workdir, 'pre-incident.dump');
const startedAt = new Date();

/** Run raw SQL against a drill database and return rows. */
async function query(url, sql) {
  const db = new PrismaClient({ datasources: { db: { url } } });
  try {
    return await db.$queryRawUnsafe(sql);
  } finally {
    await db.$disconnect();
  }
}

/**
 * Stage a rehearsal migration history in a temporary directory.
 *
 * Prisma locates the migrations directory beside the schema file, so a copied
 * schema in a temporary directory is all it takes to run an alternative history
 * without touching the real one.
 */
function stageHistory(name, extraMigrations) {
  const root = join(workdir, name, 'prisma');
  cpSync(REAL_MIGRATIONS, join(root, 'migrations'), { recursive: true });
  cpSync(REAL_SCHEMA, join(root, 'schema.prisma'));
  for (const migration of extraMigrations) {
    cpSync(join(REHEARSAL_MIGRATIONS, migration), join(root, 'migrations', migration), {
      recursive: true,
    });
  }
  return join(root, 'schema.prisma');
}

try {
  // ---------------------------------------------------------------- preflight

  await step('Confirm rehearsal migrations are isolated from the real history', () => {
    // The property the whole design rests on. Checked at runtime as well as in
    // tests/migration-recovery-drill.test.ts, because the drill must not be
    // able to prove anything while a rehearsal fixture is loose in production.
    const shipped = readdirSync(REAL_MIGRATIONS);
    for (const fixture of [CANDIDATE, CORRECTED]) {
      if (shipped.includes(fixture)) {
        throw new Error(
          `Rehearsal migration ${fixture} is present in prisma/migrations. ` +
            'It must never ship: remove it before running the drill.',
        );
      }
      if (!existsSync(join(REHEARSAL_MIGRATIONS, fixture, 'migration.sql'))) {
        throw new Error(`Rehearsal migration ${fixture} is missing from scripts/rehearsal-migrations.`);
      }
    }
    return `${shipped.filter((d) => d !== 'migration_lock.toml').length} production migrations, 2 rehearsal fixtures, no overlap`;
  });

  await step('Check pg_dump and pg_restore are present', () => {
    try {
      const version = pgTool('pg_dump', ['--version']).trim();
      pgTool('pg_restore', ['--version']);
      return version;
    } catch {
      throw new Error('pg_dump/pg_restore not found. Install the PostgreSQL client tools.');
    }
  });

  const serverVersion = await step('Read server version', async () =>
    withAdmin(BASE, async (c) => {
      const rows = await c.$queryRawUnsafe('SELECT version()');
      return rows[0]?.version ?? 'unknown';
    }),
  );

  const incidentHistory = await step('Stage the incident migration history', () =>
    stageHistory('incident', [CANDIDATE]),
  );

  const fixedHistory = await step('Stage the corrected migration history', () =>
    // The candidate is withdrawn rather than corrected in place. Once Prisma has
    // recorded a migration as rolled back it will try to apply it again on the
    // next deploy, so a bad migration that is staying bad has to leave the
    // history — which is only safe because it never applied anywhere.
    stageHistory('fixed', [CORRECTED]),
  );

  // ------------------------------------------------- a known migrated database

  await step(`Create the drill database (${INCIDENT_DB})`, () =>
    createDatabase(BASE, INCIDENT_DB),
  );

  const incidentUrl = urlFor(BASE, INCIDENT_DB);

  await step('Apply the real migration history with migrate deploy', () => {
    const out = prismaCli(['migrate', 'deploy'], incidentUrl);
    if (!/successfully applied|No pending migrations/i.test(out)) {
      throw new Error(`Unexpected migrate deploy output:\n${out}`);
    }
    return out.trim().split('\n').slice(-1)[0];
  });

  await step('Confirm zero drift before the incident', () => {
    prismaCli(
      ['migrate', 'diff',
       '--from-schema-datasource', 'prisma/schema.prisma',
       '--to-schema-datamodel', 'prisma/schema.prisma',
       '--exit-code'],
      incidentUrl,
    );
    return 'no difference detected';
  });

  const loaded = await step('Load representative synthetic tenant data', () =>
    loadRepresentativeData(incidentUrl),
  );

  const beforeIncident = await step('Record integrity checks (pre-incident)', () =>
    checkIntegrity(incidentUrl, 'pre-incident'),
  );

  await step('Assert the fixture actually represents the risk', () => {
    // A drill that passes by comparing empty databases proves nothing, and one
    // whose fixture no longer contains same-day runs would stop staging any
    // incident at all while still reporting success.
    if (beforeIncident.organizations < 2) throw new Error('Expected at least two tenants.');
    if (beforeIncident.observations < 1) throw new Error('Expected observations.');
    if (beforeIncident.daysWithMultipleRuns < 1) {
      throw new Error(
        'Fixture has no project with two runs on one UTC day, so the incident ' +
          'migration would succeed and the drill would rehearse nothing.',
      );
    }
    if (beforeIncident.orphanedProjects !== 0 || beforeIncident.orphanedObservations !== 0) {
      throw new Error('Tenant scoping violated in the source dataset.');
    }
    return `${loaded.orgs} tenants, ${loaded.runs} runs, ${beforeIncident.daysWithMultipleRuns} day(s) with multiple runs`;
  });

  // ------------------------------------------------------- the backup, first

  await step('Take the pre-migration backup with pg_dump', () => {
    // Step 1 of the runbook, and the step that makes every later choice
    // survivable. Taken before the migration, exactly as the procedure says.
    pgTool('pg_dump', [
      '--format=custom', '--no-owner', '--no-acl', '--file', dumpPath, libpqUrl(BASE, INCIDENT_DB),
    ]);
    if (!existsSync(dumpPath)) throw new Error('pg_dump produced no file');
    return dumpPath;
  });

  // ------------------------------------------------------------- the incident

  const incident = await step('Apply the migration — expected to FAIL', () => {
    const result = prismaCliExpectingFailure(['migrate', 'deploy'], incidentUrl, {
      schema: incidentHistory,
    });

    if (result.code === 0) {
      throw new Error(
        'The incident migration SUCCEEDED. The drill stages no incident and ' +
          'proves nothing. Either the fixture stopped producing same-day runs ' +
          'or the migration stopped asserting uniqueness.',
      );
    }
    // Assert the failure is the one being rehearsed, not an unrelated breakage
    // that happens to also be non-zero.
    if (!result.output.includes('P3018')) {
      throw new Error(`Expected Prisma error P3018, got:\n${result.output.slice(0, 600)}`);
    }
    if (!result.output.includes('23505')) {
      throw new Error(`Expected SQLSTATE 23505 (unique violation), got:\n${result.output.slice(0, 600)}`);
    }
    if (!result.output.includes('MeasurementRun_projectId_runDay_key')) {
      throw new Error('Failure did not name the index under test.');
    }
    const detail = result.output.split('\n').find((l) => l.startsWith('DETAIL:'))?.trim();
    return detail ?? 'P3018 / 23505';
  });

  // ------------------------------------------------------ truthful diagnosis

  const diagnosis = await step('Diagnose what the failure actually left behind', async () => {
    // Recorded rather than assumed. PostgreSQL applies DDL transactionally and
    // Prisma sends a migration as one implicit transaction, so on this engine
    // the schema change rolls back entirely and only the migration *history* is
    // damaged. The drill measures that instead of hard-coding it, so it stays
    // truthful if the engine or the CLI ever changes.
    const columns = await query(
      incidentUrl,
      `SELECT column_name FROM information_schema.columns
        WHERE table_schema='public' AND table_name='MeasurementRun' AND column_name='runDay'`,
    );
    const indexes = await query(
      incidentUrl,
      `SELECT indexname FROM pg_indexes
        WHERE schemaname='public' AND tablename='MeasurementRun'
          AND indexname='MeasurementRun_projectId_runDay_key'`,
    );
    const history = await query(
      incidentUrl,
      `SELECT migration_name,
              finished_at IS NULL     AS unfinished,
              rolled_back_at IS NULL  AS not_rolled_back,
              applied_steps_count
         FROM _prisma_migrations WHERE migration_name = '${CANDIDATE}'`,
    );

    if (history.length !== 1) {
      throw new Error(`Expected one _prisma_migrations row for the candidate, found ${history.length}.`);
    }
    const row = history[0];
    if (!row.unfinished || !row.not_rolled_back) {
      throw new Error(`Expected an unfinished, not-yet-rolled-back row, got ${JSON.stringify(row)}`);
    }

    findings.partialDdlSurvived = columns.length > 0 || indexes.length > 0;
    findings.residualColumn = columns.length > 0;
    findings.residualIndex = indexes.length > 0;
    findings.appliedStepsCount = Number(row.applied_steps_count ?? 0);

    return findings.partialDdlSurvived
      ? 'partial DDL survived the failure; manual undo required before resolve'
      : 'schema unchanged (transactional DDL); only the migration history is damaged';
  });

  await step('Confirm the deployment pipeline is now wedged', () => {
    // The consequence that makes this an incident rather than a nuisance: with
    // a failed migration recorded, `migrate deploy` refuses to apply anything
    // ever again — including migrations that have nothing to do with this one.
    const result = prismaCliExpectingFailure(['migrate', 'deploy'], incidentUrl);
    if (result.code === 0) {
      throw new Error('migrate deploy succeeded; expected P3009 with a failed migration recorded.');
    }
    if (!result.output.includes('P3009')) {
      throw new Error(`Expected P3009, got:\n${result.output.slice(0, 600)}`);
    }
    return 'P3009 — new migrations will not be applied';
  });

  await step('Confirm migrate status names the recovery command', () => {
    // The drill should not invent a procedure. Prisma itself prints the command
    // an operator is meant to run, and the drill runs exactly that one.
    const result = prismaCliExpectingFailure(['migrate', 'status'], incidentUrl);
    const expected = `prisma migrate resolve --rolled-back "${CANDIDATE}"`;
    if (!result.output.includes(expected)) {
      throw new Error(`migrate status did not suggest:\n  ${expected}\ngot:\n${result.output.slice(0, 800)}`);
    }
    return expected;
  });

  // -------------------------------------------------------------- recovery

  await step('Undo any partial schema change (prisma db execute)', () => {
    // Run unconditionally, and idempotent by construction. On PostgreSQL the
    // transaction already rolled the DDL back, so this is a no-op — but it is
    // the command the runbook tells an operator to run before declaring a
    // migration rolled back, and a command that is only rehearsed in a branch
    // that never executes is not rehearsed.
    const undoPath = join(workdir, 'undo.sql');
    writeFileSync(
      undoPath,
      'DROP INDEX IF EXISTS "public"."MeasurementRun_projectId_runDay_key";\n' +
        'ALTER TABLE "public"."MeasurementRun" DROP COLUMN IF EXISTS "runDay";\n',
    );
    prismaCli(['db', 'execute', '--url', incidentUrl, '--file', undoPath], incidentUrl);
    return findings.partialDdlSurvived ? 'removed residual DDL' : 'no-op (nothing survived to undo)';
  });

  await step('Mark the failed migration rolled back (migrate resolve)', () => {
    const out = prismaCli(['migrate', 'resolve', '--rolled-back', CANDIDATE], incidentUrl);
    if (!/marked as rolled back/i.test(out)) {
      throw new Error(`Unexpected resolve output:\n${out}`);
    }
    return `${CANDIDATE} marked as rolled back`;
  });

  // ------------------------------------------- the pipeline works again

  await step('Prove migrate deploy succeeds again with the real history', () => {
    const out = prismaCli(['migrate', 'deploy'], incidentUrl);
    if (!/No pending migrations|successfully applied/i.test(out)) {
      throw new Error(`Unexpected migrate deploy output:\n${out}`);
    }
    return out.split('\n').map((l) => l.trim()).filter(Boolean).slice(-1)[0];
  });

  await step('Prove migrate status is clean', () => {
    const out = prismaCli(['migrate', 'status'], incidentUrl);
    if (!/Database schema is up to date/i.test(out)) throw new Error(out);
    if (/failed|drift/i.test(out)) throw new Error(out);
    return 'up to date';
  });

  await step('Prove zero drift against the declared schema', () => {
    // The strongest single statement the drill can make about recovery: the
    // database is byte-for-byte the schema the migrations declare, as if the
    // incident had never happened.
    prismaCli(
      ['migrate', 'diff',
       '--from-schema-datasource', 'prisma/schema.prisma',
       '--to-schema-datamodel', 'prisma/schema.prisma',
       '--exit-code'],
      incidentUrl,
    );
    return 'no difference detected';
  });

  const afterRecovery = await step('Re-check integrity after recovery', () =>
    checkIntegrity(incidentUrl, 'post-recovery'),
  );

  await step('Prove tenant data and relationships are unchanged by the incident', () => {
    const differences = compare(beforeIncident, afterRecovery);
    if (differences.length) {
      throw new Error(`Recovery changed tenant data:\n  ${differences.join('\n  ')}`);
    }
    return 'identical to pre-incident';
  });

  // ------------------------------------------------------------ forward-fix

  await step('Apply the corrective forward-fix migration', () => {
    const out = prismaCli(['migrate', 'deploy'], incidentUrl, { schema: fixedHistory });
    if (!/successfully applied/i.test(out)) {
      throw new Error(`Forward-fix did not apply:\n${out}`);
    }
    if (!out.includes(CORRECTED)) throw new Error(`Forward-fix migration not named in output:\n${out}`);
    return `${CORRECTED} applied`;
  });

  await step('Prove the forward-fix produced the intended shape', async () => {
    const column = await query(
      incidentUrl,
      `SELECT is_nullable FROM information_schema.columns
        WHERE table_schema='public' AND table_name='MeasurementRun' AND column_name='runDay'`,
    );
    if (column.length !== 1) throw new Error('Forward-fix did not create the runDay column.');
    if (column[0].is_nullable !== 'YES') {
      // A NOT NULL column the generated client does not know about would break
      // every insert the running application makes. That is the forward-fix
      // failure mode worth catching here rather than in production.
      throw new Error('runDay is NOT NULL; the running application could not insert a run.');
    }

    const idx = await query(
      incidentUrl,
      `SELECT indexname, indexdef FROM pg_indexes
        WHERE schemaname='public' AND tablename='MeasurementRun' AND indexname LIKE '%runDay%'`,
    );
    const unique = idx.filter((i) => /CREATE UNIQUE INDEX/i.test(i.indexdef));
    if (unique.length) throw new Error(`Forward-fix re-created a unique index: ${unique[0].indexname}`);
    if (!idx.some((i) => i.indexname === 'MeasurementRun_projectId_runDay_idx')) {
      throw new Error('Forward-fix did not create the non-unique index.');
    }

    const unfilled = await query(
      incidentUrl,
      `SELECT count(*)::int AS n FROM "public"."MeasurementRun" WHERE "runDay" IS NULL`,
    );
    if (unfilled[0].n !== 0) throw new Error(`${unfilled[0].n} rows left unbackfilled.`);

    const sameDay = await query(
      incidentUrl,
      `SELECT count(*)::int AS n FROM (
         SELECT "projectId","runDay" FROM "public"."MeasurementRun"
          GROUP BY 1,2 HAVING count(*) > 1) AS d`,
    );
    if (sameDay[0].n < 1) {
      throw new Error('Same-day runs disappeared; the forward-fix destroyed the data it was fixing.');
    }
    return `nullable column, non-unique index, ${sameDay[0].n} project-day group(s) with multiple runs preserved`;
  });

  const afterForwardFix = await step('Re-check integrity after the forward-fix', () =>
    checkIntegrity(incidentUrl, 'post-forward-fix'),
  );

  await step('Prove the forward-fix preserved tenant data and integrity', () => {
    const differences = compare(beforeIncident, afterForwardFix);
    if (differences.length) {
      throw new Error(`Forward-fix changed tenant data:\n  ${differences.join('\n  ')}`);
    }
    return 'identical to pre-incident';
  });

  await step('Prove the schema is usable by the application afterwards', async () => {
    // The check that matters most and is easiest to skip: a recovered schema
    // that the generated Prisma client can no longer write to is not recovered.
    // These are ordinary application writes through the ordinary client, which
    // knows nothing about the column the forward-fix added.
    const db = new PrismaClient({ datasources: { db: { url: incidentUrl } } });
    try {
      const org = await db.organization.create({
        data: { name: 'Post-recovery tenant', plan: 'growth', dataMode: 'live' },
      });
      const project = await db.project.create({
        data: { orgId: org.id, name: 'Post-recovery project', domain: 'post-recovery.invalid' },
      });
      const prompt = await db.aiPrompt.create({
        data: { projectId: project.id, text: 'Does the schema still work?', cluster: 'brand' },
      });
      const run = await db.measurementRun.create({
        data: {
          orgId: org.id,
          projectId: project.id,
          status: 'completed',
          trigger: 'manual',
          promptSetVersion: 'post-recovery-v1',
          samplesPerPair: 1,
          expectedObservations: 1,
          startedAt: new Date('2026-06-16T00:00:00Z'),
          finishedAt: new Date('2026-06-16T00:01:00Z'),
        },
      });
      await db.observation.create({
        data: {
          runId: run.id,
          promptId: prompt.id,
          promptTextSnapshot: prompt.text,
          promptVersion: 'v1',
          engine: 'chatgpt',
          vendor: 'chatgpt',
          accessMethod: 'official-api',
          sampleIndex: 0,
          status: 'observed',
          brandMentioned: true,
          methodologyVersion: 'm1',
          parserVersion: 'p1',
        },
      });

      // Read it back through the relationships, not just by count.
      const readBack = await db.measurementRun.findUnique({
        where: { id: run.id },
        include: { observations: true, project: { include: { org: true } } },
      });
      if (!readBack) throw new Error('Could not read back the run just written.');
      if (readBack.observations.length !== 1) throw new Error('Observation did not persist.');
      if (readBack.project.org.id !== org.id) throw new Error('Tenant relationship broken.');

      return `wrote and read back org/project/run/observation through the generated client`;
    } finally {
      await db.$disconnect();
    }
  });

  await step('Prove the forward-fix blast radius is exactly what it claims', async () => {
    // The forward-fix is rehearsal-only, so the database now legitimately
    // differs from the declared datamodel — by the rehearsal column and index
    // and by nothing else. Asserting the *content* of the difference is what
    // turns "there is drift" into "the migration did what it said".
    const script = prismaCli(
      ['migrate', 'diff',
       '--from-schema-datasource', 'prisma/schema.prisma',
       '--to-schema-datamodel', 'prisma/schema.prisma',
       '--script'],
      incidentUrl,
    );
    const statements = script
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith('--'));

    const unexpected = statements.filter((s) => !/runDay/i.test(s));
    if (unexpected.length) {
      throw new Error(
        `Forward-fix changed more than it claimed. Unrelated drift:\n  ${unexpected.join('\n  ')}`,
      );
    }
    if (!statements.length) throw new Error('Expected the rehearsal column to show as drift.');
    return `${statements.length} statement(s), all confined to runDay`;
  });

  // ---------------------------------------------------- the restore line

  await step(`Create the restore target (${RESTORE_DB})`, () => createDatabase(BASE, RESTORE_DB));

  const restoreUrl = urlFor(BASE, RESTORE_DB);

  await step('Restore the pre-migration backup (the escape hatch)', () => {
    // Rehearsed alongside the forward-fix because they are not alternatives in
    // general: forward-fix cannot recover data a destructive migration removed,
    // and this is the only path that can.
    pgTool('pg_restore', ['--no-owner', '--no-acl', '--dbname', libpqUrl(BASE, RESTORE_DB), dumpPath]);
    return 'restored';
  });

  await step('Prove migrate deploy succeeds on the restored copy with zero drift', () => {
    const deployed = prismaCli(['migrate', 'deploy'], restoreUrl);
    if (!/No pending migrations|successfully applied/i.test(deployed)) {
      throw new Error(`Unexpected migrate deploy output:\n${deployed}`);
    }
    const status = prismaCli(['migrate', 'status'], restoreUrl);
    if (!/Database schema is up to date/i.test(status)) throw new Error(status);
    prismaCli(
      ['migrate', 'diff',
       '--from-schema-datasource', 'prisma/schema.prisma',
       '--to-schema-datamodel', 'prisma/schema.prisma',
       '--exit-code'],
      restoreUrl,
    );
    return 'deploy clean, status up to date, no drift';
  });

  const afterRestore = await step('Check integrity on the restored copy', () =>
    checkIntegrity(restoreUrl, 'restored'),
  );

  await step('Prove the restored copy matches the pre-migration state', () => {
    const differences = compare(beforeIncident, afterRestore);
    if (differences.length) {
      throw new Error(`Restored copy differs from pre-incident:\n  ${differences.join('\n  ')}`);
    }
    return 'identical to pre-incident';
  });

  // ------------------------------------------------------------------ report

  const report = {
    drill: 'migration-recovery',
    scenario:
      'A migration denormalises the UTC day onto MeasurementRun and asserts one run ' +
      'per project per day. It fails with SQLSTATE 23505 on legitimate same-day runs, ' +
      'leaving a failed migration recorded and every subsequent deploy blocked (P3009).',
    strategy: 'forward-fix, with restore from backup rehearsed as the escape hatch',
    startedAt: startedAt.toISOString(),
    finishedAt: new Date().toISOString(),
    totalMs: Date.now() - startedAt.getTime(),
    postgresVersion: serverVersion,
    prismaVersion:
      prismaCli(['--version'], incidentUrl)
        .split('\n')
        .find((l) => l.startsWith('prisma  '))
        ?.split(':')[1]
        ?.trim() ?? 'unknown',
    commitSha: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
    productionMigrations: listMigrations(),
    rehearsalMigrations: [CANDIDATE, CORRECTED],
    incidentDetail: incident,
    diagnosis,
    findings,
    integrity: {
      preIncident: beforeIncident,
      postRecovery: afterRecovery,
      postForwardFix: afterForwardFix,
      restored: afterRestore,
    },
    steps,
    result: 'passed',
  };

  if (REPORT_PATH) {
    writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2));
    console.log(`\nReport written to ${REPORT_PATH}`);
  }

  console.log(`\nRecovery drill passed in ${report.totalMs}ms.`);
} catch {
  state.failed = true;
} finally {
  if (!KEEP) {
    await dropDatabases(BASE, [INCIDENT_DB, RESTORE_DB]);
  } else {
    console.log(`\nKept ${INCIDENT_DB} and ${RESTORE_DB} for inspection.`);
  }
  rmSync(workdir, { recursive: true, force: true });
}

process.exit(state.failed ? 1 : 0);
