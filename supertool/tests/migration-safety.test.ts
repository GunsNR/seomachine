import { readFileSync, globSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * `prisma db push` must not come back.
 *
 * `db push` computes a diff from the schema file and applies it directly. No
 * recorded step, no review, no replay, no rollback — the schema simply becomes
 * whatever the file says. That is the right trade while prototyping and the
 * wrong one the moment data exists that cannot be regenerated (ADR-014).
 *
 * Phase 2 removed it from CI. It survived in two package scripts and in four
 * integration tests, which is exactly how this kind of thing returns: not by
 * someone arguing for it, but by a convenience script nobody re-read.
 *
 * These checks are deliberately narrow. They look at executable paths only —
 * package scripts, workflows, shell scripts, test setup. Prose may discuss
 * `db push` freely, including saying that it was removed; a documentation ban
 * would make the history unwritable.
 */

const REPO = resolve(__dirname, '../..');
const APP = resolve(__dirname, '..');

/** Matches the command, not the words. `db:push` and `db push` both count. */
const DB_PUSH = /\bdb[\s:_-]+push\b/i;

describe('package scripts', () => {
  const pkg = JSON.parse(readFileSync(resolve(APP, 'package.json'), 'utf8')) as {
    scripts: Record<string, string>;
  };

  it('defines no script that runs db push', () => {
    const offenders = Object.entries(pkg.scripts)
      .filter(([, command]) => DB_PUSH.test(command))
      .map(([name, command]) => `${name}: ${command}`);

    expect(offenders, `scripts running db push: ${offenders.join(', ')}`).toEqual([]);
  });

  it('has no script named db:push', () => {
    expect(Object.keys(pkg.scripts)).not.toContain('db:push');
  });

  it('bootstraps through migrations', () => {
    // `setup` is the script a new contributor runs first. If it pushes, every
    // local database in the project is built off the migration history.
    expect(pkg.scripts.setup).toContain('migrate deploy');
    expect(pkg.scripts.setup).not.toMatch(DB_PUSH);
  });

  it('exposes the full migration lifecycle', () => {
    // Creating a migration, applying existing ones, checking status, and
    // proving no drift — each needs its own command, or someone reaches for
    // the one blunt instrument that does all four badly.
    expect(pkg.scripts['db:migrate'], 'create a migration').toContain('migrate dev');
    expect(pkg.scripts['db:deploy'], 'apply migrations').toContain('migrate deploy');
    expect(pkg.scripts['db:status'], 'migration status').toContain('migrate status');
    expect(pkg.scripts['db:drift'], 'drift check').toContain('migrate diff');
    expect(pkg.scripts['db:drift'], 'drift must fail the build').toContain('--exit-code');
    expect(pkg.scripts['db:generate'], 'client generation').toContain('prisma generate');
  });

  it('keeps client generation separate from schema application', () => {
    // `build` must not apply a schema as a side effect of compiling.
    expect(pkg.scripts.build).not.toMatch(DB_PUSH);
    expect(pkg.scripts.build).not.toContain('migrate');
  });
});

describe('CI and deployment paths', () => {
  const workflows = globSync('.github/workflows/*.yml', { cwd: REPO });

  it('finds the workflows at all', () => {
    // Guards against this suite passing because the glob silently broke.
    expect(workflows.length).toBeGreaterThan(0);
  });

  it('runs no db push in any workflow step', () => {
    const offenders: string[] = [];

    for (const file of workflows) {
      const source = readFileSync(resolve(REPO, file), 'utf8');
      for (const [i, line] of source.split('\n').entries()) {
        // A comment explaining why db push was removed is fine; a step that
        // runs it is not.
        if (line.trimStart().startsWith('#')) continue;
        if (DB_PUSH.test(line)) offenders.push(`${file}:${i + 1}`);
      }
    }

    expect(offenders, `workflow steps running db push: ${offenders.join(', ')}`).toEqual([]);
  });

  it('applies migrations with migrate deploy', () => {
    const ci = readFileSync(resolve(REPO, '.github/workflows/supertool.yml'), 'utf8');
    expect(ci).toContain('prisma migrate deploy');
    expect(ci).toContain('migrate diff');
  });

  it('supplies DIRECT_URL, which the datasource requires', () => {
    // Prisma hard-errors on a declared-but-missing env var. Without this the
    // whole job fails at schema load, before any useful check runs.
    const ci = readFileSync(resolve(REPO, '.github/workflows/supertool.yml'), 'utf8');
    expect(ci).toContain('DIRECT_URL');
  });
});

describe('test and script setup', () => {
  it('builds every test database from the migrations', () => {
    const tests = globSync('tests/**/*.ts', { cwd: APP });
    expect(tests.length).toBeGreaterThan(10);

    const offenders = tests.filter((f) => {
      // This file necessarily contains the pattern it forbids.
      if (f.endsWith('migration-safety.test.ts')) return false;

      const source = readFileSync(resolve(APP, f), 'utf8');
      return source.split('\n').some((line) => {
        // A comment recording that db push was removed is allowed and useful;
        // an execFileSync that runs it is not. Only executable lines count.
        const trimmed = line.trimStart();
        if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*')) {
          return false;
        }
        return trimmed.includes("'db', 'push'") || DB_PUSH.test(trimmed);
      });
    });

    expect(offenders, `tests using db push: ${offenders.join(', ')}`).toEqual([]);
  });

  it('has no shell script that pushes a schema', () => {
    const scripts = globSync('scripts/**/*.{sh,mjs,ts}', { cwd: REPO });
    const offenders = scripts.filter((f) => {
      const source = readFileSync(resolve(REPO, f), 'utf8');
      return source.split('\n').some((l) => !l.trimStart().startsWith('#') && DB_PUSH.test(l));
    });

    expect(offenders, `scripts running db push: ${offenders.join(', ')}`).toEqual([]);
  });
});

describe('the datasource declares a separate direct connection', () => {
  const schema = readFileSync(resolve(APP, 'prisma/schema.prisma'), 'utf8');

  it('routes runtime traffic and migrations through different variables', () => {
    // Whitespace-insensitive: `prisma format` controls the alignment, so
    // asserting exact spacing would break on a reformat rather than on a
    // real regression.
    expect(schema).toMatch(/(?<!direct)url\s*=\s*env\("DATABASE_URL"\)/i);
    expect(schema).toMatch(/directUrl\s*=\s*env\("DIRECT_URL"\)/);
  });

  it('stays on postgresql', () => {
    expect(schema).toContain('provider = "postgresql"');
    expect(schema).not.toContain('provider = "sqlite"');
  });

  it('has at least one migration to deploy', () => {
    const migrations = globSync('prisma/migrations/*/migration.sql', { cwd: APP });
    expect(migrations.length).toBeGreaterThan(0);
  });

  it('records a migration lock naming the provider', () => {
    const lock = readFileSync(resolve(APP, 'prisma/migrations/migration_lock.toml'), 'utf8');
    // Prisma refuses to apply a history created for a different engine. The
    // lock is what makes that check possible.
    expect(lock).toContain('postgresql');
  });
});

describe('.env.example documents both connections without real credentials', () => {
  const example = readFileSync(resolve(APP, '.env.example'), 'utf8');

  it('names both variables', () => {
    expect(example).toContain('DATABASE_URL=');
    expect(example).toContain('DIRECT_URL=');
  });

  it('explains that DIRECT_URL is required, not optional', () => {
    expect(example).toMatch(/DIRECT_URL/);
    expect(example.toLowerCase()).toMatch(/same value|no separate direct endpoint/);
  });

  it('carries placeholders rather than a usable connection string', () => {
    // A real host or password in an example file is a credential in the repo.
    const urls = example.match(/postgresql:\/\/[^\s"']+/g) ?? [];
    expect(urls.length).toBeGreaterThan(0);
    for (const url of urls) {
      expect(url, url).toMatch(/USER:PASSWORD@HOST/);
    }
  });
});
