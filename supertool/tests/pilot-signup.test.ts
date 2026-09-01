import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The pilot gate as a caller actually meets it.
 *
 * `tests/pilot.test.ts` proves the decision table. These prove the route obeys
 * it, against real PostgreSQL and the real limiter — because the properties
 * worth having here are all properties of the whole path: that a refusal
 * writes no user, that two different refusals are the same bytes, that the
 * per-address bucket is reachable from many hosts and the per-host bucket from
 * many addresses, and that none of it touches sign-in.
 *
 * Only the cookie jar is faked. `createSession` and `destroySession` need a
 * request context Next does not provide here; everything else is the code that
 * ships, hashing included.
 */

import { createTestDatabase, type TestDatabase } from './helpers/test-database';
import { PILOT_ALLOWLIST_ENV, PILOT_MODE_ENV, PILOT_REFUSAL_MESSAGE } from '@/lib/pilot';

let database: TestDatabase;

vi.mock('@/lib/auth', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/auth')>();
  return {
    ...actual,
    createSession: vi.fn(async () => {}),
    destroySession: vi.fn(async () => {}),
  };
});

const sent: Array<{ to: string; subject: string }> = [];

vi.mock('@/lib/email', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/email')>();
  return {
    ...actual,
    sendEmail: vi.fn(async (message: { to: string; subject: string }) => {
      sent.push({ to: message.to, subject: message.subject });
      return { ok: true, provider: 'console' as const };
    }),
  };
});

type SignupRoute = typeof import('@/app/api/auth/signup/route');
type LoginRoute = typeof import('@/app/api/auth/login/route');
type ForgotRoute = typeof import('@/app/api/auth/forgot-password/route');
type DbMod = typeof import('@/lib/db');

let signup: SignupRoute;
let login: LoginRoute;
let forgot: ForgotRoute;
let db: DbMod['db'];

const ALLOWED = 'izzy@example.com';
const STRANGER = 'stranger@example.com';
const PASSWORD = 'a-long-enough-password';

beforeAll(async () => {
  database = await createTestDatabase('pilot_signup');
  process.env.AUTH_SECRET ||= 'test-only-secret-value-at-least-32-characters';

  signup = await import('@/app/api/auth/signup/route');
  login = await import('@/app/api/auth/login/route');
  forgot = await import('@/app/api/auth/forgot-password/route');
  db = (await import('@/lib/db')).db;
});

afterAll(async () => {
  await db?.$disconnect();
  await database?.drop();
});

const originalEnv = { mode: process.env[PILOT_MODE_ENV], list: process.env[PILOT_ALLOWLIST_ENV] };

beforeEach(async () => {
  sent.length = 0;
  await db.rateLimitCounter.deleteMany({});
  await db.passwordResetToken.deleteMany({});
  await db.session.deleteMany({});
  await db.membership.deleteMany({});
  await db.user.deleteMany({});
  await db.project.deleteMany({});
  await db.organization.deleteMany({});
});

afterEach(() => {
  restore(PILOT_MODE_ENV, originalEnv.mode);
  restore(PILOT_ALLOWLIST_ENV, originalEnv.list);
});

function restore(key: string, value: string | undefined) {
  if (value === undefined) delete process.env[key];
  else process.env[key] = value;
}

/** Turn the gate on with a known allowlist. */
function gateOn(list = ALLOWED) {
  process.env[PILOT_MODE_ENV] = 'true';
  process.env[PILOT_ALLOWLIST_ENV] = list;
}

/**
 * A signup request from a named address.
 *
 * `x-real-ip` is read ahead of any forwarded header, so it sets the rate-limit
 * bucket without depending on TRUSTED_PROXY_COUNT.
 */
function signupRequest(email: string, ip = '203.0.113.10'): Request {
  return new Request('http://localhost/api/auth/signup', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-real-ip': ip },
    body: JSON.stringify({ name: 'Test Person', email, password: PASSWORD }),
  });
}

function jsonRequest(url: string, body: unknown, ip = '203.0.113.20'): Request {
  return new Request(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-real-ip': ip },
    body: JSON.stringify(body),
  });
}

/** Status plus parsed body — the whole of what a caller can observe. */
async function observe(res: Response) {
  return { status: res.status, body: await res.json() };
}

describe('signup under the pilot gate', () => {
  it('lets an allowlisted address create a workspace', async () => {
    gateOn();

    const res = await signup.POST(signupRequest(ALLOWED));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });

    const user = await db.user.findUnique({
      where: { email: ALLOWED },
      include: { memberships: true },
    });
    expect(user).not.toBeNull();
    expect(user!.memberships).toHaveLength(1);
    expect(await db.project.count()).toBe(1);
  });

  it('refuses an address that is not on the list, and writes nothing', async () => {
    gateOn();

    const res = await signup.POST(signupRequest(STRANGER));
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: PILOT_REFUSAL_MESSAGE });

    expect(await db.user.count()).toBe(0);
    expect(await db.organization.count()).toBe(0);
    expect(sent).toHaveLength(0);
  });

  it('fails closed when the allowlist is missing entirely', async () => {
    process.env[PILOT_MODE_ENV] = 'true';
    delete process.env[PILOT_ALLOWLIST_ENV];

    const res = await signup.POST(signupRequest(ALLOWED));
    expect(res.status).toBe(403);
    expect(await db.user.count()).toBe(0);
  });

  it('fails closed when the allowlist is present but malformed', async () => {
    // The address being asked for is on the list. It is refused anyway,
    // because a list we cannot fully read is a list we do not trust.
    gateOn(`${ALLOWED}, this-is-not-an-email`);

    const res = await signup.POST(signupRequest(ALLOWED));
    expect(res.status).toBe(403);
    expect(await db.user.count()).toBe(0);
  });

  it('matches the allowlist on the normalized address', async () => {
    gateOn('  Izzy@Example.COM  ');

    const res = await signup.POST(signupRequest('  IZZY@example.Com  '));
    expect(res.status).toBe(200);

    // Stored in the same normalized form the allowlist matched on, so sign-in
    // and password reset find the row this created.
    const user = await db.user.findUnique({ where: { email: 'izzy@example.com' } });
    expect(user).not.toBeNull();
  });

  it('leaves signup open when the flag is off, even with an allowlist set', async () => {
    // A self-hosted install has nobody to invite it. The list alone must not
    // silently close the door — that state is warned about, not enforced.
    delete process.env[PILOT_MODE_ENV];
    process.env[PILOT_ALLOWLIST_ENV] = ALLOWED;

    const res = await signup.POST(signupRequest(STRANGER));
    expect(res.status).toBe(200);
    expect(await db.user.count()).toBe(1);
  });
});

describe('account-enumeration resistance', () => {
  it('answers "not invited", "already registered" and "broken allowlist" identically', async () => {
    gateOn();

    // Case 1: allowlisted and registered. Take the address out of contention by
    // creating it first, then ask again.
    expect((await signup.POST(signupRequest(ALLOWED))).status).toBe(200);
    await db.rateLimitCounter.deleteMany({});
    const registered = await observe(await signup.POST(signupRequest(ALLOWED, '203.0.113.11')));

    // Case 2: never invited.
    const notInvited = await observe(await signup.POST(signupRequest(STRANGER, '203.0.113.12')));

    // Case 3: the gate itself is broken.
    gateOn('nonsense-entry');
    const brokenList = await observe(await signup.POST(signupRequest(ALLOWED, '203.0.113.13')));

    expect(registered).toEqual(notInvited);
    expect(registered).toEqual(brokenList);
    expect(registered.status).toBe(403);
  });

  it('says nothing about the address in the refusal body', async () => {
    gateOn();
    const res = await signup.POST(signupRequest(STRANGER));
    const body = JSON.stringify(await res.json());

    expect(body).not.toContain(STRANGER);
    // The message may offer generic advice — "sign in if you already have an
    // account" is true for every caller. What it must never do is make a
    // statement about *this* address.
    expect(body).not.toMatch(
      /that (email|address).*(exists|taken|registered)|is not (on|invited)|allowlist|not permitted/i,
    );
  });

  it('still reports a duplicate plainly when the gate is off', async () => {
    // With no allowlist there is nothing to leak, and an open signup form that
    // refuses to say "that address is taken" is just a worse form.
    delete process.env[PILOT_MODE_ENV];

    expect((await signup.POST(signupRequest(STRANGER))).status).toBe(200);
    await db.rateLimitCounter.deleteMany({});

    const res = await signup.POST(signupRequest(STRANGER, '203.0.113.14'));
    expect(res.status).toBe(409);
  });
});

describe('signup rate limiting', () => {
  it('throttles one host working through many addresses', async () => {
    gateOn();

    const ip = '198.51.100.7';
    for (let i = 0; i < 10; i++) {
      const res = await signup.POST(signupRequest(`probe-${i}@example.com`, ip));
      expect(res.status, `attempt ${i}`).toBe(403);
    }

    const throttled = await signup.POST(signupRequest('probe-10@example.com', ip));
    expect(throttled.status).toBe(429);
    expect(throttled.headers.get('Retry-After')).toBeTruthy();

    // A different host is unaffected: the bucket is per address, not global.
    const other = await signup.POST(signupRequest('probe-11@example.com', '198.51.100.8'));
    expect(other.status).toBe(403);
  });

  it('throttles many hosts working on one address', async () => {
    gateOn();

    // Each request comes from its own host, so the per-IP bucket never fills.
    // Only the per-email bucket can stop this.
    for (let i = 0; i < 5; i++) {
      const res = await signup.POST(signupRequest(STRANGER, `198.51.100.${20 + i}`));
      expect(res.status, `attempt ${i}`).toBe(403);
    }

    const throttled = await signup.POST(signupRequest(STRANGER, '198.51.100.99'));
    expect(throttled.status).toBe(429);

    // A different address from a fresh host still gets through to the gate.
    const other = await signup.POST(signupRequest('someone-else@example.com', '198.51.100.100'));
    expect(other.status).toBe(403);
  });

  it('buckets the address by its normalized form, so case cannot reset the count', async () => {
    gateOn();

    for (let i = 0; i < 5; i++) {
      await signup.POST(signupRequest(STRANGER, `198.51.100.${40 + i}`));
    }

    const throttled = await signup.POST(
      signupRequest(STRANGER.toUpperCase(), '198.51.100.101'),
    );
    expect(throttled.status).toBe(429);
  });

  it('gives the same message whichever bucket tripped', async () => {
    gateOn();

    const ip = '198.51.100.60';
    for (let i = 0; i < 10; i++) await signup.POST(signupRequest(`ip-probe-${i}@example.com`, ip));
    const byIp = await observe(await signup.POST(signupRequest('ip-probe-x@example.com', ip)));

    await db.rateLimitCounter.deleteMany({});

    for (let i = 0; i < 5; i++) {
      await signup.POST(signupRequest(STRANGER, `198.51.100.${70 + i}`));
    }
    const byEmail = await observe(await signup.POST(signupRequest(STRANGER, '198.51.100.102')));

    // Naming the per-address bucket would confirm that address is in use.
    expect(byIp).toEqual(byEmail);
  });
});

describe('the gate governs account creation only', () => {
  it('lets an existing pilot user sign in after their address leaves the allowlist', async () => {
    gateOn();
    expect((await signup.POST(signupRequest(ALLOWED))).status).toBe(200);

    // The pilot moves on and the address is dropped from the list. The account
    // it already created must keep working — an allowlist decides who may join,
    // never who may return.
    gateOn('someone-else@example.com');
    await db.rateLimitCounter.deleteMany({});

    const res = await login.POST(
      jsonRequest('http://localhost/api/auth/login', { email: ALLOWED, password: PASSWORD }),
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });

  it('lets an existing user sign in while the allowlist is malformed', async () => {
    gateOn();
    expect((await signup.POST(signupRequest(ALLOWED))).status).toBe(200);

    gateOn('broken');
    await db.rateLimitCounter.deleteMany({});

    const res = await login.POST(
      jsonRequest('http://localhost/api/auth/login', { email: ALLOWED, password: PASSWORD }),
    );
    expect(res.status).toBe(200);
  });

  it('still refuses a wrong password with the same message as an unknown account', async () => {
    gateOn();
    await signup.POST(signupRequest(ALLOWED));
    await db.rateLimitCounter.deleteMany({});

    const wrongPassword = await observe(
      await login.POST(
        jsonRequest(
          'http://localhost/api/auth/login',
          { email: ALLOWED, password: 'not-the-password' },
          '198.51.100.120',
        ),
      ),
    );
    const unknownAccount = await observe(
      await login.POST(
        jsonRequest(
          'http://localhost/api/auth/login',
          { email: 'nobody@example.com', password: PASSWORD },
          '198.51.100.121',
        ),
      ),
    );

    expect(wrongPassword).toEqual(unknownAccount);
    expect(wrongPassword.status).toBe(401);
  });
});

describe('password reset privacy', () => {
  it('answers identically for a registered and an unregistered address', async () => {
    gateOn();
    await signup.POST(signupRequest(ALLOWED));
    await db.rateLimitCounter.deleteMany({});
    sent.length = 0;

    const known = await observe(
      await forgot.POST(
        jsonRequest('http://localhost/api/auth/forgot-password', { email: ALLOWED }, '198.51.100.130'),
      ),
    );
    const unknown = await observe(
      await forgot.POST(
        jsonRequest(
          'http://localhost/api/auth/forgot-password',
          { email: 'nobody@example.com' },
          '198.51.100.131',
        ),
      ),
    );

    expect(known).toEqual(unknown);
    expect(known.status).toBe(200);

    // The difference is entirely server-side: one address gets a token and an
    // email, the other gets neither, and the caller cannot tell which.
    expect(await db.passwordResetToken.count()).toBe(1);
    expect(sent.map((m) => m.to)).toEqual([ALLOWED]);
  });

  it('answers the same way for an address that is allowlisted but has no account', async () => {
    // Reset must not become the oracle signup stopped being.
    gateOn(`${ALLOWED}, invited-not-yet-registered@example.com`);

    const noAccount = await observe(
      await forgot.POST(
        jsonRequest(
          'http://localhost/api/auth/forgot-password',
          { email: 'invited-not-yet-registered@example.com' },
          '198.51.100.140',
        ),
      ),
    );
    const notInvited = await observe(
      await forgot.POST(
        jsonRequest(
          'http://localhost/api/auth/forgot-password',
          { email: 'never-invited@example.com' },
          '198.51.100.141',
        ),
      ),
    );

    expect(noAccount).toEqual(notInvited);
    expect(await db.passwordResetToken.count()).toBe(0);
  });

  it('does not consult the allowlist at all, so a pilot user can still recover', async () => {
    gateOn();
    await signup.POST(signupRequest(ALLOWED));
    await db.rateLimitCounter.deleteMany({});
    sent.length = 0;

    gateOn('someone-else@example.com');

    const res = await forgot.POST(
      jsonRequest('http://localhost/api/auth/forgot-password', { email: ALLOWED }, '198.51.100.150'),
    );
    expect(res.status).toBe(200);
    expect(await db.passwordResetToken.count()).toBe(1);
    expect(sent.map((m) => m.to)).toEqual([ALLOWED]);
  });
});
