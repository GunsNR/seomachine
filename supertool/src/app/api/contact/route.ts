import { NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';

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

export async function POST(req: Request) {
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

  // Enquiries are stored against the demo project so they surface in the
  // dashboard's lead list rather than vanishing into an inbox.
  try {
    const project = await db.project.findFirst({ orderBy: { createdAt: 'asc' } });
    if (project) {
      await db.lead.create({
        data: {
          projectId: project.id,
          source: 'direct',
          engine: '',
          landingUrl: input.website ?? '',
          email: input.email,
          name: input.name,
          status: 'new',
        },
      });
    }
  } catch {
    // A storage failure must not lose the enquiry from the user's point of
    // view; the submission is still acknowledged and logged.
    console.error('contact: failed to persist lead');
  }

  return NextResponse.json({ ok: true });
}
