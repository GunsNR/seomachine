import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

/**
 * API key scopes, revocation, expiry and quota.
 *
 * Before Phase 2 a key was all-or-nothing and immortal. The same value pasted
 * into a WordPress settings screen — on a machine we do not control — could
 * read visibility data *and* publish content, forever, with no way to withdraw
 * it short of deleting the row and losing the audit trail.
 */

const BASE_URL =
  process.env.TEST_DATABASE_URL ??
  process.env.DATABASE_URL ??
  'postgresql://postgres:postgres@127.0.0.1:5432/postgres';

const schemaName = `test_${randomBytes(6).toString('hex')}`;
const u = new URL(BASE_URL);
u.searchParams.set('schema', schemaName);
const testUrl = u.toString();
process.env.DATABASE_URL = testUrl;

type KeyMod = typeof import('@/lib/apikey');
type DbMod = typeof import('@/lib/db');

let keys: KeyMod;
let db: DbMod['db'];
let projectId = '';

beforeAll(async () => {
  execFileSync('npx', ['prisma', 'db', 'push', '--skip-generate', '--accept-data-loss'], {
    env: { ...process.env, DATABASE_URL: testUrl },
    stdio: 'pipe',
  });

  keys = await import('@/lib/apikey');
  db = (await import('@/lib/db')).db;
});

afterAll(async () => {
  await db?.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schemaName}" CASCADE`).catch(() => undefined);
  await db?.$disconnect();
});

beforeEach(async () => {
  await db.apiKey.deleteMany({});
  await db.project.deleteMany({});
  await db.organization.deleteMany({});

  const org = await db.organization.create({ data: { name: 'Test Org' } });
  const project = await db.project.create({
    data: { orgId: org.id, name: 'Test', domain: 'test.example' },
  });
  projectId = project.id;
});

async function issue(over: Record<string, unknown> = {}) {
  const generated = keys.generateKey();
  const row = await db.apiKey.create({
    data: {
      projectId,
      prefix: generated.prefix,
      hashedKey: generated.hashed,
      scopes: keys.serializeScopes(['visibility:read']),
      ...over,
    },
  });
  return { plaintext: generated.plaintext, id: row.id };
}

describe('scope enforcement', () => {
  it('accepts a key holding the required scope', async () => {
    const { plaintext } = await issue();
    const result = await keys.authenticateApiKey(plaintext, 'visibility:read');
    expect(result.ok).toBe(true);
  });

  it('refuses a key that does not hold it', async () => {
    // The visibility key in a customer's WordPress settings must not publish.
    const { plaintext } = await issue();
    const result = await keys.authenticateApiKey(plaintext, 'publish:write');
    expect(result).toEqual({ ok: false, reason: 'scope' });
  });

  it('accepts any valid key when no scope is demanded', async () => {
    const { plaintext } = await issue();
    expect((await keys.authenticateApiKey(plaintext)).ok).toBe(true);
  });

  it('gives a legacy key the read set plus lead, but never publish', async () => {
    // An existing installation keeps working; it does not silently keep a
    // privilege it may never have needed.
    const { plaintext } = await issue({ scopes: '' });
    expect((await keys.authenticateApiKey(plaintext, 'visibility:read')).ok).toBe(true);
    expect((await keys.authenticateApiKey(plaintext, 'lead:write')).ok).toBe(true);
    expect((await keys.authenticateApiKey(plaintext, 'publish:write')).ok).toBe(false);
  });

  it('ignores an unrecognised scope string rather than honouring it', async () => {
    const { plaintext } = await issue({ scopes: 'visibility:read,admin:everything' });
    const result = await keys.authenticateApiKey(plaintext, 'visibility:read');
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.scopes).not.toContain('admin:everything');
  });
});

describe('revocation and expiry', () => {
  it('refuses a revoked key', async () => {
    const { plaintext, id } = await issue();
    expect(await keys.revokeApiKey(id, projectId)).toBe(true);
    expect(await keys.authenticateApiKey(plaintext, 'visibility:read')).toEqual({
      ok: false,
      reason: 'revoked',
    });
  });

  it('keeps the row after revocation so the audit trail survives', async () => {
    const { id } = await issue();
    await keys.revokeApiKey(id, projectId);
    const row = await db.apiKey.findUnique({ where: { id } });
    expect(row).not.toBeNull();
    expect(row?.revokedAt).not.toBeNull();
  });

  it('will not let one project revoke another project’s key', async () => {
    const { id } = await issue();
    expect(await keys.revokeApiKey(id, 'some-other-project')).toBe(false);
  });

  it('refuses an expired key', async () => {
    const { plaintext } = await issue({ expiresAt: new Date(Date.now() - 1000) });
    expect(await keys.authenticateApiKey(plaintext, 'visibility:read')).toEqual({
      ok: false,
      reason: 'expired',
    });
  });

  it('accepts a key whose expiry is still ahead', async () => {
    const { plaintext } = await issue({ expiresAt: new Date(Date.now() + 60_000) });
    expect((await keys.authenticateApiKey(plaintext, 'visibility:read')).ok).toBe(true);
  });

  it('checks revocation before spending quota', async () => {
    // A dead key must not consume a live key's budget.
    const { plaintext, id } = await issue({ dailyQuota: 5 });
    await keys.revokeApiKey(id, projectId);
    await keys.authenticateApiKey(plaintext, 'visibility:read');
    expect((await db.apiKey.findUnique({ where: { id } }))?.usageCount).toBe(0);
  });
});

describe('daily quota', () => {
  it('permits requests up to the limit and refuses past it', async () => {
    const { plaintext } = await issue({ dailyQuota: 3 });
    for (let i = 0; i < 3; i++) {
      expect((await keys.authenticateApiKey(plaintext, 'visibility:read')).ok, `call ${i}`).toBe(true);
    }
    expect(await keys.authenticateApiKey(plaintext, 'visibility:read')).toEqual({
      ok: false,
      reason: 'quota',
    });
  });

  it('treats zero as unlimited', async () => {
    const { plaintext } = await issue({ dailyQuota: 0 });
    for (let i = 0; i < 10; i++) {
      expect((await keys.authenticateApiKey(plaintext, 'visibility:read')).ok).toBe(true);
    }
  });

  it('rolls the window over on a new UTC day without a reset job', async () => {
    const { plaintext, id } = await issue({ dailyQuota: 2 });
    await keys.authenticateApiKey(plaintext, 'visibility:read');
    await keys.authenticateApiKey(plaintext, 'visibility:read');
    expect((await keys.authenticateApiKey(plaintext, 'visibility:read')).ok).toBe(false);

    // Same counter, next day.
    const tomorrow = new Date(Date.now() + 86_400_000);
    expect((await keys.authenticateApiKey(plaintext, 'visibility:read', tomorrow)).ok).toBe(true);
    expect((await db.apiKey.findUnique({ where: { id } }))?.usageCount).toBe(1);
  });
});

describe('key shape', () => {
  it('never stores the plaintext', async () => {
    const { plaintext, id } = await issue();
    const row = await db.apiKey.findUnique({ where: { id } });
    expect(row?.hashedKey).not.toBe(plaintext);
    expect(row?.hashedKey).toMatch(/^[0-9a-f]{64}$/);
  });

  it('refuses a malformed presentation without touching the database', async () => {
    for (const bad of ['', 'nope', 'rlst_', 'Bearer x']) {
      expect((await keys.authenticateApiKey(bad, 'visibility:read')).ok, bad).toBe(false);
    }
  });

  it('refuses an unknown key', async () => {
    const other = keys.generateKey();
    expect(await keys.authenticateApiKey(other.plaintext, 'visibility:read')).toEqual({
      ok: false,
      reason: 'unknown',
    });
  });
});
