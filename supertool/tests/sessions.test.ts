import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Session revocation.
 *
 * Before Phase 2 the session cookie was a self-contained JWT and nothing else.
 * `destroySession` deleted the cookie from *that browser*; the token itself
 * stayed valid for the remainder of its fourteen days. A copy captured before
 * logout — from a shared machine, a proxy log, a backup — kept working, and
 * there was no mechanism to stop it. Changing your password did not stop it
 * either.
 *
 * The fix is a server-side row consulted on every request. These tests exercise
 * it against real PostgreSQL, because "the row is checked" is only true if the
 * lookup actually happens.
 */

import { createTestDatabase, type TestDatabase } from './helpers/test-database';

let database: TestDatabase;
process.env.AUTH_SECRET = 'test-only-secret-value-at-least-32-characters';

/** A cookie jar Next's `cookies()` would otherwise provide. */
const jar = new Map<string, string>();
vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (name: string) => (jar.has(name) ? { value: jar.get(name) } : undefined),
    set: (name: string, value: string) => void jar.set(name, value),
    delete: (name: string) => void jar.delete(name),
  }),
}));

type AuthMod = typeof import('@/lib/auth');
type DbMod = typeof import('@/lib/db');

let auth: AuthMod;
let db: DbMod['db'];
let userId = '';
let orgId = '';

beforeAll(async () => {
  database = await createTestDatabase('sessions');

  auth = await import('@/lib/auth');
  db = (await import('@/lib/db')).db;
});

afterAll(async () => {
  await db?.$disconnect();
  await database?.drop();
});

beforeEach(async () => {
  jar.clear();
  await db.session.deleteMany({});
  await db.membership.deleteMany({});
  await db.user.deleteMany({});
  await db.organization.deleteMany({});

  const org = await db.organization.create({ data: { name: 'Org' } });
  const user = await db.user.create({
    data: { email: 'a@example.com', name: 'A', passwordHash: 'x', role: 'owner' },
  });
  await db.membership.create({ data: { userId: user.id, orgId: org.id, role: 'admin' } });

  userId = user.id;
  orgId = org.id;
});

const principal = () => ({
  id: userId,
  email: 'a@example.com',
  name: 'A',
  orgId,
  role: 'admin' as const,
});

describe('a live session', () => {
  it('resolves after being created', async () => {
    await auth.createSession(principal());
    const session = await auth.getSession();
    expect(session?.id).toBe(userId);
  });

  it('writes a durable row rather than only a cookie', async () => {
    await auth.createSession(principal());
    expect(await db.session.count()).toBe(1);
  });
});

describe('revocation actually ends a session', () => {
  it('stops resolving after logout, even though the token is still well-formed', async () => {
    await auth.createSession(principal());
    const stolenToken = jar.get('supertool_session');

    await auth.destroySession();

    // Replay the token a thief captured before logout.
    jar.set('supertool_session', stolenToken!);
    expect(await auth.getSession()).toBeNull();
  });

  it('records why the session ended, and keeps the row', async () => {
    await auth.createSession(principal());
    await auth.destroySession();

    const row = await db.session.findFirst();
    expect(row?.revokedAt).not.toBeNull();
    expect(row?.revokedReason).toBe('logout');
  });

  it('revokes every session on a password change, not just this device', async () => {
    // Changing a password is how someone evicts a session they no longer
    // control. Leaving other sessions alive defeats the point.
    await auth.createSession(principal());
    const deviceOne = jar.get('supertool_session');
    jar.clear();
    await auth.createSession(principal());

    expect(await auth.revokeAllSessions(userId, 'password-change')).toBe(2);

    jar.set('supertool_session', deviceOne!);
    expect(await auth.getSession()).toBeNull();
  });

  it('is idempotent and preserves the first reason', async () => {
    await auth.createSession(principal());
    const id = (await db.session.findFirst())!.id;

    await auth.revokeSession(id, 'logout');
    await auth.revokeSession(id, 'admin');

    expect((await db.session.findUnique({ where: { id } }))?.revokedReason).toBe('logout');
  });
});

describe('expiry and integrity', () => {
  it('refuses an expired session even with a valid token', async () => {
    await auth.createSession(principal());
    await db.session.updateMany({ data: { expiresAt: new Date(Date.now() - 1000) } });
    expect(await auth.getSession()).toBeNull();
  });

  it('refuses a token whose session row was deleted outright', async () => {
    await auth.createSession(principal());
    await db.session.deleteMany({});
    expect(await auth.getSession()).toBeNull();
  });

  it('refuses a legacy token that carries no session id', async () => {
    // Pre-Phase-2 sessions are unrevocable, which is exactly what this change
    // removes. Everyone signs in once more; that is the whole cost.
    const { SignJWT } = await import('jose');
    const legacy = await new SignJWT({ id: userId, email: 'a@example.com', name: 'A', orgId })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .setExpirationTime('14d')
      .setSubject(userId)
      .sign(new TextEncoder().encode(process.env.AUTH_SECRET!));

    jar.set('supertool_session', legacy);
    expect(await auth.getSession()).toBeNull();
  });

  it('refuses a tampered token', async () => {
    await auth.createSession(principal());
    jar.set('supertool_session', jar.get('supertool_session')!.slice(0, -3) + 'aaa');
    expect(await auth.getSession()).toBeNull();
  });
});

describe('role comes from the membership, never from the token', () => {
  it('reflects a demotion that happened after the token was minted', async () => {
    await auth.createSession(principal()); // minted as admin
    await db.membership.updateMany({ where: { userId, orgId }, data: { role: 'viewer' } });

    const session = await auth.getSession();
    expect(session?.role).toBe('viewer');
  });

  it('ends access when the membership is removed', async () => {
    await auth.createSession(principal());
    await db.membership.deleteMany({ where: { userId, orgId } });
    expect(await auth.getSession()).toBeNull();
  });

  it('treats an unrecognised stored role as viewer', async () => {
    await auth.createSession(principal());
    await db.membership.updateMany({ where: { userId, orgId }, data: { role: 'superuser' } });
    expect((await auth.getSession())?.role).toBe('viewer');
  });
});

describe('the session list', () => {
  it('shows live sessions and hides revoked ones', async () => {
    await auth.createSession(principal());
    jar.clear();
    await auth.createSession(principal());

    expect((await auth.listSessions(userId)).length).toBe(2);

    const first = (await db.session.findFirst())!;
    await auth.revokeSession(first.id, 'admin');
    expect((await auth.listSessions(userId)).length).toBe(1);
  });

  it('stores a hashed address rather than a plaintext one', async () => {
    await auth.createSession(principal(), { ip: '203.0.113.9', userAgent: 'Test/1.0' });
    const row = await db.session.findFirst();
    expect(row?.ipHash).not.toContain('203.0.113.9');
    expect(row?.ipHash).toMatch(/^[0-9a-f]{16}$/);
  });
});
