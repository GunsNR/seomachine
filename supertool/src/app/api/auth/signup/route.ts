import { NextResponse } from 'next/server';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import { createSession, hashPassword } from '@/lib/auth';
import { TRIAL_DAYS } from '@/lib/billing';
import { clientIp, clientKey } from '@/lib/client-ip';
import { db } from '@/lib/db';
import { sendEmail, welcomeEmail } from '@/lib/email';
import { isSignupAllowed, normalizeEmail, PILOT_REFUSAL_MESSAGE, pilotGate } from '@/lib/pilot';
import { rateLimitHeaders, sharedRateLimit } from '@/lib/rate-limit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const Body = z.object({
  name: z.string().min(1).max(120),
  // Trim before validating, not after. An invited person pasting their address
  // out of the invitation email brings whitespace with it, and an untrimmed
  // `.email()` rejects that as malformed — so the allowlist would never get a
  // chance to match, and the person would be told to check the form.
  email: z.string().trim().email().max(255),
  password: z.string().min(10, 'Use at least 10 characters.').max(200),
  company: z.string().max(160).optional(),
  domain: z.string().max(255).optional(),
});

/**
 * Signup limits, both database-backed so they hold across replicas.
 *
 * Lower than login's, because the shapes of the two abuses differ. Sign-in
 * attempts are ordinary — people mistype passwords all day — while a person
 * legitimately creating accounts more than a handful of times an hour does not
 * exist. Login also has an account-lockout consideration these do not: a
 * throttled signup denies nobody access to anything they already have.
 */
const SIGNUP_WINDOW_MS = 60 * 60_000;
const SIGNUP_PER_IP = 10;
const SIGNUP_PER_EMAIL = 5;

/**
 * Identical for both buckets, and deliberately vague about which one tripped.
 *
 * A message naming the per-address bucket would confirm that address is being
 * used, which is the enumeration this route otherwise closes.
 */
const THROTTLED = 'Too many signup attempts. Try again shortly.';

/** Key the per-address bucket on a digest, so the limiter table holds no email. */
function emailBucketKey(normalizedEmail: string): string {
  const digest = createHash('sha256').update(normalizedEmail).digest('hex').slice(0, 32);
  return `signup-account:${digest}`;
}

/**
 * The one refusal, used for every reason a gated signup can fail.
 *
 * Not on the allowlist, allowlist unusable, and account already exists all
 * return this. Status, body and headers are identical, so the response carries
 * no information about which case occurred.
 */
function refuse(): NextResponse {
  return NextResponse.json({ error: PILOT_REFUSAL_MESSAGE }, { status: 403 });
}

export async function POST(req: Request) {
  let input: z.infer<typeof Body>;
  try {
    input = Body.parse(await req.json());
  } catch (err) {
    const message =
      err instanceof z.ZodError
        ? (err.issues[0]?.message ?? 'Check the form and try again.')
        : 'Check the form and try again.';
    return NextResponse.json({ error: message }, { status: 400 });
  }

  const email = normalizeEmail(input.email);

  // Throttle before anything reads the database for this address. Two buckets,
  // as on login: the address bucket stops one host enumerating many emails,
  // the per-email bucket stops many hosts hammering one. Neither can be
  // reached by the other's traffic.
  const ipLimit = await sharedRateLimit(
    clientKey(req, 'signup-ip'),
    SIGNUP_PER_IP,
    SIGNUP_WINDOW_MS,
  );
  if (!ipLimit.ok) {
    return NextResponse.json(
      { error: THROTTLED },
      { status: 429, headers: rateLimitHeaders(ipLimit) },
    );
  }

  const emailLimit = await sharedRateLimit(
    emailBucketKey(email),
    SIGNUP_PER_EMAIL,
    SIGNUP_WINDOW_MS,
  );
  if (!emailLimit.ok) {
    return NextResponse.json(
      { error: THROTTLED },
      { status: 429, headers: rateLimitHeaders(emailLimit) },
    );
  }

  // The gate is read per request rather than at module load, so an operator can
  // correct a mistyped allowlist by redeploying variables without a rebuild.
  const gate = pilotGate();

  if (gate.mode === 'closed') {
    // The caller is told nothing, so the operator has to be told something —
    // this and the detailed health view are the only places the misconfiguration
    // is visible. Counts only: the addresses themselves never reach a log.
    console.error(
      `signup: PILOT_MODE is on but the allowlist is unusable (${gate.reason}, ` +
        `${gate.invalidEntries} malformed entries). Every signup is being refused.`,
    );
    return refuse();
  }

  if (!isSignupAllowed(gate, email)) return refuse();

  const existing = await db.user.findUnique({ where: { email }, select: { id: true } });
  if (existing) {
    // Under the gate this is the same response as "not invited", so the form
    // answers neither question. With the gate off there is no allowlist to
    // leak and an open signup form saying "that address is taken" is ordinary,
    // useful behaviour — so it keeps saying so.
    return gate.mode === 'open'
      ? NextResponse.json({ error: 'An account with that email already exists.' }, { status: 409 })
      : refuse();
  }

  const domain = (input.domain ?? '').trim().replace(/^https?:\/\//, '').replace(/\/.*$/, '');

  // A new account gets an organisation, a membership and a first project in
  // one transaction, so a partial signup can never leave an orphaned user.
  const user = await db.$transaction(async (tx) => {
    const org = await tx.organization.create({
      data: {
        name: input.company?.trim() || `${input.name}'s workspace`,
        // Everyone starts on Growth for the trial so the product can be
        // evaluated properly; the webhook sets the real tier on subscribe.
        plan: 'growth',
        subscriptionStatus: 'trialing',
        trialEndsAt: new Date(Date.now() + TRIAL_DAYS * 86_400_000),
      },
    });

    const created = await tx.user.create({
      data: {
        email,
        name: input.name.trim(),
        passwordHash: await hashPassword(input.password),
        role: 'owner',
        memberships: { create: { orgId: org.id, role: 'owner' } },
      },
    });

    await tx.project.create({
      data: {
        orgId: org.id,
        name: input.company?.trim() || domain || 'My first project',
        domain: domain || 'example.com',
      },
    });

    return {
      id: created.id,
      email: created.email,
      name: created.name,
      orgId: org.id,
      // The first member of a new workspace owns it.
      role: 'owner' as const,
    };
  });

  await createSession(user, {
    userAgent: req.headers.get('user-agent') ?? '',
    ip: clientIp(req),
  });

  // Fire and forget: a mail failure must never fail the signup that caused it.
  const welcome = await sendEmail(welcomeEmail(user.email, user.name));
  if (!welcome.ok) console.error('signup: welcome email failed', welcome.error);

  return NextResponse.json({ ok: true });
}
