import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createSession, hashPassword, revokeAllSessions, verifyPassword } from '@/lib/auth';
import { clientIp } from '@/lib/client-ip';
import { db } from '@/lib/db';
import { fail, withSession } from '@/lib/route-helpers';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ProfileBody = z.object({
  name: z.string().min(1, 'Enter your name.').max(120).optional(),
  orgName: z.string().min(1, 'Enter a workspace name.').max(160).optional(),
});

export const PATCH = withSession(ProfileBody, async ({ session, body }) => {
  if (body.name) {
    await db.user.update({ where: { id: session.id }, data: { name: body.name.trim() } });
  }
  if (body.orgName) {
    await db.organization.update({ where: { id: session.orgId }, data: { name: body.orgName.trim() } });
  }

  // The session carries the display name, so reissue it after a rename.
  if (body.name) {
    await createSession({ ...session, name: body.name.trim() });
  }

  return NextResponse.json({ ok: true });
});

const PasswordBody = z.object({
  currentPassword: z.string().min(1, 'Enter your current password.').max(200),
  newPassword: z.string().min(10, 'Use at least 10 characters.').max(200),
});

export const POST = withSession(PasswordBody, async ({ session, body, req }) => {
  const user = await db.user.findUnique({ where: { id: session.id } });
  if (!user) return fail('Account not found.', 404);

  if (!(await verifyPassword(body.currentPassword, user.passwordHash))) {
    return fail('Your current password is not correct.', 403);
  }

  if (body.currentPassword === body.newPassword) {
    return fail('The new password must be different from the current one.');
  }

  await db.user.update({
    where: { id: user.id },
    data: { passwordHash: await hashPassword(body.newPassword) },
  });

  // Revoke everything, then reissue for this device only. Changing a password
  // is how someone evicts a session they no longer control, so leaving other
  // sessions alive would defeat the point.
  await revokeAllSessions(user.id, 'password-change');
  await createSession(session, {
    userAgent: req.headers.get('user-agent') ?? '',
    ip: clientIp(req),
  });

  return NextResponse.json({ ok: true });
});
