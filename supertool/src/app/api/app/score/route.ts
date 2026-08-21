import { NextResponse } from 'next/server';
import { z } from 'zod';
import { scoreAiReadiness } from '@/lib/seo/ai-readiness';
import { scoreContent } from '@/lib/seo/content-score';
import { readability } from '@/lib/seo/text';
import { slugify } from '@/lib/utils';
import { getSession } from '@/lib/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const Body = z.object({
  title: z.string().min(1).max(300),
  keyword: z.string().min(1).max(160),
  metaDescription: z.string().max(400).optional(),
  body: z.string().min(20).max(200_000),
});

/** Score a draft on both the on-page and GEO models. */
export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });

  let input: z.infer<typeof Body>;
  try {
    input = Body.parse(await req.json());
  } catch {
    return NextResponse.json({ error: 'Provide a title, target keyword and a draft body.' }, { status: 400 });
  }

  // Pull ## / ### headings out of the markdown so both scorers see structure.
  const headings = [...input.body.matchAll(/^#{2,3}\s+(.+)$/gm)].map((m) => m[1].trim());
  const links = [...input.body.matchAll(/\[([^\]]*)\]\((https?:\/\/[^)\s]+)\)/g)]
    .map((m) => ({ text: m[1], href: m[2] }));
  const bareUrls = [...input.body.matchAll(/(?<!\()\bhttps?:\/\/[^\s)]+/g)].map((m) => ({ text: '', href: m[0] }));
  const outbound = [...links, ...bareUrls];

  const seo = scoreContent({
    body: input.body,
    title: input.title,
    metaDescription: input.metaDescription ?? '',
    h1: input.title,
    headings,
    url: `/${slugify(input.title)}`,
    keyword: input.keyword,
    internalLinks: links.filter((l) => l.href.startsWith('/')).length,
    externalLinks: outbound.length,
    images: [],
  });

  const geo = scoreAiReadiness({
    body: input.body,
    title: input.title,
    headings,
    outboundLinks: outbound,
    schemaTypes: [],
  });

  return NextResponse.json({
    seo: {
      score: seo.score,
      grade: seo.grade,
      wordCount: seo.wordCount,
      checks: seo.checks,
      keyword: seo.keyword,
    },
    geo: {
      score: geo.score,
      grade: geo.grade,
      signals: geo.signals,
      extractedAnswer: geo.extractedAnswer,
      quotablePassages: geo.quotablePassages,
      stats: geo.stats,
    },
    readability: readability(input.body),
  });
}
