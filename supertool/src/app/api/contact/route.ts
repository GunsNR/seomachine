import { NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { clientKey, rateLimitHeaders, sharedRateLimit } from '@/lib/rate-limit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const Body = z.object({
  name: z.string().min(1).max(120),
  email: z.string().email().max(255),
  company: z.string().max(160).optional(),
  website: z.string().max(255).optional(),
  message: z.string().min(10).max(4000),
  /** Honeypot — real users never fill this. */
  fax: z.string().max(0).optional(),
});

/**
 * Marketing-site enquiries.
 *
 * These are written to `ContactInquiry`, which has no relation to any
 * Organization, Project or Lead. The previous implementation attached every
 * enquiry to `project.findFirst()` — the oldest project in the database — so a
 * stranger filling in the public contact form wrote a row into whichever real
 * customer happened to have signed up first, and it appeared in their lead
 * list as though they had earned it. That is a tenant-isolation breach and a
 * data-integrity one at the same time, and there is no version of it that is
 * safe to keep.
 */
export async function POST(req: Request) {
  // Unauthenticated write endpoint: cap it per client before doing any work.
  const limited = await sharedRateLimit(clientKey(req, 'contact'), 5, 10 * 60_000);
  if (!limited.ok) {
    return NextResponse.json(
      { error: `Too many submissions. Try again in ${limited.retryAfterSeconds} seconds.` },
      { status: 429, headers: rateLimitHeaders(limited) },
    );
  }

  let input: z.infer<typeof Body>;
  try {
    input = Body.parse(await req.json());
  } catch {
    return NextResponse.json({ error: 'Please complete every required field.' }, { status: 400 });
  }

  if (input.fax) {
    // Silently accept and discard bot submissions.
    return NextResponse.json({ ok: true });
  }

  try {
    await db.contactInquiry.create({
      data: {
        name: input.name,
        email: input.email,
        company: input.company ?? '',
        website: input.website ?? '',
        message: input.message,
        channel: 'contact-form',
      },
    });
  } catch {
    // A storage failure must not lose the enquiry from the sender's point of
    // view; the submission is still acknowledged and the failure is logged.
    console.error('contact: failed to persist inquiry');
  }

  return NextResponse.json({ ok: true });
}
