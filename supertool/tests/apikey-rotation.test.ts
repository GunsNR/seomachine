import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

/**
 * API key rotation with a bounded overlap.
 *
 * Revocation alone is a trap: it breaks the customer's integration at the exact
 * moment they discover a leak, so in practice nobody revokes and the leaked key
 * stays live. Rotation makes the safe action the convenient one — but only if
 * the overlap it introduces cannot itself be abused. These tests are mostly
 * about the second half of that sentence.
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
  database = await createTestDatabase('apikeyrotation');
  keys = await import('@/lib/apikey');
  db = (await import('@/lib/db')).db;
});

afterAll(async () => {
  await db?.$disconnect();
  await database?.drop();
});

beforeEach(async () => {
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
      scopes: keys.serializeScopes(['visibility:read', 'lead:write']),
      ...over,
    },
  });
  return { plaintext: generated.plaintext, id: row.id };
}

const rotate = (keyId: string, over: Record<string, unknown> = {}) =>
  keys.rotateApiKey({ keyId, orgId, actorUserId: 'user-1', actorRole: 'owner', ...over });

describe('the overlap window', () => {
  it('leaves both keys working while it is open', async () => {
    const old = await issue();
    const result = await rotate(old.id);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    // The new key is usable at once — that is what makes rotating safe to do
    // before the integration has been updated.
    expect((await keys.authenticateApiKey(result.plaintext)).ok).toBe(true);
    // And the old one still answers, so nothing breaks in the meantime.
    expect((await keys.authenticateApiKey(old.plaintext)).ok).toBe(true);
  });

  it('kills the old key the moment the window closes, with nothing running', async () => {
    const old = await issue();
    const result = await rotate(old.id);
    if (!result.ok) throw new Error('rotation failed');

    const afterOverlap = new Date(result.overlapExpiresAt.getTime() + 1_000);
    const verdict = await keys.authenticateApiKey(old.plaintext, undefined, afterOverlap);

    expect(verdict.ok).toBe(false);
    if (verdict.ok) return;
    // Expiry is evaluated where the key is presented. No sweep, no worker, so
    // nothing has to be running for the old key to stop working.
    expect(verdict.reason).toBe('overlap_expired');

    // The replacement is unaffected by its predecessor's death.
    expect((await keys.authenticateApiKey(result.plaintext, undefined, afterOverlap)).ok).toBe(true);
  });

  it('is exactly 24 hours', async () => {
    const old = await issue();
    const now = new Date('2026-03-01T12:00:00.000Z');
    const result = await rotate(old.id, { now });
    if (!result.ok) throw new Error('rotation failed');

    expect(result.overlapExpiresAt.toISOString()).toBe('2026-03-02T12:00:00.000Z');
    expect(keys.ROTATION_OVERLAP_MS).toBe(24 * 60 * 60 * 1000);
  });

  it('can be ended early by revoking the old key', async () => {
    const old = await issue();
    const result = await rotate(old.id);
    if (!result.ok) throw new Error('rotation failed');

    expect(await keys.revokeApiKey(old.id, projectId)).toBe(true);

    const verdict = await keys.authenticateApiKey(old.plaintext);
    expect(verdict.ok).toBe(false);
    if (!verdict.ok) expect(verdict.reason).toBe('revoked');
    // Revoking the predecessor must not take the replacement with it.
    expect((await keys.authenticateApiKey(result.plaintext)).ok).toBe(true);
  });
});

describe('the replacement inherits, and never gains', () => {
  it('carries the same project, scopes, quota and expiry', async () => {
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    const old = await issue({
      scopes: keys.serializeScopes(['visibility:read']),
      dailyQuota: 25,
      expiresAt,
      label: 'Plugin key',
    });

    const result = await rotate(old.id);
    if (!result.ok) throw new Error('rotation failed');

    const successor = await db.apiKey.findUniqueOrThrow({ where: { id: result.newKeyId } });
    expect(successor.projectId).toBe(projectId);
    expect(successor.scopes).toBe(keys.serializeScopes(['visibility:read']));
    expect(successor.dailyQuota).toBe(25);
    expect(successor.expiresAt?.toISOString()).toBe(expiresAt.toISOString());
    expect(successor.label).toBe('Plugin key');
  });

  it('cannot widen a scope', async () => {
    const old = await issue({ scopes: keys.serializeScopes(['visibility:read']) });
    const result = await rotate(old.id);
    if (!result.ok) throw new Error('rotation failed');

    // A key that could not publish before cannot publish after. Rotation is a
    // replacement, not a re-grant.
    const verdict = await keys.authenticateApiKey(result.plaintext, 'publish:write');
    expect(verdict.ok).toBe(false);
    if (!verdict.ok) expect(verdict.reason).toBe('scope');
  });

  it('cannot extend a key past the expiry its issuer chose', async () => {
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000);
    const old = await issue({ expiresAt });
    const result = await rotate(old.id);
    if (!result.ok) throw new Error('rotation failed');

    // Rotating an hour before expiry must not buy 24 more hours.
    const afterExpiry = new Date(expiresAt.getTime() + 1_000);
    const verdict = await keys.authenticateApiKey(result.plaintext, undefined, afterExpiry);
    expect(verdict.ok).toBe(false);
    if (!verdict.ok) expect(verdict.reason).toBe('expired');
  });
});

describe('the pair shares one budget', () => {
  it('does not double the daily quota during the overlap', async () => {
    const old = await issue({ dailyQuota: 3 });
    const result = await rotate(old.id);
    if (!result.ok) throw new Error('rotation failed');

    // Two calls on the old key, one on the new: three against a budget of three.
    expect((await keys.authenticateApiKey(old.plaintext)).ok).toBe(true);
    expect((await keys.authenticateApiKey(old.plaintext)).ok).toBe(true);
    expect((await keys.authenticateApiKey(result.plaintext)).ok).toBe(true);

    // The fourth is over budget whichever key presents it. Without a shared
    // group, rotating would have handed out three more calls for free.
    const viaNew = await keys.authenticateApiKey(result.plaintext);
    expect(viaNew.ok).toBe(false);
    if (!viaNew.ok) expect(viaNew.reason).toBe('quota');

    const viaOld = await keys.authenticateApiKey(old.plaintext);
    expect(viaOld.ok).toBe(false);
    if (!viaOld.ok) expect(viaOld.reason).toBe('quota');
  });

  it('does not reset the budget by rotating repeatedly', async () => {
    const old = await issue({ dailyQuota: 2 });
    const first = await rotate(old.id);
    if (!first.ok) throw new Error('rotation failed');
    expect((await keys.authenticateApiKey(first.plaintext)).ok).toBe(true);

    const second = await keys.rotateApiKey({
      keyId: first.newKeyId, orgId, actorUserId: 'user-1', actorRole: 'owner',
    });
    if (!second.ok) throw new Error('second rotation failed');

    // One call left in the group, then nothing — the chain keeps one budget.
    expect((await keys.authenticateApiKey(second.plaintext)).ok).toBe(true);
    const third = await keys.authenticateApiKey(second.plaintext);
    expect(third.ok).toBe(false);
    if (!third.ok) expect(third.reason).toBe('quota');
  });
});

describe('rotation is atomic and fails closed', () => {
  it('produces exactly one successor under concurrent rotation', async () => {
    const old = await issue();

    const results = await Promise.all([rotate(old.id), rotate(old.id), rotate(old.id)]);
    const winners = results.filter((r) => r.ok);
    const losers = results.filter((r) => !r.ok);

    expect(winners).toHaveLength(1);
    expect(losers).toHaveLength(2);
    for (const loser of losers) {
      if (!loser.ok) expect(loser.reason).toBe('already_rotated');
    }

    // And the database agrees: one row claims this predecessor.
    const successors = await db.apiKey.findMany({ where: { rotatedFromId: old.id } });
    expect(successors).toHaveLength(1);
  });

  it('refuses to rotate a key twice in sequence', async () => {
    const old = await issue();
    expect((await rotate(old.id)).ok).toBe(true);

    const again = await rotate(old.id);
    expect(again.ok).toBe(false);
    if (!again.ok) expect(again.reason).toBe('already_rotated');
  });

  it('refuses a revoked key', async () => {
    const old = await issue({ revokedAt: new Date() });
    const result = await rotate(old.id);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('revoked');
  });

  it('refuses an expired key', async () => {
    const old = await issue({ expiresAt: new Date(Date.now() - 1_000) });
    const result = await rotate(old.id);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('expired');
  });

  it('refuses a key belonging to another tenant, without confirming it exists', async () => {
    const foreign = await issue({}, otherProjectId);
    const result = await rotate(foreign.id);

    expect(result.ok).toBe(false);
    // Reported as missing rather than forbidden: "exists but is not yours" is
    // an existence oracle for another tenant's key ids.
    if (!result.ok) expect(result.reason).toBe('not_found');

    // Nothing was written into the other tenant's project.
    expect(await db.apiKey.count({ where: { projectId: otherProjectId } })).toBe(1);
    expect(await db.apiKeyEvent.count({})).toBe(0);
  });

  it('leaves no trace when a rotation is refused', async () => {
    const old = await issue({ revokedAt: new Date() });
    await rotate(old.id);

    expect(await db.apiKey.count({ where: { projectId } })).toBe(1);
    expect(await db.apiKeyEvent.count({})).toBe(0);
  });

  it('rotates for another org only when the org matches the key', async () => {
    const mine = await issue();
    const crossed = await keys.rotateApiKey({
      keyId: mine.id, orgId: otherOrgId, actorUserId: 'intruder', actorRole: 'owner',
    });
    expect(crossed.ok).toBe(false);
    if (!crossed.ok) expect(crossed.reason).toBe('not_found');
  });
});

describe('the plaintext is returned once and never stored', () => {
  it('persists only a digest, never the key or anything containing it', async () => {
    const old = await issue();
    const result = await rotate(old.id);
    if (!result.ok) throw new Error('rotation failed');

    const successor = await db.apiKey.findUniqueOrThrow({ where: { id: result.newKeyId } });
    expect(successor.hashedKey).toBe(keys.hashKey(result.plaintext));
    expect(successor.hashedKey).not.toBe(result.plaintext);

    // The stored row, serialized whole, must not contain the secret. The prefix
    // is deliberately excluded from this check — it is a display label and is
    // stored on purpose.
    const body = result.plaintext.slice(result.prefix.length);
    expect(JSON.stringify(successor)).not.toContain(body);
  });

  it('keeps key material out of the audit trail entirely', async () => {
    const old = await issue();
    const result = await rotate(old.id);
    if (!result.ok) throw new Error('rotation failed');

    const events = await db.apiKeyEvent.findMany({});
    expect(events).toHaveLength(1);

    const serialized = JSON.stringify(events[0]);
    expect(serialized).not.toContain(result.plaintext);
    expect(serialized).not.toContain(keys.hashKey(result.plaintext));
  });

  it('records who rotated what, and when the old key dies', async () => {
    const old = await issue();
    const result = await rotate(old.id);
    if (!result.ok) throw new Error('rotation failed');

    const event = await db.apiKeyEvent.findFirstOrThrow({});
    expect(event.action).toBe('rotated');
    expect(event.keyId).toBe(old.id);
    expect(event.successorKeyId).toBe(result.newKeyId);
    expect(event.actorUserId).toBe('user-1');
    expect(event.actorRole).toBe('owner');
    expect(event.overlapExpiresAt?.toISOString()).toBe(result.overlapExpiresAt.toISOString());
    expect(event.projectId).toBe(projectId);
  });

  it('has no column that could hold key material', () => {
    // Structural, so a later migration cannot quietly add one.
    const schema = readFileSync(resolve(__dirname, '../prisma/schema.prisma'), 'utf8');
    const model = schema.slice(schema.indexOf('model ApiKeyEvent'));
    const body = model.slice(0, model.indexOf('\n}'));
    expect(body).not.toMatch(/hashedKey|plaintext|secret|\bkey\s+String/i);
  });
});

describe('only an authorized role may rotate', () => {
  it('grants apikey:manage to owner and admin, and to nobody else', async () => {
    const { can } = await import('@/lib/rbac');
    expect(can('owner', 'apikey:manage')).toBe(true);
    expect(can('admin', 'apikey:manage')).toBe(true);
    expect(can('member', 'apikey:manage')).toBe(false);
    expect(can('viewer', 'apikey:manage')).toBe(false);
  });

  it('is gated on that permission in the route, on every method', () => {
    const source = readFileSync(
      resolve(__dirname, '../src/app/api/app/api-keys/route.ts'),
      'utf8',
    );
    const handlers = source.match(/export async function (POST|PATCH|DELETE)/g) ?? [];
    expect(handlers).toHaveLength(3);
    // One guard per handler, so adding a method cannot silently skip the check.
    expect(source.match(/can\(session\.role, 'apikey:manage'\)/g)).toHaveLength(3);
    expect(source.match(/if \(!session\)/g)).toHaveLength(3);
  });
});

describe('the response carrying a secret is never cacheable', () => {
  const route = () =>
    readFileSync(resolve(__dirname, '../src/app/api/app/api-keys/route.ts'), 'utf8');

  it('sends Cache-Control: no-store from every response in the route', () => {
    // The route was observed emitting no Cache-Control header at all — the
    // `force-dynamic` export does not imply one — so a shared cache or a
    // back/forward navigation could retain the single copy of a plaintext key.
    const source = route();
    expect(source).toContain("headers: { 'Cache-Control': 'no-store' }");

    // Exactly one bare NextResponse.json: the helper that sets the header.
    // Everything else must route through it, so a new handler cannot forget.
    expect(source.match(/NextResponse\.json\(/g)).toHaveLength(1);
    expect(source.match(/return json\(/g)?.length ?? 0).toBeGreaterThanOrEqual(10);
  });

  it('sends it on the successful create response, which carries a key', () => {
    // The success paths are the ones that matter: a 401 with no-store protects
    // nothing. Both secret-bearing returns must go through the helper.
    const source = route();
    expect(source).toMatch(/return json\(\{ ok: true, key: plaintext, prefix \}\)/);
  });

  it('sends it on the successful rotate response, which carries a key', () => {
    const source = route();
    const rotateReturn = source.slice(source.indexOf('previousKeyId: result.previousKeyId') - 200);
    expect(rotateReturn).toMatch(/return json\(\{/);
    expect(rotateReturn).toContain('key: result.plaintext');
  });

  it('never puts key material in a URL, a log or browser storage', () => {
    const source = route();
    const ui = readFileSync(
      resolve(__dirname, '../src/app/app/settings/ApiKeyManager.tsx'),
      'utf8',
    );
    for (const file of [source, ui]) {
      expect(file).not.toMatch(/localStorage|sessionStorage/);
      expect(file).not.toMatch(/console\.(log|info|warn|error)/);
    }
    // Only the key *id* is ever a query parameter; the secret travels in a
    // request body and a response body, never in a URL.
    expect(ui).not.toMatch(/\?key=|&key=/);
  });
});

describe('every key has a real quota group, enforced by the database', () => {
  it('refuses to store an empty group', async () => {
    // The column is NOT NULL and CHECK <> '', so there is no falsy value left
    // for application code to interpret as "just this key".
    await expect(
      db.apiKey.create({
        data: {
          projectId, orgId,
          prefix: 'rlst_empty00', hashedKey: 'h', quotaGroupId: '',
        },
      }),
    ).rejects.toThrow();
  });

  it('gives independently created keys distinct groups', async () => {
    const a = await issue();
    const b = await issue();
    const rows = await db.apiKey.findMany({ where: { id: { in: [a.id, b.id] } } });
    const groups = rows.map((r) => r.quotaGroupId);

    expect(new Set(groups).size).toBe(2);
    for (const g of groups) expect(g).not.toBe('');
  });

  it('keeps a successor on the predecessor\'s exact group', async () => {
    const old = await issue();
    const before = await db.apiKey.findUniqueOrThrow({ where: { id: old.id } });
    const result = await rotate(old.id);
    if (!result.ok) throw new Error('rotation failed');

    const predecessor = await db.apiKey.findUniqueOrThrow({ where: { id: old.id } });
    const successor = await db.apiKey.findUniqueOrThrow({ where: { id: result.newKeyId } });

    // Inherited verbatim — not recomputed, not reset.
    expect(predecessor.quotaGroupId).toBe(before.quotaGroupId);
    expect(successor.quotaGroupId).toBe(before.quotaGroupId);
  });

  it('keeps one group across a chain of rotations', async () => {
    const first = await issue();
    const original = (await db.apiKey.findUniqueOrThrow({ where: { id: first.id } })).quotaGroupId;

    const second = await rotate(first.id);
    if (!second.ok) throw new Error('rotation failed');
    const third = await keys.rotateApiKey({
      keyId: second.newKeyId, orgId, actorUserId: 'user-1', actorRole: 'owner',
    });
    if (!third.ok) throw new Error('rotation failed');

    const rows = await db.apiKey.findMany({ where: { projectId } });
    expect(rows).toHaveLength(3);
    expect(new Set(rows.map((r) => r.quotaGroupId))).toEqual(new Set([original]));
  });

  it('cannot combine usage across tenants even when group ids collide', async () => {
    // The strongest form of the guarantee: force two tenants onto a literally
    // identical group id — which the application would never produce — and the
    // tenant constraint must still keep their budgets apart.
    const shared = 'grp_collision';
    const mine = await issue({ dailyQuota: 2, quotaGroupId: shared });
    const theirs = await issue({ dailyQuota: 2, quotaGroupId: shared }, otherProjectId);

    expect((await keys.authenticateApiKey(mine.plaintext)).ok).toBe(true);
    expect((await keys.authenticateApiKey(mine.plaintext)).ok).toBe(true);
    const exhausted = await keys.authenticateApiKey(mine.plaintext);
    expect(exhausted.ok).toBe(false);
    if (!exhausted.ok) expect(exhausted.reason).toBe('quota');

    // The other tenant has spent nothing, despite sharing the group string.
    expect((await keys.authenticateApiKey(theirs.plaintext)).ok).toBe(true);
    expect((await keys.authenticateApiKey(theirs.plaintext)).ok).toBe(true);
  });
});

describe('the migration establishes the invariant rather than assuming it', () => {
  const sql = () =>
    readFileSync(
      resolve(__dirname, '../prisma/migrations/20260828224249_apikey_rotation_overlap/migration.sql'),
      'utf8',
    );

  it('backfills every pre-existing key to its own group, then locks the column', () => {
    const migration = sql();
    // Own id: unique by construction, stable, and never another tenant's.
    expect(migration).toMatch(/UPDATE "public"\."ApiKey" SET "quotaGroupId" = "id"/);
    expect(migration).toMatch(/ALTER COLUMN "quotaGroupId" SET NOT NULL/);
    expect(migration).toMatch(/CHECK \("quotaGroupId" <> ''\)/);
  });

  it('backfills the tenant column from Project and makes it required', () => {
    const migration = sql();
    expect(migration).toMatch(/SET "orgId" = p\."orgId"/);
    expect(migration).toMatch(/ALTER COLUMN "orgId" SET NOT NULL/);
  });

  it('indexes the authentication-path lookup on tenant and group together', () => {
    expect(sql()).toMatch(/CREATE INDEX "ApiKey_orgId_quotaGroupId_idx"/);
    const schema = readFileSync(resolve(__dirname, '../prisma/schema.prisma'), 'utf8');
    expect(schema).toContain('@@index([orgId, quotaGroupId])');
  });

  it('leaves no falsy-group special case in the authentication path', () => {
    const source = readFileSync(resolve(__dirname, '../src/lib/apikey.ts'), 'utf8');
    expect(source).not.toMatch(/quotaGroupId \|\|/);
    expect(source).not.toMatch(/if \(match\.quotaGroupId\)/);
    // And the group lookup always carries the tenant. The shape changed when
    // admission moved into one atomic statement; the requirement did not.
    expect(source).toMatch(/admitQuota\(match\.orgId, match\.quotaGroupId,/);
  });
});

describe('the registry and the truth audit describe keys accurately', () => {
  const capabilities = () =>
    readFileSync(resolve(__dirname, '../src/lib/capabilities.ts'), 'utf8');
  const audit = () =>
    readFileSync(resolve(__dirname, '../../docs/release-truth-audit.md'), 'utf8');

  it('no longer claims keys lack scopes, quotas or rotation', () => {
    // The registry said all three were missing long after two of them shipped.
    const publicApi = capabilities().slice(capabilities().indexOf('public_api: {'));
    const block = publicApi.slice(0, publicApi.indexOf('\n  },'));
    expect(block).not.toMatch(/no scopes/i);
    expect(block).not.toMatch(/no per-key quota/i);
    expect(block).not.toMatch(/no rotation flow/i);
  });

  it('points at the tests that actually cover key behaviour', () => {
    const publicApi = capabilities().slice(capabilities().indexOf('public_api: {'));
    const block = publicApi.slice(0, publicApi.indexOf('\n  },'));
    expect(block).toContain('tests/apikey-scopes.test.ts');
    expect(block).toContain('tests/apikey-rotation.test.ts');
  });

  it('stays unsellable — this PR ships a flow, not a claim', () => {
    const publicApi = capabilities().slice(capabilities().indexOf('public_api: {'));
    const block = publicApi.slice(0, publicApi.indexOf('\n  },'));
    expect(block).toMatch(/status: 'beta'/);
  });

  it('is described the same way in the release truth audit', () => {
    expect(audit()).toContain('tests/apikey-rotation.test.ts');
    expect(audit()).toMatch(/rotation/i);
  });
});
