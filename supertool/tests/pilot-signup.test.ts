import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';

/**
 * The pilot gate as a caller actually meets it.
 *
 * `tests/pilot.test.ts` proves the decision table. These prove the route obeys
 * it, against real PostgreSQL and the real limiter — because the properties
 * worth having here are all properties of the whole path: that a refusal writes
 * no user, that five different refusals are the same bytes, that the invitation
 * code never reaches a response or a log line, that the per-address bucket is
 * reachable from many hosts and the per-host bucket from many addresses, and
 * that none of it touches sign-in.
 *
 * Only the cookie jar is faked. `createSession` and `destroySession` need a
 * request context Next does not provide here; everything else is the code that
 * ships, hashing included.
 */

import { createTestDatabase, type TestDatabase } from './helpers/test-database';
import {
  PILOT_ALLOWLIST_ENV,
  PILOT_INVITE_CODE_ENV,
  PILOT_MODE_ENV,
  PILOT_REFUSAL_MESSAGE,
} from '@/lib/pilot';

let database: TestDatabase;

vi.mock('@/lib/auth', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/auth')>();
  return {
    ...actual,
    createSession: vi.fn(async () => {}),
    destroySession: vi.fn(async () => {}),
  };
});

const sent: Array<{ to: string; subject: string; text: string }> = [];

vi.mock('@/lib/email', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/email')>();
  return {
    ...actual,
    sendEmail: vi.fn(async (message: { to: string; subject: string; text: string }) => {
      sent.push({ to: message.to, subject: message.subject, text: message.text });
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

/** Test fixture of the right shape. Never a real secret, and never committed as one. */
const CODE = 'Kq7w-Zx2m-Rb9t-Vn4h-Ld6y-Pj3s-Ac8e';
const CODE_DIGEST = createHash('sha256').update(CODE).digest('hex');

/** Everything written to the console during one test, joined. */
let logged: string[] = [];

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

const originalEnv = {
  mode: process.env[PILOT_MODE_ENV],
  list: process.env[PILOT_ALLOWLIST_ENV],
  code: process.env[PILOT_INVITE_CODE_ENV],
};

beforeEach(async () => {
  sent.length = 0;
  logged = [];
  for (const channel of ['error', 'warn', 'info', 'log'] as const) {
    vi.spyOn(console, channel).mockImplementation((...args: unknown[]) => {
      logged.push(args.map((a) => (typeof a === 'string' ? a : JSON.stringify(a))).join(' '));
    });
  }

  await db.rateLimitCounter.deleteMany({});
  await db.passwordResetToken.deleteMany({});
  await db.session.deleteMany({});
  await db.membership.deleteMany({});
  await db.user.deleteMany({});
  await db.project.deleteMany({});
  await db.organization.deleteMany({});
});

afterEach(() => {
  vi.restoreAllMocks();
  restore(PILOT_MODE_ENV, originalEnv.mode);
  restore(PILOT_ALLOWLIST_ENV, originalEnv.list);
  restore(PILOT_INVITE_CODE_ENV, originalEnv.code);
});

function restore(key: string, value: string | undefined) {
  if (value === undefined) delete process.env[key];
  else process.env[key] = value;
}

/** Engage the gate with a known allowlist and code. */
function gateOn(over: { mode?: string; list?: string | null; code?: string | null } = {}) {
  process.env[PILOT_MODE_ENV] = over.mode ?? 'true';

  if (over.list === null) delete process.env[PILOT_ALLOWLIST_ENV];
  else process.env[PILOT_ALLOWLIST_ENV] = over.list ?? ALLOWED;

  if (over.code === null) delete process.env[PILOT_INVITE_CODE_ENV];
  else process.env[PILOT_INVITE_CODE_ENV] = over.code ?? CODE;
}

/**
 * A signup request.
 *
 * `x-real-ip` is read ahead of any forwarded header, so it sets the rate-limit
 * bucket without depending on TRUSTED_PROXY_COUNT. `inviteCode` is omitted
 * entirely when null, which is what a caller who never loaded the form sends.
 */
function signupRequest(
  email: string,
  { ip = '203.0.113.10', code = CODE as string | null } = {},
): Request {
  return new Request('http://localhost/api/auth/signup', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-real-ip': ip },
    body: JSON.stringify({
      name: 'Test Person',
      email,
      password: PASSWORD,
      ...(code === null ? {} : { inviteCode: code }),
    }),
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

describe('PILOT_MODE is tri-state', () => {
  it('leaves signup open when unset', async () => {
    delete process.env[PILOT_MODE_ENV];
    const res = await signup.POST(signupRequest(STRANGER, { code: null }));
    expect(res.status).toBe(200);
  });

  it('leaves signup open on an explicit false, so non-pilot operation still works', async () => {
    gateOn({ mode: 'false' });
    const res = await signup.POST(signupRequest(STRANGER, { code: null }));
    expect(res.status).toBe(200);
    expect(await db.user.count()).toBe(1);
  });

  it('refuses everything on a value that is neither true nor false', async () => {
    // The whole point of the correction. `1` is what someone writes when they
    // mean "on" — treating it as "not true, therefore open" would leave a
    // public signup form on a deployment its owner believes is shut.
    for (const [i, value] of ['1', 'yes', 'on', 'enabled', 'ture'].entries()) {
      gateOn({ mode: value });
      const res = await signup.POST(
        signupRequest(ALLOWED, { ip: `203.0.113.${40 + i}`, code: CODE }),
      );
      expect(res.status, value).toBe(403);
      expect(await res.json()).toEqual({ error: PILOT_REFUSAL_MESSAGE });
    }

    expect(await db.user.count()).toBe(0);
  });

  it('reports the bad flag to the operator, since the caller learns nothing', async () => {
    gateOn({ mode: 'yes' });
    await signup.POST(signupRequest(ALLOWED));

    expect(logged.join('\n')).toMatch(/pilot configuration is unusable \(invalid-mode-flag/);
  });
});

describe('signup under the pilot gate', () => {
  it('lets an allowlisted address with the right code create a workspace', async () => {
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

  it('refuses an address that is not on the list, even with the right code', async () => {
    gateOn();

    const res = await signup.POST(signupRequest(STRANGER));
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: PILOT_REFUSAL_MESSAGE });

    expect(await db.user.count()).toBe(0);
    expect(sent).toHaveLength(0);
  });

  it('refuses an allowlisted address presenting the wrong code', async () => {
    // Knowing an invited address is not proof of invitation. This is the whole
    // reason the code exists.
    gateOn();

    const res = await signup.POST(signupRequest(ALLOWED, { code: `${CODE}x` }));
    expect(res.status).toBe(403);
    expect(await db.user.count()).toBe(0);
  });

  it('refuses an allowlisted address that sends no code field at all', async () => {
    // A caller with curl who never loaded the form. The field is optional in
    // the schema on purpose: requiring it would answer with a 400 that a
    // wrong code does not get, and that difference is itself a signal.
    gateOn();

    const res = await signup.POST(signupRequest(ALLOWED, { code: null }));
    expect(res.status).toBe(403);
    expect(await db.user.count()).toBe(0);
  });

  it('accepts a code pasted with surrounding whitespace', async () => {
    gateOn();

    const res = await signup.POST(signupRequest(ALLOWED, { code: `  ${CODE}\n` }));
    expect(res.status).toBe(200);
  });

  it('fails closed when the invitation code is not configured', async () => {
    gateOn({ code: null });

    const res = await signup.POST(signupRequest(ALLOWED));
    expect(res.status).toBe(403);
    expect(await db.user.count()).toBe(0);
    expect(logged.join('\n')).toMatch(/unusable \(missing-invite-code/);
  });

  it('fails closed when the configured code is too weak to be worth having', async () => {
    for (const [i, weak] of ['short', 'a'.repeat(64), '12341234123412341234123412341234'].entries()) {
      gateOn({ code: weak });
      const res = await signup.POST(signupRequest(ALLOWED, { ip: `203.0.113.${60 + i}`, code: weak }));
      expect(res.status, weak.slice(0, 8)).toBe(403);
    }

    expect(await db.user.count()).toBe(0);
    expect(logged.join('\n')).toMatch(/unusable \(weak-invite-code/);
  });

  it('fails closed when the allowlist is missing entirely', async () => {
    gateOn({ list: null });

    const res = await signup.POST(signupRequest(ALLOWED));
    expect(res.status).toBe(403);
    expect(await db.user.count()).toBe(0);
  });

  it('fails closed when the allowlist is present but malformed', async () => {
    // The address being asked for is on the list, and the code is right. It is
    // refused anyway, because a list we cannot fully read is one we do not trust.
    gateOn({ list: `${ALLOWED}, this-is-not-an-email` });

    const res = await signup.POST(signupRequest(ALLOWED));
    expect(res.status).toBe(403);
    expect(await db.user.count()).toBe(0);
  });

  it('matches the allowlist on the normalized address', async () => {
    gateOn({ list: '  Izzy@Example.COM  ' });

    const res = await signup.POST(signupRequest('  IZZY@example.Com  '));
    expect(res.status).toBe(200);

    // Stored in the same normalized form the allowlist matched on, so sign-in
    // and password reset find the row this created.
    expect(await db.user.findUnique({ where: { email: 'izzy@example.com' } })).not.toBeNull();
  });

  it('leaves signup open when the flag is off, even with a list and a code set', async () => {
    // A self-hosted install has nobody to invite it. Configuration alone must
    // not silently close the door — that state is warned about, not enforced.
    delete process.env[PILOT_MODE_ENV];
    process.env[PILOT_ALLOWLIST_ENV] = ALLOWED;
    process.env[PILOT_INVITE_CODE_ENV] = CODE;

    const res = await signup.POST(signupRequest(STRANGER, { code: null }));
    expect(res.status).toBe(200);
    expect(await db.user.count()).toBe(1);
  });

  it('warns the operator whose configuration is set but switched off', async () => {
    // This deployment looks protected in its environment variables and is not.
    // Nobody would otherwise find out until a stranger had an account.
    delete process.env[PILOT_MODE_ENV];
    process.env[PILOT_ALLOWLIST_ENV] = ALLOWED;
    process.env[PILOT_INVITE_CODE_ENV] = CODE;

    await signup.POST(signupRequest(STRANGER, { code: null }));

    const all = logged.join('\n');
    expect(all).toMatch(/PILOT_MODE is not "true".*Signup is OPEN/s);
    // Presence only. The warning names the variables, never their contents.
    expect(all).not.toContain(CODE);
    expect(all).not.toContain(ALLOWED);
  });
});

describe('the invitation code never escapes', () => {
  it('appears in no response body, on any path', async () => {
    gateOn();

    const bodies: string[] = [];
    const capture = async (res: Response) => {
      bodies.push(JSON.stringify(await res.json()));
    };

    await capture(await signup.POST(signupRequest(ALLOWED, { ip: '203.0.113.70' }))); // success
    await capture(await signup.POST(signupRequest(ALLOWED, { ip: '203.0.113.71' }))); // duplicate
    await capture(
      await signup.POST(signupRequest(STRANGER, { ip: '203.0.113.72', code: 'wrong' })),
    );
    gateOn({ code: null });
    await capture(await signup.POST(signupRequest(ALLOWED, { ip: '203.0.113.73' })));

    for (const body of bodies) {
      expect(body).not.toContain(CODE);
      expect(body).not.toContain(CODE_DIGEST);
      expect(body).not.toMatch(/inviteCode|invite_code/i);
    }
  });

  it('appears in no log line, not even as a digest or a length', async () => {
    gateOn({ code: null });
    await signup.POST(signupRequest(ALLOWED, { ip: '203.0.113.74' }));

    gateOn({ code: 'a'.repeat(64) });
    await signup.POST(signupRequest(ALLOWED, { ip: '203.0.113.75', code: CODE }));

    gateOn();
    await signup.POST(signupRequest(ALLOWED, { ip: '203.0.113.76', code: `${CODE}-wrong` }));

    const all = logged.join('\n');
    // Something was reported, or the operator has no way to find out.
    expect(all).toMatch(/pilot configuration is unusable/);
    // But never the secret, a digest of it, or its length.
    expect(all).not.toContain(CODE);
    expect(all).not.toContain(CODE_DIGEST);
    expect(all).not.toContain(createHash('sha256').update(CODE).digest('base64'));
    expect(all).not.toMatch(/\b(?:34|35|64)\b/);
  });

  it('is not written to the database', async () => {
    gateOn();
    await signup.POST(signupRequest(ALLOWED));

    // The limiter keys on a digest of the email, never the code; nothing else
    // in this path persists caller input beyond the account itself.
    const counters = await db.rateLimitCounter.findMany();
    for (const counter of counters) expect(counter.key).not.toContain(CODE);

    const users = await db.user.findMany();
    expect(JSON.stringify(users)).not.toContain(CODE);
    expect(sent.map((m) => m.text).join('\n')).not.toContain(CODE);
  });
});

describe('account-enumeration resistance', () => {
  it('answers every refusal reason identically', async () => {
    gateOn();

    // Case 1: allowlisted, right code, but the account already exists.
    expect((await signup.POST(signupRequest(ALLOWED))).status).toBe(200);
    await db.rateLimitCounter.deleteMany({});
    const registered = await observe(await signup.POST(signupRequest(ALLOWED, { ip: '203.0.113.11' })));

    // Case 2: never invited, right code.
    const notInvited = await observe(await signup.POST(signupRequest(STRANGER, { ip: '203.0.113.12' })));

    // Case 3: invited, wrong code.
    const wrongCode = await observe(
      await signup.POST(signupRequest(ALLOWED, { ip: '203.0.113.15', code: 'not-the-code' })),
    );

    // Case 4: the allowlist is broken.
    gateOn({ list: 'nonsense-entry' });
    const brokenList = await observe(await signup.POST(signupRequest(ALLOWED, { ip: '203.0.113.13' })));

    // Case 5: the mode flag is broken.
    gateOn({ mode: 'on' });
    const brokenFlag = await observe(await signup.POST(signupRequest(ALLOWED, { ip: '203.0.113.16' })));

    for (const other of [notInvited, wrongCode, brokenList, brokenFlag]) {
      expect(other).toEqual(registered);
    }
    expect(registered.status).toBe(403);
  });

  it('says nothing about the address or the code in the refusal body', async () => {
    gateOn();
    const res = await signup.POST(signupRequest(STRANGER, { code: 'wrong' }));
    const body = JSON.stringify(await res.json());

    expect(body).not.toContain(STRANGER);
    expect(body).not.toContain('wrong');
    // The message may offer generic advice — "sign in if you already have an
    // account" is true for every caller. What it must never do is make a
    // statement about *this* address or *this* code.
    expect(body).not.toMatch(
      /that (email|address).*(exists|taken|registered)|is not (on|invited)|allowlist|code (was|is) (wrong|incorrect|invalid)/i,
    );
  });

  it('still reports a duplicate plainly when the gate is off', async () => {
    // With no gate there is nothing to leak, and an open signup form that
    // refuses to say "that address is taken" is just a worse form.
    delete process.env[PILOT_MODE_ENV];

    expect((await signup.POST(signupRequest(STRANGER, { code: null }))).status).toBe(200);
    await db.rateLimitCounter.deleteMany({});

    const res = await signup.POST(signupRequest(STRANGER, { ip: '203.0.113.14', code: null }));
    expect(res.status).toBe(409);
  });
});

describe('signup rate limiting', () => {
  it('throttles one host working through many addresses', async () => {
    gateOn();

    const ip = '198.51.100.7';
    for (let i = 0; i < 10; i++) {
      const res = await signup.POST(signupRequest(`probe-${i}@example.com`, { ip }));
      expect(res.status, `attempt ${i}`).toBe(403);
    }

    const throttled = await signup.POST(signupRequest('probe-10@example.com', { ip }));
    expect(throttled.status).toBe(429);
    expect(throttled.headers.get('Retry-After')).toBeTruthy();

    // A different host is unaffected: the bucket is per address, not global.
    const other = await signup.POST(
      signupRequest('probe-11@example.com', { ip: '198.51.100.8' }),
    );
    expect(other.status).toBe(403);
  });

  it('throttles many hosts guessing the code for one address', async () => {
    gateOn();

    // Each attempt comes from its own host, so the per-IP bucket never fills.
    // Only the per-email bucket can stop this — and this is the shape an
    // online attack on the code actually takes.
    for (let i = 0; i < 5; i++) {
      const res = await signup.POST(
        signupRequest(ALLOWED, { ip: `198.51.100.${20 + i}`, code: `guess-${i}` }),
      );
      expect(res.status, `attempt ${i}`).toBe(403);
    }

    const throttled = await signup.POST(
      signupRequest(ALLOWED, { ip: '198.51.100.99', code: 'guess-5' }),
    );
    expect(throttled.status).toBe(429);

    // Even the right code is now throttled: the limit is on the address, and
    // it does not care whether the attempt would have succeeded.
    const withRightCode = await signup.POST(
      signupRequest(ALLOWED, { ip: '198.51.100.98', code: CODE }),
    );
    expect(withRightCode.status).toBe(429);
    expect(await db.user.count()).toBe(0);
  });

  it('buckets the address by its normalized form, so case cannot reset the count', async () => {
    gateOn();

    for (let i = 0; i < 5; i++) {
      await signup.POST(signupRequest(STRANGER, { ip: `198.51.100.${40 + i}` }));
    }

    const throttled = await signup.POST(
      signupRequest(STRANGER.toUpperCase(), { ip: '198.51.100.101' }),
    );
    expect(throttled.status).toBe(429);
  });

  it('gives the same message whichever bucket tripped', async () => {
    gateOn();

    const ip = '198.51.100.60';
    for (let i = 0; i < 10; i++) {
      await signup.POST(signupRequest(`ip-probe-${i}@example.com`, { ip }));
    }
    const byIp = await observe(await signup.POST(signupRequest('ip-probe-x@example.com', { ip })));

    await db.rateLimitCounter.deleteMany({});

    for (let i = 0; i < 5; i++) {
      await signup.POST(signupRequest(STRANGER, { ip: `198.51.100.${70 + i}` }));
    }
    const byEmail = await observe(
      await signup.POST(signupRequest(STRANGER, { ip: '198.51.100.102' })),
    );

    // Naming the per-address bucket would confirm that address is in use.
    expect(byIp).toEqual(byEmail);
  });
});

describe('the gate governs account creation only', () => {
  it('lets an existing pilot user sign in with no code, after their address leaves the list', async () => {
    gateOn();
    expect((await signup.POST(signupRequest(ALLOWED))).status).toBe(200);

    // The pilot moves on: the address is dropped and the code is rotated, as
    // the runbook tells the operator to do. The account already created must
    // keep working — the gate decides who may join, never who may return.
    gateOn({ list: 'someone-else@example.com', code: 'Zt4v-Wq8n-Hm2k-Bx6r-Ys9d-Fp3j-Lc7a' });
    await db.rateLimitCounter.deleteMany({});

    const res = await login.POST(
      jsonRequest('http://localhost/api/auth/login', { email: ALLOWED, password: PASSWORD }),
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });

  it('lets an existing user sign in while the configuration is broken', async () => {
    gateOn();
    expect((await signup.POST(signupRequest(ALLOWED))).status).toBe(200);

    gateOn({ mode: 'yes', list: 'broken', code: null });
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
    gateOn({ list: `${ALLOWED}, invited-not-yet-registered@example.com` });

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

  it('needs no invitation code, so a pilot user can still recover after rotation', async () => {
    gateOn();
    await signup.POST(signupRequest(ALLOWED));
    await db.rateLimitCounter.deleteMany({});
    sent.length = 0;

    gateOn({ list: 'someone-else@example.com', code: 'Zt4v-Wq8n-Hm2k-Bx6r-Ys9d-Fp3j-Lc7a' });

    const res = await forgot.POST(
      jsonRequest('http://localhost/api/auth/forgot-password', { email: ALLOWED }, '198.51.100.150'),
    );
    expect(res.status).toBe(200);
    expect(await db.passwordResetToken.count()).toBe(1);
    expect(sent.map((m) => m.to)).toEqual([ALLOWED]);
  });
});
