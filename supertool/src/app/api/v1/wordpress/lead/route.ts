import { NextResponse } from 'next/server';
import { z } from 'zod';
import { corsPreflight, requireApiKey } from '@/lib/api-auth';
import { detectEngine } from '@/lib/ai/referrers';
import { db } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export function OPTIONS(req: Request) {
  return corsPreflight(req);
}

const Body = z.object({
  email: z.string().email().max(255).optional().or(z.literal('')),
  name: z.string().max(160).optional(),
  landingUrl: z.string().max(2048).optional(),
  referrer: z.string().max(2048).optional(),
  value: z.number().min(0).max(10_000_000).optional(),
});

/**
 * Records a visit or enquiry from the WordPress attribution snippet.
 *
 * **The `engine` field is no longer accepted.** It used to be honoured whenever
 * it named one of the six known engines, which meant any holder of the key —
 * and the key sits in a WordPress settings screen on a machine we do not
 * control — could post `engine: "chatgpt"` and mint an AI-sourced lead that
 * never happened. The doc comment claimed a forged field could not invent a
 * channel; it could, for exactly the six values that mattered.
 *
 * Engine is now always *derived*, and the derivation records where its evidence
 * came from. The browser's own `Referer` header is preferred over a
 * body-supplied referrer, and only the header sets `attributionVerified`.
 * Neither is trustworthy enough to sell — `lead_attribution` remains
 * `demo_only` in the capability registry, and this change does not upgrade it.
 * It closes a forgery hole; it does not turn a claim into a measurement.
 */
export async function POST(req: Request) {
  const { project, response } = await requireApiKey(req, 'lead:write');
  if (!project) return response;

  let input: z.infer<typeof Body>;
  try {
    input = Body.parse(await req.json());
  } catch {
    return NextResponse.json({ error: 'Invalid lead payload.' }, { status: 400 });
  }

  // Prefer the header the browser sets over anything in the payload.
  const headerReferrer = req.headers.get('referer') ?? '';
  const bodyReferrer = input.referrer ?? '';

  const headerEngine = detectEngine(headerReferrer);
  const bodyEngine = headerEngine ? '' : detectEngine(bodyReferrer);

  const engine = headerEngine || bodyEngine;
  const referrerSource: 'header' | 'body' | 'none' = headerEngine
    ? 'header'
    : bodyEngine
      ? 'body'
      : headerReferrer || bodyReferrer
        ? 'body'
        : 'none';

  const source = engine ? 'ai' : headerReferrer || bodyReferrer ? 'organic' : 'direct';

  const lead = await db.lead.create({
    data: {
      projectId: project.id,
      source,
      engine,
      referrerSource,
      attributionVerified: Boolean(headerEngine),
      landingUrl: input.landingUrl ?? '',
      email: input.email ?? '',
      name: input.name ?? '',
      value: input.value ?? 0,
      status: 'new',
    },
  });

  return NextResponse.json({
    ok: true,
    id: lead.id,
    source,
    engine,
    // Returned so the caller can see we did not simply believe them.
    attributionVerified: Boolean(headerEngine),
  });
}
