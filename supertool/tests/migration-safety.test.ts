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
 * These checks are deliberately narrow. They look at paths something *acts on*:
 * package scripts, workflows, shell scripts, test setup — and documentation that
 * tells a human or an automation to run the command.
 *
 * That last category was the gap. The first version of this guard exempted
 * Markdown entirely so the history stayed writable, and `README.md` went on
 * instructing operators to "run `npx prisma db push`" under a heading named
 * *Deploying*. A README is not executable, but a person following it is: it is
 * the most dangerous surviving instance precisely because nothing in CI stops
 * someone who does what the docs say.
 *
 * So the Markdown rule distinguishes **instruction** from **description**.
 * "Run `prisma db push`" fails. "Phase 2 removed `prisma db push`" passes.
 * Banning the string outright would make it impossible to record why it went.
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

/**
 * Words that turn a mention into an instruction.
 *
 * Matched on the same line as the command, in either order, so both
 * "run `prisma db push`" and "`prisma db push` should be used" are caught.
 */
const IMPERATIVE =
  /\b(run|execute|invoke|use|using|apply|call|issue|then|first|next|just|simply)\b/i;

/**
 * Words that mark a mention as historical or prohibitive.
 *
 * Checked before the imperative test, because "never use `db push`" and
 * "we used to run `db push`" both contain an imperative word while forbidding
 * or describing rather than instructing.
 */
const HISTORICAL =
  /\b(never|not|no longer|removed|replaced|instead of|rather than|used to|previously|deprecated|bypass(es|ed)?|forbidden|prohibited|must not|cannot|do not|don't|stopped|dropped|was|were|had)\b/i;

/** True when a documentation line tells someone to run db push. */
export function isInstructionalDbPush(line: string): boolean {
  if (!DB_PUSH.test(line)) return false;
  if (HISTORICAL.test(line)) return false;
  return IMPERATIVE.test(line);
}

describe('documentation does not instruct anyone to run db push', () => {
  // Every Markdown file in the repo, excluding dependencies.
  const docs = [
    ...globSync('*.md', { cwd: REPO }),
    ...globSync('docs/**/*.md', { cwd: REPO }),
    ...globSync('supertool/**/*.md', { cwd: REPO, exclude: (p) => p.includes('node_modules') }),
    ...globSync('wordpress/**/*.md', { cwd: REPO }),
  ];

  it('finds the documentation at all', () => {
    // Guards against this suite passing because the glob silently broke.
    expect(docs.length).toBeGreaterThan(5);
  });

  it('contains no imperative db push anywhere', () => {
    const offenders: string[] = [];

    for (const file of docs) {
      const source = readFileSync(resolve(REPO, file), 'utf8');
      for (const [i, line] of source.split('\n').entries()) {
        if (isInstructionalDbPush(line)) offenders.push(`${file}:${i + 1} — ${line.trim()}`);
      }
    }

    expect(
      offenders,
      `documentation instructing db push:\n  ${offenders.join('\n  ')}`,
    ).toEqual([]);
  });

  it('still allows a historical or prohibitive mention', () => {
    // The guard must not make the history unwritable.
    expect(isInstructionalDbPush('Phase 2 removed `prisma db push` from CI.')).toBe(false);
    expect(isInstructionalDbPush('**Never use `prisma db push` for deployment.**')).toBe(false);
    expect(isInstructionalDbPush('We used to run `prisma db push` here.')).toBe(false);
    expect(isInstructionalDbPush('`db push` bypasses migration history.')).toBe(false);
    expect(isInstructionalDbPush('Use `npm run db:deploy` instead of `prisma db push`.')).toBe(false);
  });

  it('catches the exact instruction this guard was written for', () => {
    // The line that shipped in README.md and slipped past the first version.
    expect(
      isInstructionalDbPush('and run `npx prisma db push`. No schema changes are needed.'),
    ).toBe(true);
  });

  it('catches other phrasings of the same instruction', () => {
    for (const line of [
      'Run `prisma db push` to create the schema.',
      'Then execute prisma db push against your instance.',
      'Apply the schema with `npx prisma db push`.',
      'Just use db push for a quick setup.',
    ]) {
      expect(isInstructionalDbPush(line), line).toBe(true);
    }
  });
});

describe('the README describes the real database posture', () => {
  const readme = readFileSync(resolve(APP, 'README.md'), 'utf8');

  it('states that PostgreSQL is required rather than optional', () => {
    expect(readme).toMatch(/PostgreSQL is the required datasource/i);
    // The old text told operators to switch the provider from SQLite.
    expect(readme).not.toMatch(/SQLite by default/i);
  });

  it('documents both connection variables and their roles', () => {
    expect(readme).toContain('DATABASE_URL');
    expect(readme).toContain('DIRECT_URL');
    expect(readme).toMatch(/pooled/i);
  });

  it('permits identical values only when there is no separate pooled endpoint', () => {
    expect(readme).toMatch(/same.*only when.*no separate pooled endpoint/is);
  });

  it('applies migrations with db:deploy and checks drift with db:drift', () => {
    expect(readme).toContain('npm run db:deploy');
    expect(readme).toContain('npm run db:drift');
  });

  it('forbids db push for deployment and setup', () => {
    expect(readme).toMatch(/Never use `prisma db push` for deployment or setup/i);
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
