import { NextResponse } from 'next/server';
import { corsPreflight, requireApiKey } from '@/lib/api-auth';
import { engineName } from '@/lib/ai/engines';
import { db } from '@/lib/db';
import { parseJson } from '@/lib/utils';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export function OPTIONS(req: Request) {
  return corsPreflight(req);
}

/** Feeds the Elementor "Citation Feed" widget. */
export async function GET(req: Request) {
  const { project, response } = await requireApiKey(req, 'citations:read');
  if (!project) return response;

  const limit = Math.min(50, Math.max(1, Number(new URL(req.url).searchParams.get('limit') ?? 10)));

  const checks = await db.aiCheck.findMany({
    where: { prompt: { projectId: project.id }, brandCited: true },
    include: { prompt: true },
    orderBy: { runAt: 'desc' },
    take: limit,
  });

  const host = project.domain.replace(/^www\./, '');

  return NextResponse.json({
    project: { name: project.name, domain: project.domain },
    count: checks.length,
    citations: checks.map((c) => ({
      engine: c.engine,
      engineName: engineName(c.engine),
      prompt: c.prompt.text,
      cluster: c.prompt.cluster,
      sentiment: c.sentiment,
      mentionRank: c.mentionRank,
      excerpt: c.excerpt,
      // Only surface our own cited URLs to the public widget.
      citedUrl: parseJson<string[]>(c.citedUrls, []).find((u) => {
        try { return new URL(u).hostname.replace(/^www\./, '').endsWith(host); } catch { return false; }
      }) ?? '',
      runAt: c.runAt.toISOString(),
    })),
  }, {
    headers: { 'Cache-Control': 'public, max-age=300, s-maxage=300' },
  });
}
