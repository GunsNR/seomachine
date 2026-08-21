import { NextResponse } from 'next/server';
import { clientKey, rateLimit, rateLimitHeaders } from '@/lib/rate-limit';
import { z } from 'zod';
import { auditPages } from '@/lib/seo/audit';
import { crawlSite, normalizeUrl } from '@/lib/seo/crawler';
import { scoreAiReadiness } from '@/lib/seo/ai-readiness';
import { checkPublicHost } from '@/lib/net-guard';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const Body = z.object({
  url: z.string().min(3).max(2048),
  maxPages: z.number().int().min(1).max(10).optional(),
});

/** Public, rate-limited technical audit used by the free tool page. */
export async function POST(req: Request) {
  // Crawling is expensive, so the free audit is capped per IP.
  const limited = rateLimit(clientKey(req, 'tools-audit'), 5, 10 * 60_000);
  if (!limited.ok) {
    return NextResponse.json(
      { error: `Too many requests. Try again in ${limited.retryAfterSeconds} seconds, or start a trial for unlimited runs.` },
      { status: 429, headers: rateLimitHeaders(limited) },
    );
  }

  let parsed: z.infer<typeof Body>;
  try {
    parsed = Body.parse(await req.json());
  } catch {
    return NextResponse.json({ error: 'Provide a valid { url } payload.' }, { status: 400 });
  }

  const target = normalizeUrl(parsed.url.trim());

  let host: URL;
  try {
    host = new URL(target);
  } catch {
    return NextResponse.json({ error: 'That does not look like a valid URL.' }, { status: 400 });
  }

  // Refuse to crawl private address space — a public endpoint must not be
  // usable as a probe against internal networks (SSRF).
  const reachable = checkPublicHost(host.hostname);
  if (!reachable.allowed) {
    return NextResponse.json({ error: 'Only public websites can be audited.' }, { status: 400 });
  }

  const pages = await crawlSite(target, {
    maxPages: parsed.maxPages ?? 5,
    concurrency: 3,
    timeoutMs: 12_000,
  });

  if (!pages.length || pages.every((p) => !p.ok)) {
    return NextResponse.json(
      { error: `Could not fetch ${host.hostname}. Check the URL is public and reachable.` },
      { status: 422 },
    );
  }

  const report = auditPages(pages);
  const home = pages.find((p) => p.ok)!;

  const aiReadiness = scoreAiReadiness({
    body: home.bodyText,
    title: home.title,
    headings: home.headings,
    outboundLinks: home.externalLinks.map((l) => ({ href: l.href, text: l.text })),
    schemaTypes: home.schemaTypes,
  });

  return NextResponse.json({
    url: target,
    scannedAt: new Date().toISOString(),
    score: report.score,
    grade: report.grade,
    pagesCrawled: report.pagesCrawled,
    pagesOk: report.pagesOk,
    totals: report.totals,
    byCategory: report.byCategory,
    aiReadiness: {
      score: aiReadiness.score,
      grade: aiReadiness.grade,
      signals: aiReadiness.signals.map((s) => ({
        label: s.label, score: s.score, detail: s.detail, fix: s.fix,
      })),
    },
    findings: report.findings.slice(0, 30),
    homepage: {
      title: home.title,
      metaDescription: home.metaDescription,
      wordCount: home.wordCount,
      h1: home.h1,
      schemaTypes: home.schemaTypes,
      responseMs: home.fetchMs,
    },
  });
}
