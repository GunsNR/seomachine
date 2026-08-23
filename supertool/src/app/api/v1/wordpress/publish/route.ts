import { NextResponse } from 'next/server';
import { z } from 'zod';
import { corsPreflight, requireApiKey } from '@/lib/api-auth';
import { db } from '@/lib/db';
import { scoreAiReadiness } from '@/lib/seo/ai-readiness';
import { scoreContent } from '@/lib/seo/content-score';
import { readability, words } from '@/lib/seo/text';
import { slugify } from '@/lib/utils';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export function OPTIONS() {
  return corsPreflight();
}

const Body = z.object({
  title: z.string().min(1).max(300),
  slug: z.string().max(200).optional(),
  body: z.string().min(1).max(400_000),
  metaTitle: z.string().max(300).optional(),
  metaDescription: z.string().max(400).optional(),
  keyword: z.string().max(160).optional(),
  status: z.enum(['draft', 'review', 'scheduled', 'published']).optional(),
  wpPostId: z.number().int().positive().optional(),
  publishedUrl: z.string().max(2048).optional(),
});

/**
 * Called by the WordPress plugin after it publishes a post, so SuperTool
 * records the article, scores it and can track it from then on. Idempotent on
 * (project, slug): re-publishing the same slug updates rather than duplicates.
 */
export async function POST(req: Request) {
  const { project, response } = await requireApiKey(req);
  if (!project) return response;

  let input: z.infer<typeof Body>;
  try {
    input = Body.parse(await req.json());
  } catch {
    return NextResponse.json({ error: 'Provide at least a title and body.' }, { status: 400 });
  }

  const slug = slugify(input.slug || input.title);
  const keyword = input.keyword?.trim() || input.title;
  const headings = [...input.body.matchAll(/<h[23][^>]*>(.*?)<\/h[23]>|^#{2,3}\s+(.+)$/gim)]
    .map((m) => (m[1] ?? m[2] ?? '').replace(/<[^>]+>/g, '').trim())
    .filter(Boolean);

  const seo = scoreContent({
    body: input.body,
    title: input.title,
    metaDescription: input.metaDescription ?? '',
    h1: input.title,
    headings,
    url: `/${slug}`,
    keyword,
    images: [],
  });

  const geo = scoreAiReadiness({
    body: input.body,
    title: input.title,
    headings,
    brand: project.name,
  });

  const read = readability(input.body);

  const data = {
    title: input.title,
    body: input.body,
    metaTitle: input.metaTitle ?? input.title,
    metaDescription: input.metaDescription ?? '',
    status: input.status ?? 'published',
    seoScore: seo.score,
    aiReadyScore: geo.score,
    readability: read.fleschReadingEase,
    wordCount: words(input.body).length,
    wpPostId: input.wpPostId ?? null,
    publishedUrl: input.publishedUrl ?? '',
    publishedAt: (input.status ?? 'published') === 'published' ? new Date() : null,
  };

  const article = await db.article.upsert({
    where: { projectId_slug: { projectId: project.id, slug } },
    create: { projectId: project.id, slug, ...data },
    update: data,
  });

  return NextResponse.json({
    ok: true,
    id: article.id,
    slug,
    scores: {
      seo: seo.score,
      seoGrade: seo.grade,
      geo: geo.score,
      geoGrade: geo.grade,
      readability: read.fleschReadingEase,
      wordCount: data.wordCount,
    },
    // Surfaced in the WordPress editor so the writer sees what to fix.
    recommendations: [
      ...geo.signals.filter((s) => s.score < 0.6).map((s) => `${s.label}: ${s.fix}`),
      ...seo.checks.filter((c) => c.status === 'fail').map((c) => `${c.label}: ${c.message}`),
    ].slice(0, 8),
  });
}
