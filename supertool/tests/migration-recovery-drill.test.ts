import { readFileSync, existsSync, globSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Guards on the migration recovery drill.
 *
 * The drill itself (`scripts/db-recovery-drill.mjs`) needs a live PostgreSQL and
 * runs as its own CI step. What this suite protects is everything about the
 * drill that can silently rot without a database: that its rehearsal fixtures
 * stay out of the product's migration history, that it still stages an incident
 * rather than a no-op, and that CI still runs it.
 *
 * The failure mode worth naming: a rehearsal migration copied into
 * `prisma/migrations/` would be a schema change nobody reviewed, applied to
 * every environment including production, to prove something about a database
 * nobody has. It is easy to do by accident — the fixtures look exactly like
 * real migrations, because that is the point — so the check is mechanical.
 */

const REPO = resolve(__dirname, '../..');
const APP = resolve(__dirname, '..');

const PRODUCTION_MIGRATIONS = resolve(APP, 'prisma/migrations');
const REHEARSAL_MIGRATIONS = resolve(APP, 'scripts/rehearsal-migrations');

const CANDIDATE = '20260831000000_measurementrun_one_run_per_day';
const CORRECTED = '20260831000001_measurementrun_daily_index_corrected';

const drill = readFileSync(resolve(APP, 'scripts/db-recovery-drill.mjs'), 'utf8');

describe('rehearsal fixtures stay out of the production migration history', () => {
  it('ships both rehearsal migrations outside prisma/migrations', () => {
    for (const name of [CANDIDATE, CORRECTED]) {
      expect(
        existsSync(resolve(REHEARSAL_MIGRATIONS, name, 'migration.sql')),
        `${name} is missing from scripts/rehearsal-migrations`,
      ).toBe(true);
      expect(
        existsSync(resolve(PRODUCTION_MIGRATIONS, name)),
        `${name} has been copied into prisma/migrations and would ship`,
      ).toBe(false);
    }
  });

  it('leaves no trace of the rehearsal schema in any shipped migration', () => {
    // Broader than the directory check: catches the rehearsal column arriving
    // by any route, including someone pasting it into a real migration.
    const shipped = globSync('prisma/migrations/*/migration.sql', { cwd: APP });
    expect(shipped.length).toBeGreaterThan(0);

    const offenders = shipped.filter((file) =>
      /runDay/i.test(readFileSync(resolve(APP, file), 'utf8')),
    );
    expect(offenders, `production migrations carrying rehearsal schema: ${offenders.join(', ')}`)
      .toEqual([]);
  });

  it('marks every rehearsal migration as rehearsal-only in its own text', () => {
    // The last line of defence is a human reading the file. It should say what
    // it is in its first few lines, not in a README they may not open.
    for (const name of [CANDIDATE, CORRECTED]) {
      const sql = readFileSync(resolve(REHEARSAL_MIGRATIONS, name, 'migration.sql'), 'utf8');
      expect(sql.split('\n').slice(0, 3).join('\n'), name).toMatch(/REHEARSAL ONLY/i);
    }
  });
});

describe('the staged incident is still an incident', () => {
  const candidate = readFileSync(resolve(REHEARSAL_MIGRATIONS, CANDIDATE, 'migration.sql'), 'utf8');
  const corrected = readFileSync(resolve(REHEARSAL_MIGRATIONS, CORRECTED, 'migration.sql'), 'utf8');

  it('asserts a uniqueness the fixture data violates', () => {
    // Drop the UNIQUE and the migration succeeds, the drill rehearses nothing,
    // and CI goes on reporting a pass. The drill catches this at runtime too;
    // this catches it in a second and without a database.
    expect(candidate).toMatch(/CREATE UNIQUE INDEX/i);
    expect(candidate).toMatch(/MeasurementRun/);
  });

  it('keeps the corrective fix non-unique', () => {
    // The correction is precisely the removal of the uniqueness claim. A unique
    // index here would mean the forward-fix reintroduced the incident.
    expect(corrected).not.toMatch(/CREATE UNIQUE INDEX/i);
    expect(corrected).toMatch(/CREATE INDEX IF NOT EXISTS/i);
  });

  it('never deletes rows to satisfy the constraint', () => {
    // The tempting wrong fix: delete the duplicates so the unique index builds.
    // That destroys the measurement history the constraint was wrong about.
    expect(corrected).not.toMatch(/\bDELETE\b/i);
    expect(corrected).not.toMatch(/\bTRUNCATE\b/i);
    expect(corrected).not.toMatch(/\bDROP TABLE\b/i);
  });

  it('leaves the forward-fix column nullable so the running app can still write', () => {
    // A NOT NULL column the generated client does not know about breaks every
    // insert the application makes — a forward-fix that causes a second outage.
    expect(corrected).not.toMatch(/SET NOT NULL/i);
  });
});

describe('the drill fails closed', () => {
  it('treats a successful incident migration as a failure', () => {
    expect(drill).toMatch(/incident migration SUCCEEDED/i);
  });

  it('asserts the specific Prisma and SQLSTATE codes, not merely non-zero', () => {
    // P3018: a migration failed to apply. 23505: unique violation. P3009: the
    // pipeline is wedged. Asserting the codes is what stops an unrelated
    // breakage from being read as a successful rehearsal.
    for (const code of ['P3018', '23505', 'P3009']) {
      expect(drill, `drill does not assert ${code}`).toContain(code);
    }
  });

  it('runs the recovery command Prisma itself documents', () => {
    expect(drill).toContain("'resolve', '--rolled-back'");
  });

  it('proves a zero-drift deploy after recovery', () => {
    expect(drill).toContain('--exit-code');
    expect(drill).toMatch(/Prove zero drift against the declared schema/);
  });

  it('exits non-zero when any step failed', () => {
    expect(drill).toMatch(/process\.exit\(state\.failed \? 1 : 0\)/);
  });

  it('refuses to run while a rehearsal fixture is loose in the real history', () => {
    expect(drill).toMatch(/Confirm rehearsal migrations are isolated from the real history/);
  });
});

describe('both rehearsals share one definition of the fixture and of integrity', () => {
  // Two copies of "representative data" drift apart, and then the restore
  // rehearsal and the recovery drill quietly stop describing the same product.
  const support = readFileSync(resolve(APP, 'scripts/lib/rehearsal-support.mjs'), 'utf8');
  const rehearse = readFileSync(resolve(APP, 'scripts/db-rehearse.mjs'), 'utf8');

  it('defines the fixture and the integrity checks exactly once', () => {
    expect(support).toContain('export async function loadRepresentativeData');
    expect(support).toContain('export async function checkIntegrity');
    for (const script of [rehearse, drill]) {
      expect(script).not.toMatch(/^async function loadRepresentativeData/m);
      expect(script).not.toMatch(/^async function checkIntegrity/m);
      expect(script).toContain('./lib/rehearsal-support.mjs');
    }
  });

  it('keeps same-day runs in the shared fixture, which is what makes the incident real', () => {
    expect(support).toMatch(/same UTC day/i);
    expect(support).toContain('daysWithMultipleRuns');
  });
});

describe('CI runs the drill', () => {
  const ci = readFileSync(resolve(REPO, '.github/workflows/supertool.yml'), 'utf8');
  const pkg = JSON.parse(readFileSync(resolve(APP, 'package.json'), 'utf8')) as {
    scripts: Record<string, string>;
  };

  it('exposes the drill as a script', () => {
    expect(pkg.scripts['db:recovery-drill']).toContain('db-recovery-drill.mjs');
  });

  it('still exposes the backup rehearsal alongside it', () => {
    // The two prove different halves of criterion 3. Losing either silently
    // narrows what "rehearsed" means.
    expect(pkg.scripts['db:rehearse']).toContain('db-rehearse.mjs');
  });

  it('runs both on every push', () => {
    expect(ci).toContain('npm run db:rehearse');
    expect(ci).toContain('npm run db:recovery-drill');
  });
});

describe('the runbook documents the rehearsed procedure', () => {
  const runbook = readFileSync(resolve(REPO, 'docs/operations-runbook.md'), 'utf8');

  it('names the command that recovers a failed migration', () => {
    // The drill exists so this procedure is executed rather than merely
    // written down; the procedure has to actually be written down too.
    expect(runbook).toContain('migrate resolve --rolled-back');
  });

  it('points at the drill', () => {
    expect(runbook).toContain('db:recovery-drill');
  });

  it('still says when restoring beats forward-fixing', () => {
    expect(runbook).toMatch(/destroyed or transformed data/i);
  });

  it('does not overstate the transactional-DDL finding', () => {
    // The runbook is what an operator reads under pressure, so an unqualified
    // "a failed migration leaves the schema untouched" is the most dangerous
    // place for this claim to live. The drill only ever observed it for
    // migrations whose statements can all run inside a transaction;
    // CREATE INDEX CONCURRENTLY and several ALTER TYPE forms cannot, and can
    // genuinely leave a half-applied schema.
    expect(runbook, 'runbook must carry the non-transactional DDL caveat')
      .toMatch(/CONCURRENTLY/);
    expect(runbook).toMatch(/do not assume it\s+rolled back/i);
  });
});
