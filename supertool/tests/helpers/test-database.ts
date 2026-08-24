import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { PrismaClient } from '@prisma/client';

/**
 * A throwaway PostgreSQL database per test file, built by the real migrations.
 *
 * Phase 2 built these databases with `prisma db push`, which computes a diff
 * from the schema file and applies it directly. That made the tests prove the
 * wrong thing: they verified that *the schema file* produces working
 * constraints, when what ships is *the migration history*. A migration that
 * failed to reproduce the schema would have left every one of them green.
 *
 * These now run `prisma migrate deploy` — the same command production uses — so
 * a broken migration fails the test suite rather than surviving to deploy time.
 *
 * **Why a database and not a schema.** The generated migrations qualify every
 * object as `"public"."Table"`, because Prisma bakes the schema name in at
 * generation time. `migrate deploy` against `?schema=test_abc` therefore writes
 * `_prisma_migrations` into `test_abc` while creating the tables in `public`,
 * and fails the moment `public` is already populated. Per-database isolation
 * sidesteps that and matches how a real deployment is laid out. The constraint
 * is recorded in `docs/hosted-postgres-validation.md`, because it also means a
 * hosted validation target must use the `public` schema.
 *
 * **Why no `pg` dependency.** `CREATE DATABASE` cannot run inside a
 * transaction, but `$executeRawUnsafe` issues it standalone, so the Prisma
 * client already present does the job. Adding a driver to call two DDL
 * statements would be a dependency bought for nothing.
 */

function baseUrl(): string {
  return (
    process.env.TEST_DATABASE_URL ??
    process.env.DATABASE_URL ??
    'postgresql://postgres:postgres@127.0.0.1:5432/postgres'
  );
}

/** Maintenance connection. `postgres` always exists and is never under test. */
function adminUrl(): string {
  const u = new URL(baseUrl());
  u.pathname = '/postgres';
  u.searchParams.delete('schema');
  return u.toString();
}

function urlForDatabase(name: string): string {
  const u = new URL(baseUrl());
  u.pathname = `/${name}`;
  // Must be `public`: see the note above about migrations baking in the schema.
  u.searchParams.set('schema', 'public');
  return u.toString();
}

async function withAdmin<T>(fn: (client: PrismaClient) => Promise<T>): Promise<T> {
  const client = new PrismaClient({ datasources: { db: { url: adminUrl() } } });
  try {
    return await fn(client);
  } finally {
    await client.$disconnect();
  }
}

export interface TestDatabase {
  name: string;
  url: string;
  drop: () => Promise<void>;
}

/**
 * Create a disposable database and apply every migration to it.
 *
 * Call from `beforeAll` *before* importing anything that constructs a Prisma
 * client — the client binds `DATABASE_URL` at import time, so this sets both
 * that and `DIRECT_URL` first.
 */
export async function createTestDatabase(prefix = 'test'): Promise<TestDatabase> {
  const name = `${prefix}_${randomBytes(6).toString('hex')}`;

  // An identifier cannot be parameterised. The name is hex we generated here,
  // never caller input, so there is nothing to inject.
  await withAdmin((c) => c.$executeRawUnsafe(`CREATE DATABASE "${name}"`));

  const url = urlForDatabase(name);

  // Both are required: the datasource declares `directUrl`, and Prisma refuses
  // to load a schema whose declared env var is missing.
  process.env.DATABASE_URL = url;
  process.env.DIRECT_URL = url;

  execFileSync('npx', ['prisma', 'migrate', 'deploy'], {
    env: { ...process.env, DATABASE_URL: url, DIRECT_URL: url },
    stdio: 'pipe',
  });

  return {
    name,
    url,
    drop: async () => {
      await withAdmin(async (c) => {
        // An open connection blocks DROP DATABASE, so evict stragglers first.
        await c.$executeRawUnsafe(
          `SELECT pg_terminate_backend(pid) FROM pg_stat_activity
           WHERE datname = '${name}' AND pid <> pg_backend_pid()`,
        );
        await c.$executeRawUnsafe(`DROP DATABASE IF EXISTS "${name}"`);
      });
    },
  };
}
