import { NextResponse } from 'next/server';
import { z } from 'zod';
import { generatePromptSet } from '@/lib/ai/prompts';
import { classifyIntent } from '@/lib/seo/keywords';
import { db } from '@/lib/db';
import { assertWithinLimit } from '@/lib/plan';
import { fail, loadProject, withSession } from '@/lib/route-helpers';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const CLUSTERS = ['discovery', 'comparison', 'alternatives', 'pricing', 'how-to', 'brand', 'general'] as const;

const AddBody = z.object({
  projectId: z.string().min(1).max(64),
  /** Free-text prompts, one per line. */
  prompts: z.string().max(20_000).optional(),
  /** When set, generate a funnel-balanced set instead of taking free text. */
  generate: z
    .object({
      category: z.string().min(2).max(160),
      topics: z.array(z.string().min(2).max(160)).max(10).optional(),
      limit: z.number().int().min(1).max(200).optional(),
    })
    .optional(),
  cluster: z.enum(CLUSTERS).optional(),
});

export const POST = withSession(AddBody, async ({ session, body }) => {
  const project = await loadProject(session.orgId, body.projectId);
  if (!project) return fail('Project not found.', 404);

  const competitors = await db.competitor.findMany({ where: { projectId: project.id } });

  let candidates: Array<{ text: string; cluster: string; intent: string }> = [];

  if (body.generate) {
    candidates = generatePromptSet({
      brand: project.name,
      category: body.generate.category,
      topics: body.generate.topics ?? [],
      competitors: competitors.map((c) => c.label || c.domain),
      limit: body.generate.limit ?? 40,
    });
  } else if (body.prompts) {
    candidates = body.prompts
      .split('\n')
      .map((t) => t.trim().replace(/\s+/g, ' '))
      .filter((t) => t.length >= 5 && t.length <= 400)
      .map((text) => ({
        text,
        cluster: body.cluster ?? 'general',
        intent: classifyIntent(text),
      }));
  } else {
    return fail('Provide prompts, or generation options.');
  }

  if (!candidates.length) return fail('No usable prompts found in that input.');

  const existing = await db.aiPrompt.findMany({
    where: { projectId: project.id },
    select: { text: true },
  });
  const known = new Set(existing.map((p) => p.text.toLowerCase()));

  const seen = new Set<string>();
  const fresh = candidates.filter((c) => {
    const key = c.text.toLowerCase();
    if (known.has(key) || seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  if (!fresh.length) {
    return NextResponse.json({ ok: true, added: 0, skipped: candidates.length });
  }

  await assertWithinLimit(session.orgId, 'prompts', fresh.length);

  await db.aiPrompt.createMany({
    data: fresh.map((p) => ({
      projectId: project.id,
      text: p.text,
      cluster: p.cluster,
      intent: p.intent,
    })),
  });

  return NextResponse.json({ ok: true, added: fresh.length, skipped: candidates.length - fresh.length });
});

export const DELETE = withSession(null, async ({ session, req }) => {
  const id = new URL(req.url).searchParams.get('id');
  if (!id) return fail('Provide a prompt id.');

  const result = await db.aiPrompt.deleteMany({
    where: { id, project: { orgId: session.orgId } },
  });
  if (result.count === 0) return fail('Prompt not found.', 404);

  return NextResponse.json({ ok: true });
});
