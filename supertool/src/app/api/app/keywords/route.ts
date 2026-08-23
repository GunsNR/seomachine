import { NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { assertWithinLimit } from '@/lib/plan';
import { fetchKeywordMetrics } from '@/lib/seo/providers/keyword-data';
import { fail, loadProject, withSession } from '@/lib/route-helpers';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const AddBody = z.object({
  projectId: z.string().min(1).max(64),
  /** Newline- or comma-separated; one keyword per line is the common case. */
  phrases: z.string().min(1, 'Enter at least one keyword.').max(20_000),
});

export const POST = withSession(AddBody, async ({ session, body }) => {
  const project = await loadProject(session.orgId, body.projectId);
  if (!project) return fail('Project not found.', 404);

  const phrases = [
    ...new Set(
      body.phrases
        .split(/[\n,]/)
        .map((p) => p.trim().toLowerCase().replace(/\s+/g, ' '))
        .filter((p) => p.length >= 2 && p.length <= 160),
    ),
  ].slice(0, 1000);

  if (!phrases.length) return fail('No usable keywords found in that input.');

  // Skip anything already tracked so re-pasting a list is safe.
  const existing = await db.keyword.findMany({
    where: { projectId: project.id, phrase: { in: phrases } },
    select: { phrase: true },
  });
  const known = new Set(existing.map((k) => k.phrase));
  const fresh = phrases.filter((p) => !known.has(p));

  if (!fresh.length) {
    return NextResponse.json({ ok: true, added: 0, skipped: phrases.length });
  }

  await assertWithinLimit(session.orgId, 'keywords', fresh.length);

  // Measured metrics where a provider is configured; the model fills the rest.
  const metrics = await fetchKeywordMetrics(fresh);

  await db.keyword.createMany({
    data: metrics.map((m) => ({
      projectId: project.id,
      phrase: m.phrase,
      volume: m.volume,
      difficulty: m.difficulty,
      cpc: m.cpc,
      intent: m.intent,
      trend: JSON.stringify(m.trend),
      dataSource: m.source,
      volumeSource: m.sources.volume,
      difficultySource: m.sources.difficulty,
      cpcSource: m.sources.cpc,
      dataProvider: m.provider ?? '',
    })),
  });

  return NextResponse.json({
    ok: true,
    added: metrics.length,
    skipped: phrases.length - metrics.length,
    measured: metrics.filter((m) => m.source === 'measured').length,
  });
});

export const DELETE = withSession(null, async ({ session, req }) => {
  const id = new URL(req.url).searchParams.get('id');
  if (!id) return fail('Provide a keyword id.');

  const result = await db.keyword.deleteMany({
    where: { id, project: { orgId: session.orgId } },
  });
  if (result.count === 0) return fail('Keyword not found.', 404);

  return NextResponse.json({ ok: true });
});
