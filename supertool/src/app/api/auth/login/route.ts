import { NextResponse } from 'next/server';
import { z } from 'zod';
import { authenticate, createSession } from '@/lib/auth';
import { clientIp, clientKey } from '@/lib/client-ip';
import { rateLimitHeaders, sharedRateLimit } from '@/lib/rate-limit';
import { createHash } from 'node:crypto';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const Body = z.object({ email: z.string().email(), password: z.string().min(1).max(200) });

export async function POST(req: Request) {
  let input: z.infer<typeof Body>;
  try {
    input = Body.parse(await req.json());
  } catch {
    return NextResponse.json({ error: 'Enter a valid email and password.' }, { status: 400 });
  }

  // Two buckets, because they stop different attacks. The per-address bucket
  // stops one host trying many accounts; the per-account bucket stops many
  // hosts trying one account, which the address bucket cannot see. The account
  // bucket keys on a hash so the limiter table never holds an email address.
  const ipLimit = await sharedRateLimit(clientKey(req, 'login-ip'), 20, 15 * 60_000);
  if (!ipLimit.ok) {
    return NextResponse.json(
      { error: 'Too many sign-in attempts. Try again shortly.' },
      { status: 429, headers: rateLimitHeaders(ipLimit) },
    );
  }

  const accountKey = createHash('sha256')
    .update(input.email.toLowerCase().trim())
    .digest('hex')
    .slice(0, 32);
  const accountLimit = await sharedRateLimit(`login-account:${accountKey}`, 10, 15 * 60_000);
  if (!accountLimit.ok) {
    // Same message as the address limit: telling a caller that *this account*
    // is being throttled confirms the account exists.
    return NextResponse.json(
      { error: 'Too many sign-in attempts. Try again shortly.' },
      { status: 429, headers: rateLimitHeaders(accountLimit) },
    );
  }

  const user = await authenticate(input.email, input.password);
  // Deliberately identical message for unknown email and wrong password.
  if (!user) return NextResponse.json({ error: 'Email or password is incorrect.' }, { status: 401 });

  await createSession(user, {
    userAgent: req.headers.get('user-agent') ?? '',
    ip: clientIp(req),
  });
  return NextResponse.json({ ok: true });
}
