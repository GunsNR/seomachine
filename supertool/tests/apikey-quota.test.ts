import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

/**
 * Atomic quota admission.
 *
 * Admission used to read the group's usage, decide, and write back in three
 * separate statements. Two requests arriving together both read the same total
 * and were both admitted — and because they then wrote the same value, the
 * overage left no trace in the counter afterwards. These tests are mostly about
 * the case that arrangement could never handle: simultaneity.
 */

import { createTestDatabase, type TestDatabase } from './helpers/test-database';

let database: TestDatabase;

type KeyMod = typeof import('@/lib/apikey');
type DbMod = typeof import('@/lib/db');

let keys: KeyMod;
let db: DbMod['db'];
let orgId = '';
let otherOrgId = '';
let projectId = '';
let otherProjectId = '';

beforeAll(async () => {
  database = await createTestDatabase('apikeyquota');
  keys = await import('@/lib/apikey');
  db = (await import('@/lib/db')).db;
});

afterAll(async () => {
  await db?.$disconnect();
  await database?.drop();
});

beforeEach(async () => {
  await db.apiQuotaCounter.deleteMany({});
  await db.apiKeyEvent.deleteMany({});
  await db.apiKey.deleteMany({});
  await db.project.deleteMany({});
  await db.organization.deleteMany({});

  const org = await db.organization.create({ data: { name: 'Test Org' } });
  const project = await db.project.create({
    data: { orgId: org.id, name: 'Test', domain: 'test.example' },
  });
  orgId = org.id;
  projectId = project.id;

  const other = await db.organization.create({ data: { name: 'Other Org' } });
  const otherProject = await db.project.create({
    data: { orgId: other.id, name: 'Other', domain: 'other.example' },
  });
  otherOrgId = other.id;
  otherProjectId = otherProject.id;
});

async function issue(over: Record<string, unknown> = {}, target = projectId) {
  const generated = keys.generateKey();
  const row = await db.apiKey.create({
    data: {
      projectId: target,
      orgId: target === projectId ? orgId : otherOrgId,
      quotaGroupId: keys.newQuotaGroupId(),
      prefix: generated.prefix,
      hashedKey: generated.hashed,
      scopes: keys.serializeScopes(['visibility:read']),
      ...over,
    },
  });
  return { plaintext: generated.plaintext, id: row.id, quotaGroupId: row.quotaGroupId };
}

const DAY = '2026-08-30';

describe('simultaneous requests cannot exceed the limit', () => {
  it('admits exactly the limit when 20 requests race for 5 places', async () => {
    // The whole point. Under the old read-decide-write this admitted far more
    // than five, because every caller read the same starting count.
    const group = keys.newQuotaGroupId();
    const results = await Promise.all(
      Array.from({ length: 20 }, () => keys.admitQuota(orgId, group, DAY, 5)),
    );

    expect(results.filter((r) => r.admitted)).toHaveLength(5);
    expect(results.filter((r) => !r.admitted)).toHaveLength(15);

    const counter = await db.apiQuotaCounter.findFirstOrThrow({ where: { quotaGroupId: group } });
    expect(counter.used).toBe(5);
  });

  it('gives every admitted request a distinct position in the budget', async () => {
    // If two callers ever shared a returned count, they shared a slot.
    const group = keys.newQuotaGroupId();
    const results = await Promise.all(
      Array.from({ length: 10 }, () => keys.admitQuota(orgId, group, DAY, 10)),
    );

    const positions = results.filter((r) => r.admitted).map((r) => r.used).sort((a, b) => a - b);
    expect(positions).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  });

  it('holds under concurrency through the full authentication path', async () => {
    const key = await issue({ dailyQuota: 3 });
    const attempts = await Promise.all(
      Array.from({ length: 12 }, () => keys.authenticateApiKey(key.plaintext)),
    );

    expect(attempts.filter((a) => a.ok)).toHaveLength(3);
    for (const refused of attempts.filter((a) => !a.ok)) {
      if (!refused.ok) expect(refused.reason).toBe('quota');
    }
  });

  it('never lets a race create two counter rows for one group and day', async () => {
    const group = keys.newQuotaGroupId();
    await Promise.all(Array.from({ length: 15 }, () => keys.admitQuota(orgId, group, DAY, 0)));

    const rows = await db.apiQuotaCounter.findMany({ where: { quotaGroupId: group } });
    expect(rows).toHaveLength(1);
    expect(rows[0].used).toBe(15);
  });
});

describe('the exact limit', () => {
  it('admits the request that lands on the limit and refuses the next', async () => {
    const group = keys.newQuotaGroupId();

    expect((await keys.admitQuota(orgId, group, DAY, 3)).used).toBe(1);
    expect((await keys.admitQuota(orgId, group, DAY, 3)).used).toBe(2);

    const atLimit = await keys.admitQuota(orgId, group, DAY, 3);
    expect(atLimit.admitted).toBe(true);
    expect(atLimit.used).toBe(3);

    const overLimit = await keys.admitQuota(orgId, group, DAY, 3);
    expect(overLimit.admitted).toBe(false);
  });

  it('admits exactly one request against a limit of one', async () => {
    const group = keys.newQuotaGroupId();
    expect((await keys.admitQuota(orgId, group, DAY, 1)).admitted).toBe(true);
    expect((await keys.admitQuota(orgId, group, DAY, 1)).admitted).toBe(false);
  });

  it('treats a limit of zero as unlimited, matching dailyQuota', async () => {
    const group = keys.newQuotaGroupId();
    for (let i = 0; i < 50; i++) {
      expect((await keys.admitQuota(orgId, group, DAY, 0)).admitted).toBe(true);
    }
    const counter = await db.apiQuotaCounter.findFirstOrThrow({ where: { quotaGroupId: group } });
    expect(counter.used).toBe(50);
  });
});

describe('a refused request spends nothing', () => {
  it('leaves the counter untouched when the limit is already reached', async () => {
    const group = keys.newQuotaGroupId();
    await keys.admitQuota(orgId, group, DAY, 2);
    await keys.admitQuota(orgId, group, DAY, 2);

    const before = await db.apiQuotaCounter.findFirstOrThrow({ where: { quotaGroupId: group } });
    for (let i = 0; i < 5; i++) await keys.admitQuota(orgId, group, DAY, 2);
    const after = await db.apiQuotaCounter.findFirstOrThrow({ where: { quotaGroupId: group } });

    // The refusal *is* the skipped increment. Repeated rejected traffic cannot
    // inflate the counter and so cannot extend an outage past midnight.
    expect(after.used).toBe(before.used);
    expect(after.used).toBe(2);
  });

  it('does not spend the budget when the key is refused before the quota check', async () => {
    // A revoked key must not consume a live key's allowance.
    const key = await issue({ dailyQuota: 5, revokedAt: new Date() });
    const verdict = await keys.authenticateApiKey(key.plaintext);
    expect(verdict.ok).toBe(false);

    expect(await db.apiQuotaCounter.count({})).toBe(0);
  });

  it('does not spend the budget when the scope is wrong', async () => {
    const key = await issue({ dailyQuota: 5, scopes: keys.serializeScopes(['visibility:read']) });
    const verdict = await keys.authenticateApiKey(key.plaintext, 'publish:write');
    expect(verdict.ok).toBe(false);
    if (!verdict.ok) expect(verdict.reason).toBe('scope');

    expect(await db.apiQuotaCounter.count({})).toBe(0);
  });
});

describe('rotated keys share one counter', () => {
  it('spends a single budget across the overlap', async () => {
    const old = await issue({ dailyQuota: 4 });
    const rotated = await keys.rotateApiKey({
      keyId: old.id, orgId, actorUserId: 'user-1', actorRole: 'owner',
    });
    if (!rotated.ok) throw new Error('rotation failed');

    expect((await keys.authenticateApiKey(old.plaintext)).ok).toBe(true);
    expect((await keys.authenticateApiKey(rotated.plaintext)).ok).toBe(true);
    expect((await keys.authenticateApiKey(old.plaintext)).ok).toBe(true);
    expect((await keys.authenticateApiKey(rotated.plaintext)).ok).toBe(true);

    // Four spent between them; the fifth is refused on either key.
    expect((await keys.authenticateApiKey(rotated.plaintext)).ok).toBe(false);
    expect((await keys.authenticateApiKey(old.plaintext)).ok).toBe(false);

    // And it is one row, not two.
    const rows = await db.apiQuotaCounter.findMany({});
    expect(rows).toHaveLength(1);
    expect(rows[0].used).toBe(4);
  });

  it('holds the shared budget under concurrent use of both keys', async () => {
    const old = await issue({ dailyQuota: 6 });
    const rotated = await keys.rotateApiKey({
      keyId: old.id, orgId, actorUserId: 'user-1', actorRole: 'owner',
    });
    if (!rotated.ok) throw new Error('rotation failed');

    const attempts = await Promise.all([
      ...Array.from({ length: 10 }, () => keys.authenticateApiKey(old.plaintext)),
      ...Array.from({ length: 10 }, () => keys.authenticateApiKey(rotated.plaintext)),
    ]);

    expect(attempts.filter((a) => a.ok)).toHaveLength(6);
  });
});

describe('separate groups keep separate budgets', () => {
  it('does not let one group exhaust another', async () => {
    const mine = await issue({ dailyQuota: 2 });
    const theirs = await issue({ dailyQuota: 2 });

    expect((await keys.authenticateApiKey(mine.plaintext)).ok).toBe(true);
    expect((await keys.authenticateApiKey(mine.plaintext)).ok).toBe(true);
    expect((await keys.authenticateApiKey(mine.plaintext)).ok).toBe(false);

    expect((await keys.authenticateApiKey(theirs.plaintext)).ok).toBe(true);
    expect((await keys.authenticateApiKey(theirs.plaintext)).ok).toBe(true);
  });

  it('keeps tenants apart even when a group id collides', async () => {
    const shared = 'grp_collision';
    const mine = await issue({ dailyQuota: 2, quotaGroupId: shared });
    const theirs = await issue({ dailyQuota: 2, quotaGroupId: shared }, otherProjectId);

    expect((await keys.authenticateApiKey(mine.plaintext)).ok).toBe(true);
    expect((await keys.authenticateApiKey(mine.plaintext)).ok).toBe(true);
    expect((await keys.authenticateApiKey(mine.plaintext)).ok).toBe(false);

    // The other tenant has spent nothing, despite the identical group string.
    expect((await keys.authenticateApiKey(theirs.plaintext)).ok).toBe(true);
    expect((await keys.authenticateApiKey(theirs.plaintext)).ok).toBe(true);

    // Two rows, one per tenant.
    expect(await db.apiQuotaCounter.count({})).toBe(2);
  });
});

describe('UTC day rollover', () => {
  it('starts a new counter on a new day without any job running', async () => {
    const group = keys.newQuotaGroupId();
    await keys.admitQuota(orgId, group, '2026-08-30', 2);
    await keys.admitQuota(orgId, group, '2026-08-30', 2);
    expect((await keys.admitQuota(orgId, group, '2026-08-30', 2)).admitted).toBe(false);

    // Same group, next day: a different unique key, so a fresh row at 1.
    const nextDay = await keys.admitQuota(orgId, group, '2026-08-31', 2);
    expect(nextDay.admitted).toBe(true);
    expect(nextDay.used).toBe(1);

    const rows = await db.apiQuotaCounter.findMany({
      where: { quotaGroupId: group }, orderBy: { usageDay: 'asc' },
    });
    expect(rows.map((r) => [r.usageDay, r.used])).toEqual([
      ['2026-08-30', 2],
      ['2026-08-31', 1],
    ]);
  });

  it('rolls over through the authentication path as the clock crosses midnight', async () => {
    const key = await issue({ dailyQuota: 1 });
    const lateYesterday = new Date('2026-08-30T23:59:59.000Z');
    const earlyToday = new Date('2026-08-31T00:00:01.000Z');

    expect((await keys.authenticateApiKey(key.plaintext, undefined, lateYesterday)).ok).toBe(true);
    expect((await keys.authenticateApiKey(key.plaintext, undefined, lateYesterday)).ok).toBe(false);

    // A second past midnight the budget is whole again.
    expect((await keys.authenticateApiKey(key.plaintext, undefined, earlyToday)).ok).toBe(true);
  });

  it('does not let yesterday\'s exhausted counter refuse today', async () => {
    const group = keys.newQuotaGroupId();
    for (let i = 0; i < 3; i++) await keys.admitQuota(orgId, group, '2026-08-29', 3);
    expect((await keys.admitQuota(orgId, group, '2026-08-29', 3)).admitted).toBe(false);
    expect((await keys.admitQuota(orgId, group, '2026-08-30', 3)).admitted).toBe(true);
  });
});

describe('per-key bookkeeping still works, but no longer admits', () => {
  it('keeps counting per key for display', async () => {
    const key = await issue({ dailyQuota: 10 });
    await keys.authenticateApiKey(key.plaintext);
    await keys.authenticateApiKey(key.plaintext);

    const row = await db.apiKey.findUniqueOrThrow({ where: { id: key.id } });
    expect(row.usageCount).toBe(2);
    expect(row.lastUsedAt).not.toBeNull();
  });

  it('is not what the limit is read from', async () => {
    // Hand the key row a usage count far above its quota. The counter, not the
    // key row, decides — so the request is still admitted.
    const key = await issue({ dailyQuota: 2 });
    await db.apiKey.update({
      where: { id: key.id },
      data: { usageCount: 999, usageDay: keys.utcDay() },
    });

    expect((await keys.authenticateApiKey(key.plaintext)).ok).toBe(true);
  });
});
