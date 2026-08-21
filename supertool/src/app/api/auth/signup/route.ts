import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createSession, hashPassword } from '@/lib/auth';
import { TRIAL_DAYS } from '@/lib/billing';
import { db } from '@/lib/db';
import { sendEmail, welcomeEmail } from '@/lib/email';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const Body = z.object({
  name: z.string().min(1).max(120),
  email: z.string().email().max(255),
  password: z.string().min(10, 'Use at least 10 characters.').max(200),
  company: z.string().max(160).optional(),
  domain: z.string().max(255).optional(),
});

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

  const email = input.email.toLowerCase().trim();
  if (await db.user.findUnique({ where: { email } })) {
    return NextResponse.json({ error: 'An account with that email already exists.' }, { status: 409 });
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

    return { id: created.id, email: created.email, name: created.name, orgId: org.id };
  });

  await createSession(user);

  // Fire and forget: a mail failure must never fail the signup that caused it.
  const welcome = await sendEmail(welcomeEmail(user.email, user.name));
  if (!welcome.ok) console.error('signup: welcome email failed', welcome.error);

  return NextResponse.json({ ok: true });
}
