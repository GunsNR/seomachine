import { z } from 'zod';
import { engineName } from '@/lib/ai/engines';
import { getSession, resolveProject } from '@/lib/auth';
import { exportFilename, toCsv } from '@/lib/csv';
import { db } from '@/lib/db';
import { getKeywords } from '@/lib/dashboard';
import { fail } from '@/lib/route-helpers';
import { parseJson } from '@/lib/utils';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const RESOURCES = ['keywords', 'prompts', 'citations', 'leads', 'articles', 'audit', 'backlinks'] as const;
type Resource = (typeof RESOURCES)[number];

const Query = z.object({
  resource: z.enum(RESOURCES),
  format: z.enum(['csv', 'json']).default('csv'),
  projectId: z.string().max(64).optional(),
});

/**
 * Export any tracked resource as CSV or JSON.
 *
 * The privacy policy promises users can take their data out at any time, so
 * this covers every resource the dashboard displays.
 */
export async function GET(req: Request) {
  const session = await getSession();
  if (!session) return fail('Not signed in.', 401);

  const url = new URL(req.url);
  const parsed = Query.safeParse({
    resource: url.searchParams.get('resource'),
    format: url.searchParams.get('format') ?? 'csv',
    projectId: url.searchParams.get('projectId') ?? undefined,
  });
  if (!parsed.success) {
    return fail(`Provide resource as one of: ${RESOURCES.join(', ')}.`);
  }

  const project = await resolveProject(session.orgId, parsed.data.projectId);
  if (!project) return fail('Project not found.', 404);

  const { rows, columns } = await collect(parsed.data.resource, project.id, project.name);

  if (parsed.data.format === 'json') {
    return new Response(JSON.stringify({ project: project.name, resource: parsed.data.resource, rows }, null, 2), {
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Disposition': `attachment; filename="${exportFilename(project.name, parsed.data.resource, 'json')}"`,
        'Cache-Control': 'no-store',
      },
    });
  }

  // A BOM makes Excel open UTF-8 correctly instead of mangling accents.
  return new Response(`﻿${toCsv(rows, columns)}`, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${exportFilename(project.name, parsed.data.resource, 'csv')}"`,
      'Cache-Control': 'no-store',
    },
  });
}

type Columns = Array<{ key: string; header: string }>;

async function collect(
  resource: Resource,
  projectId: string,
  projectName: string,
): Promise<{ rows: Array<Record<string, unknown>>; columns: Columns }> {
  switch (resource) {
    case 'keywords': {
      const { rows } = await getKeywords(projectId);
      return {
        rows: rows.map((k) => ({
          keyword: k.phrase, position: k.position || '', change30d: k.delta,
          volume: k.volume, difficulty: k.difficulty, cpc: k.cpc, intent: k.intent,
          estimatedTraffic: k.traffic, trafficValue: k.value,
          opportunityScore: k.opportunity, band: k.band,
        })),
        columns: [
          { key: 'keyword', header: 'Keyword' },
          { key: 'position', header: 'Position' },
          { key: 'change30d', header: '30d change' },
          { key: 'volume', header: 'Volume' },
          { key: 'difficulty', header: 'Difficulty' },
          { key: 'cpc', header: 'CPC' },
          { key: 'intent', header: 'Intent' },
          { key: 'estimatedTraffic', header: 'Est. traffic' },
          { key: 'trafficValue', header: 'Traffic value' },
          { key: 'opportunityScore', header: 'Opportunity' },
          { key: 'band', header: 'Band' },
        ],
      };
    }

    case 'prompts': {
      const prompts = await db.aiPrompt.findMany({
        where: { projectId },
        include: { checks: { orderBy: { runAt: 'desc' }, take: 6 } },
      });
      return {
        rows: prompts.map((p) => {
          const latest = p.checks;
          const mentioned = latest.filter((c) => c.brandMentioned).length;
          const cited = latest.filter((c) => c.brandCited).length;
          return {
            prompt: p.text, cluster: p.cluster, intent: p.intent,
            enginesChecked: latest.length,
            mentionedIn: mentioned, citedIn: cited,
            lastRun: latest[0]?.runAt ?? '',
          };
        }),
        columns: [
          { key: 'prompt', header: 'Prompt' },
          { key: 'cluster', header: 'Cluster' },
          { key: 'intent', header: 'Intent' },
          { key: 'enginesChecked', header: 'Engines checked' },
          { key: 'mentionedIn', header: 'Mentioned in' },
          { key: 'citedIn', header: 'Cited in' },
          { key: 'lastRun', header: 'Last run' },
        ],
      };
    }

    case 'citations': {
      // Observations, not legacy checks: every exported row carries the run id
      // that produced it, its sample index and its provenance, so a spreadsheet
      // can reproduce the numbers the dashboard shows.
      const rows = await db.observation.findMany({
        where: { run: { projectId } },
        include: { run: { select: { startedAt: true, trigger: true, dataMode: true } } },
        orderBy: { observedAt: 'desc' },
        take: 5000,
      });
      return {
        rows: rows.map((o) => ({
          runId: o.runId,
          runStartedAt: o.run.startedAt,
          trigger: o.run.trigger,
          dataMode: o.run.dataMode,
          engine: engineName(o.engine),
          vendor: o.vendor,
          modelRequested: o.modelRequested,
          modelReturned: o.modelReturned,
          groundingRequested: o.groundingRequested,
          groundingConfirmed: o.groundingConfirmed,
          sampleIndex: o.sampleIndex,
          locale: `${o.localeTag}/${o.regionCode}`,
          prompt: o.promptTextSnapshot,
          promptVersion: o.promptVersion,
          status: o.status,
          errorCategory: o.errorCategory,
          mentioned: o.brandMentioned,
          cited: o.brandCited,
          mentionRank: o.mentionRank || '',
          sentiment: o.sentiment,
          shareOfVoice: o.shareOfVoice,
          citedUrls: parseJson<string[]>(o.citedUrls, []).join(' | '),
          competitorsNamed: parseJson<string[]>(o.competitors, []).join(' | '),
          latencyMs: o.latencyMs,
          inputTokens: o.inputTokens,
          outputTokens: o.outputTokens,
          estimatedCostUsd: o.estimatedCostUsd,
          methodologyVersion: o.methodologyVersion,
          parserVersion: o.parserVersion,
          excerpt: o.evidenceExcerpt,
        })),
        columns: [
          { key: 'runId', header: 'Run ID' },
          { key: 'runStartedAt', header: 'Run started at' },
          { key: 'trigger', header: 'Trigger' },
          { key: 'dataMode', header: 'Data mode' },
          { key: 'engine', header: 'Engine' },
          { key: 'vendor', header: 'Vendor' },
          { key: 'modelRequested', header: 'Model requested' },
          { key: 'modelReturned', header: 'Model returned' },
          { key: 'groundingRequested', header: 'Grounding requested' },
          { key: 'groundingConfirmed', header: 'Grounding confirmed' },
          { key: 'sampleIndex', header: 'Sample index' },
          { key: 'locale', header: 'Locale requested' },
          { key: 'prompt', header: 'Prompt' },
          { key: 'promptVersion', header: 'Prompt version' },
          { key: 'status', header: 'Status' },
          { key: 'errorCategory', header: 'Error category' },
          { key: 'mentioned', header: 'Mentioned' },
          { key: 'cited', header: 'Cited' },
          { key: 'mentionRank', header: 'Mention rank' },
          { key: 'sentiment', header: 'Sentiment' },
          { key: 'shareOfVoice', header: 'Share of voice' },
          { key: 'citedUrls', header: 'Cited URLs' },
          { key: 'competitorsNamed', header: 'Competitors named' },
          { key: 'latencyMs', header: 'Latency ms' },
          { key: 'inputTokens', header: 'Input tokens' },
          { key: 'outputTokens', header: 'Output tokens' },
          { key: 'estimatedCostUsd', header: 'Estimated cost USD' },
          { key: 'methodologyVersion', header: 'Methodology version' },
          { key: 'parserVersion', header: 'Parser version' },
          { key: 'excerpt', header: 'Evidence excerpt' },
        ],
      };
    }

    case 'leads': {
      const leads = await db.lead.findMany({ where: { projectId }, orderBy: { capturedAt: 'desc' } });
      return {
        rows: leads.map((l) => ({
          capturedAt: l.capturedAt, name: l.name, email: l.email,
          source: l.source, engine: l.engine ? engineName(l.engine) : '',
          landingUrl: l.landingUrl, status: l.status, value: l.value,
        })),
        columns: [
          { key: 'capturedAt', header: 'Captured at' },
          { key: 'name', header: 'Name' },
          { key: 'email', header: 'Email' },
          { key: 'source', header: 'Source' },
          { key: 'engine', header: 'Engine' },
          { key: 'landingUrl', header: 'Landing URL' },
          { key: 'status', header: 'Status' },
          { key: 'value', header: 'Value' },
        ],
      };
    }

    case 'articles': {
      const articles = await db.article.findMany({ where: { projectId }, orderBy: { updatedAt: 'desc' } });
      return {
        rows: articles.map((a) => ({
          title: a.title, slug: a.slug, status: a.status, wordCount: a.wordCount,
          seoScore: a.seoScore, geoScore: a.aiReadyScore, readability: a.readability,
          publishedUrl: a.publishedUrl, publishedAt: a.publishedAt ?? '',
        })),
        columns: [
          { key: 'title', header: 'Title' },
          { key: 'slug', header: 'Slug' },
          { key: 'status', header: 'Status' },
          { key: 'wordCount', header: 'Words' },
          { key: 'seoScore', header: 'SEO score' },
          { key: 'geoScore', header: 'GEO score' },
          { key: 'readability', header: 'Flesch' },
          { key: 'publishedUrl', header: 'Published URL' },
          { key: 'publishedAt', header: 'Published at' },
        ],
      };
    }

    case 'audit': {
      const latest = await db.auditRun.findFirst({
        where: { projectId },
        orderBy: { startedAt: 'desc' },
        include: { issues: true },
      });
      return {
        rows: (latest?.issues ?? []).map((i) => ({
          severity: i.severity, category: i.category, title: i.title,
          detail: i.detail, url: i.url, code: i.code,
        })),
        columns: [
          { key: 'severity', header: 'Severity' },
          { key: 'category', header: 'Category' },
          { key: 'title', header: 'Issue' },
          { key: 'detail', header: 'Detail' },
          { key: 'url', header: 'URL' },
          { key: 'code', header: 'Code' },
        ],
      };
    }

    case 'backlinks': {
      const backlinks = await db.backlink.findMany({ where: { projectId }, orderBy: { authority: 'desc' } });
      return {
        rows: backlinks.map((b) => ({
          sourceUrl: b.sourceUrl, targetUrl: b.targetUrl, anchor: b.anchor,
          dofollow: b.dofollow, authority: b.authority, firstSeen: b.firstSeen,
        })),
        columns: [
          { key: 'sourceUrl', header: 'Source URL' },
          { key: 'targetUrl', header: 'Target URL' },
          { key: 'anchor', header: 'Anchor' },
          { key: 'dofollow', header: 'Dofollow' },
          { key: 'authority', header: 'Authority' },
          { key: 'firstSeen', header: 'First seen' },
        ],
      };
    }
  }

  // Unreachable: the enum above is exhaustive.
  void projectName;
  return { rows: [], columns: [] };
}
