import { NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { passwordResetEmail, sendEmail } from '@/lib/email';
import { issueResetToken } from '@/lib/password-reset';
import { clientKey, rateLimit, rateLimitHeaders } from '@/lib/rate-limit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const Body = z.object({ email: z.string().email().max(255) });

export async function POST(req: Request) {
  // Reset mail is a spam and enumeration vector, so it is capped per IP.
  const limited = rateLimit(clientKey(req, 'forgot-password'), 5, 15 * 60_000);
  if (!limited.ok) {
    return NextResponse.json(
      { error: `Too many reset requests. Try again in ${limited.retryAfterSeconds} seconds.` },
      { status: 429, headers: rateLimitHeaders(limited) },
    );
  }

  let input: z.infer<typeof Body>;
  try {
    input = Body.parse(await req.json());
  } catch {
    return NextResponse.json({ error: 'Enter a valid email address.' }, { status: 400 });
  }

  const user = await db.user.findUnique({ where: { email: input.email.toLowerCase().trim() } });

  if (user) {
    const token = await issueResetToken(user.id);
    const result = await sendEmail(passwordResetEmail(user.email, user.name, token));
    if (!result.ok) console.error('forgot-password: send failed', result.error);
  }

  // Always the same response. Telling the caller whether an address is
  // registered would turn this endpoint into an account enumeration oracle.
  return NextResponse.json({
    ok: true,
    message: 'If that email has an account, a reset link is on its way.',
  });
}
