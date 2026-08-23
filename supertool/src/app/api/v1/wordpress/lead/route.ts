import { NextResponse } from 'next/server';
import { z } from 'zod';
import { corsPreflight, requireApiKey } from '@/lib/api-auth';
import { detectEngine, isKnownEngine } from '@/lib/ai/referrers';
import { db } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export function OPTIONS() {
  return corsPreflight();
}

const Body = z.object({
  email: z.string().email().max(255).optional().or(z.literal('')),
  name: z.string().max(160).optional(),
  landingUrl: z.string().max(2048).optional(),
  referrer: z.string().max(2048).optional(),
  engine: z.string().max(40).optional(),
  value: z.number().min(0).max(10_000_000).optional(),
});

/**
 * Records a visit or enquiry from the WordPress attribution snippet.
 * Engine is trusted only if it is a known id; otherwise it is derived from the
 * referrer, so a forged field cannot invent a channel.
 */
export async function POST(req: Request) {
  const { project, response } = await requireApiKey(req);
  if (!project) return response;

  let input: z.infer<typeof Body>;
  try {
    input = Body.parse(await req.json());
  } catch {
    return NextResponse.json({ error: 'Invalid lead payload.' }, { status: 400 });
  }

  const claimed = (input.engine ?? '').toLowerCase();
  const engine = isKnownEngine(claimed) ? claimed : detectEngine(input.referrer ?? '');

  const source = engine ? 'ai' : input.referrer ? 'organic' : 'direct';

  const lead = await db.lead.create({
    data: {
      projectId: project.id,
      source,
      engine,
      landingUrl: input.landingUrl ?? '',
      email: input.email ?? '',
      name: input.name ?? '',
      value: input.value ?? 0,
      status: 'new',
    },
  });

  return NextResponse.json({ ok: true, id: lead.id, source, engine });
}
