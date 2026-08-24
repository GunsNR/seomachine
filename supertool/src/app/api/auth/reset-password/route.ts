import { NextResponse } from 'next/server';
import { z } from 'zod';
import { destroySession, hashPassword, revokeAllSessions } from '@/lib/auth';
import { db } from '@/lib/db';
import { passwordChangedEmail, sendEmail } from '@/lib/email';
import { checkResetToken, consumeResetToken, reasonMessage } from '@/lib/password-reset';
import { clientKey, rateLimitHeaders, sharedRateLimit } from '@/lib/rate-limit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const Body = z.object({
  token: z.string().min(20).max(200),
  password: z.string().min(10, 'Use at least 10 characters.').max(200),
});

export async function POST(req: Request) {
  const limited = await sharedRateLimit(clientKey(req, 'reset-password'), 10, 15 * 60_000);
  if (!limited.ok) {
    return NextResponse.json(
      { error: `Too many attempts. Try again in ${limited.retryAfterSeconds} seconds.` },
      { status: 429, headers: rateLimitHeaders(limited) },
    );
  }

  let input: z.infer<typeof Body>;
  try {
    input = Body.parse(await req.json());
  } catch (err) {
    const message =
      err instanceof z.ZodError ? (err.issues[0]?.message ?? 'Check the form.') : 'Check the form.';
    return NextResponse.json({ error: message }, { status: 400 });
  }

  const check = await checkResetToken(input.token);
  if (!check.valid || !check.userId) {
    return NextResponse.json({ error: reasonMessage(check.reason) }, { status: 400 });
  }

  const user = await db.user.findUnique({ where: { id: check.userId } });
  if (!user) return NextResponse.json({ error: 'Account not found.' }, { status: 404 });

  // The password write and the token consumption must both happen or neither,
  // otherwise a failure could leave a spent token with an unchanged password.
  await db.$transaction([
    db.user.update({
      where: { id: user.id },
      data: { passwordHash: await hashPassword(input.password) },
    }),
    db.passwordResetToken.updateMany({
      where: { userId: user.id, usedAt: null },
      data: { usedAt: new Date() },
    }),
  ]);

  await consumeResetToken(input.token);

  // Every session for this account predates the reset. Revoking only the
  // cookie on this device would leave whoever prompted the reset still signed
  // in elsewhere — which is the situation a password reset exists to end.
  await revokeAllSessions(user.id, 'password-reset');
  await destroySession();

  const notice = await sendEmail(passwordChangedEmail(user.email, user.name));
  if (!notice.ok) console.error('reset-password: notification failed', notice.error);

  return NextResponse.json({ ok: true });
}
