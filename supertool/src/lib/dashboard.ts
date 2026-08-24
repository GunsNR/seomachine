import 'server-only';
import { MEASURABLE_ENGINES } from './ai/engines';
import { db } from './db';
import { ctrForPosition, estimatedTraffic, opportunityScore, shareOfVoice } from './seo/metrics';
import { binaryRate, isObservedStatus } from './measurement/stats';
import {
  getLatestRun,
  getLegacySummary,
  getRunReport,
  getRunTrend,
  getRunVariation,
} from './measurement/report';
import { keywordMetricsSource, rankSource } from './data-sources';
import { parseJson } from './utils';

/** A weekly point for the lead chart. */
export interface TrendPoint { date: string; value: number }

export async function getProjects(orgId: string) {
  return db.project.findMany({ where: { orgId }, orderBy: { createdAt: 'asc' } });
}

/* ------------------------------------------------------------------ */
/* AI visibility                                                       */
/* ------------------------------------------------------------------ */

/**
 * AI visibility for the latest measurement RUN.
 *
 * Gate 1 replaced date-based grouping with run-ID grouping. Two runs on the
 * same UTC day are two runs: merging them invented a run that never happened,
 * hid before/after comparisons, silently weighted the bigger run, and split or
 * merged depending on the viewer's timezone. See docs/measurement-spec.md
 * section 7.
 */
export async function getAiVisibility(projectId: string) {
  const [latestRun, trend, variation, legacy] = await Promise.all([
    getLatestRun(projectId),
    getRunTrend(projectId),
    getRunVariation(projectId),
    getLegacySummary(projectId),
  ]);

  const prompts = await db.aiPrompt.findMany({ where: { projectId } });

  if (!latestRun) {
    return {
      run: null,
      report: null,
      trend,
      variation,
      legacy,
      promptRows: [] as PromptRow[],
      competitorShare: [] as Array<{ domain: string; mentions: number; share: number }>,
      gaps: [] as Array<{ id: string; text: string; cluster: string }>,
      totalPrompts: prompts.length,
      previousInclusion: null as number | null,
    };
  }

  const report = await getRunReport(latestRun.id);

  const observations = await db.observation.findMany({
    where: { runId: latestRun.id },
  });

  // Per-prompt rates, computed over that prompt's OBSERVED rows only. A prompt
  // whose every engine failed has no rate — that is a gap in measurement, not a
  // finding about visibility.
  const promptRows: PromptRow[] = prompts.map((p) => {
    const rows = observations.filter((o) => o.promptId === p.id);
    const seen = rows.filter((o) => isObservedStatus(o.status));
    const inclusion = binaryRate(seen.filter((o) => o.brandMentioned).length, seen.length);
    const citation = binaryRate(seen.filter((o) => o.brandCited).length, seen.length);
    return {
      id: p.id,
      text: p.text,
      cluster: p.cluster,
      attempted: rows.length,
      observed: seen.length,
      inclusionRate: inclusion.rate,
      citationRate: citation.rate,
      insufficientEvidence: inclusion.insufficientEvidence,
    };
  }).sort((a, b) => (a.inclusionRate ?? 1) - (b.inclusionRate ?? 1));

  // Competitor share over observed rows in this run only.
  const observedRows = observations.filter((o) => isObservedStatus(o.status));
  const tally = new Map<string, number>();
  for (const o of observedRows) {
    for (const domain of parseJson<string[]>(o.competitors, [])) {
      tally.set(domain, (tally.get(domain) ?? 0) + 1);
    }
  }
  const totalCompetitorMentions = [...tally.values()].reduce((a, b) => a + b, 0) || 1;
  const competitorShare = [...tally.entries()]
    .map(([domain, mentions]) => ({ domain, mentions, share: mentions / totalCompetitorMentions }))
    .sort((a, b) => b.mentions - a.mentions);

  // The previous run's inclusion rate, for a delta. Undefined when there is no
  // comparable prior run — never defaulted to the current value.
  const previous = trend.length >= 2 ? trend[trend.length - 2] : null;

  return {
    run: latestRun,
    report,
    trend,
    variation,
    legacy,
    promptRows,
    competitorShare,
    // Prompts observed at least MIN times and never naming the brand. A prompt
    // with no observation is a gap in measurement, not a gap in visibility.
    gaps: promptRows
      .filter((p) => p.observed > 0 && p.inclusionRate === 0)
      .slice(0, 10)
      .map((p) => ({ id: p.id, text: p.text, cluster: p.cluster })),
    totalPrompts: prompts.length,
    previousInclusion: previous?.inclusionRate ?? null,
  };
}

export interface PromptRow {
  id: string;
  text: string;
  cluster: string;
  attempted: number;
  observed: number;
  inclusionRate: number | null;
  citationRate: number | null;
  insufficientEvidence: boolean;
}

/* ------------------------------------------------------------------ */
/* Keywords and rankings                                               */
/* ------------------------------------------------------------------ */

/**
 * Keyword rows plus the honest story about where each number came from.
 *
 * Positions only exist for the demo workspace: there is no SERP provider, so a
 * real project has no rank data and is told so rather than shown zeros.
 */
export async function getKeywords(projectId: string, opts: { dataMode?: string } = {}) {
  const isDemo = opts.dataMode === 'demo';
  const ranks = rankSource();
  // Ranking figures are only meaningful when a provider supplies them, or when
  // the workspace is explicitly demo data.
  const showRanks = ranks.connected || isDemo;

  const keywords = await db.keyword.findMany({
    where: { projectId },
    include: { snapshots: { orderBy: { capturedAt: 'desc' }, take: 40 } },
  });

  const rows = keywords.map((k) => {
    const current = showRanks ? k.snapshots[0]?.position ?? 0 : 0;
    // Compare against roughly 30 days back (snapshots are every 3 days).
    const prior = showRanks ? k.snapshots[10]?.position ?? current : current;
    const trend = parseJson<number[]>(k.trend, []);

    const opportunity = opportunityScore({
      volume: k.volume,
      position: current,
      difficulty: k.difficulty,
      intent: k.intent,
      cpc: k.cpc,
      clusterSize: 1,
      monthsSinceUpdate: 3,
      trend,
    });

    const traffic = estimatedTraffic(k.volume, current);

    return {
      id: k.id,
      phrase: k.phrase,
      dataSource: k.dataSource,
      // Per-field provenance travels with the row so the table can label each
      // column instead of implying one source for all of them.
      sources: {
        volume: k.volumeSource,
        difficulty: k.difficultySource,
        cpc: k.cpcSource,
      },
      provider: k.dataProvider,
      volume: k.volume,
      difficulty: k.difficulty,
      cpc: k.cpc,
      intent: k.intent,
      // null, not 0: 0 already means "outside the top 100".
      position: showRanks ? current : null,
      // Positive delta means the rank improved (moved toward 1).
      delta: showRanks && prior && current ? prior - current : 0,
      // Traffic and value are forecasts derived from a position. Without a
      // position they are not "zero", they are undefined.
      traffic: showRanks ? traffic : null,
      value: showRanks ? Math.round(traffic * k.cpc * 100) / 100 : null,
      opportunity: opportunity.score,
      band: opportunity.band,
      rationale: opportunity.rationale,
      history: showRanks
        ? [...k.snapshots].reverse().map((s) => ({
            date: s.capturedAt.toISOString().slice(0, 10),
            value: s.position,
          }))
        : [],
    };
  });

  const ranked = rows.filter((r) => r.position !== null && r.position >= 1 && r.position <= 100);

  return {
    rows: rows.sort((a, b) => b.opportunity - a.opportunity),
    /** How to describe the ranking half of this data, or why there is none. */
    rankSource: { ...ranks, shown: showRanks, demo: isDemo },
    keywordSource: keywordMetricsSource(),
    summary: {
      total: rows.length,
      // null when no rank source exists at all — a count of zero would read as
      // "you rank for nothing", which is a claim this product cannot make.
      top3: showRanks ? ranked.filter((r) => (r.position ?? 0) <= 3).length : null,
      top10: showRanks ? ranked.filter((r) => (r.position ?? 0) <= 10).length : null,
      top100: showRanks ? ranked.length : null,
      traffic: showRanks ? rows.reduce((s, r) => s + (r.traffic ?? 0), 0) : null,
      value: showRanks ? Math.round(rows.reduce((s, r) => s + (r.value ?? 0), 0)) : null,
      shareOfVoice: showRanks
        ? shareOfVoice(rows.map((r) => ({ volume: r.volume, position: r.position ?? 0 })))
        : null,
      quickWins: rows.filter((r) => r.band === 'quick-win').length,
    },
  };
}

/* ------------------------------------------------------------------ */
/* Audit, content, leads                                               */
/* ------------------------------------------------------------------ */

export async function getLatestAudit(projectId: string) {
  const audit = await db.auditRun.findFirst({
    where: { projectId },
    orderBy: { startedAt: 'desc' },
    include: { issues: true },
  });
  if (!audit) return null;

  const order = { critical: 0, warning: 1, notice: 2 } as const;
  const bySeverity = { critical: 0, warning: 0, notice: 0 };
  const byCategory = new Map<string, number>();

  for (const i of audit.issues) {
    bySeverity[i.severity as keyof typeof bySeverity]++;
    byCategory.set(i.category, (byCategory.get(i.category) ?? 0) + 1);
  }

  return {
    ...audit,
    bySeverity,
    byCategory: [...byCategory.entries()].map(([category, count]) => ({ category, count })),
    issues: [...audit.issues].sort(
      (a, b) =>
        (order[a.severity as keyof typeof order] ?? 3) - (order[b.severity as keyof typeof order] ?? 3),
    ),
  };
}

export async function getArticles(projectId: string) {
  const articles = await db.article.findMany({
    where: { projectId },
    orderBy: [{ status: 'asc' }, { updatedAt: 'desc' }],
  });

  const published = articles.filter((a) => a.status === 'published');
  return {
    articles,
    summary: {
      total: articles.length,
      published: published.length,
      inProgress: articles.length - published.length,
      avgSeo: avg(articles.map((a) => a.seoScore)),
      avgAiReady: avg(articles.map((a) => a.aiReadyScore)),
      words: articles.reduce((s, a) => s + a.wordCount, 0),
    },
  };
}

export async function getLeads(projectId: string) {
  const leads = await db.lead.findMany({
    where: { projectId },
    orderBy: { capturedAt: 'desc' },
  });

  const ai = leads.filter((l) => l.source === 'ai');
  const byEngine = MEASURABLE_ENGINES.map((e) => ({
    id: e.id,
    name: e.name,
    color: e.color,
    count: ai.filter((l) => l.engine === e.id).length,
  })).filter((e) => e.count > 0).sort((a, b) => b.count - a.count);

  // Last 8 weeks, oldest first.
  const weeks: TrendPoint[] = [];
  for (let w = 7; w >= 0; w--) {
    const end = Date.now() - w * 7 * 864e5;
    const start = end - 7 * 864e5;
    weeks.push({
      date: new Date(end).toISOString().slice(0, 10),
      value: leads.filter((l) => l.capturedAt.getTime() > start && l.capturedAt.getTime() <= end).length,
    });
  }

  return {
    leads,
    summary: {
      total: leads.length,
      ai: ai.length,
      organic: leads.filter((l) => l.source === 'organic').length,
      direct: leads.filter((l) => l.source === 'direct').length,
      won: leads.filter((l) => l.status === 'won').length,
      value: Math.round(leads.reduce((s, l) => s + l.value, 0)),
      aiValue: Math.round(ai.reduce((s, l) => s + l.value, 0)),
    },
    byEngine,
    weekly: weeks,
  };
}

/** Everything the overview screen needs, in one pass. */
export async function getOverview(projectId: string, opts: { dataMode?: string } = {}) {
  const [visibility, keywords, audit, content, leads] = await Promise.all([
    getAiVisibility(projectId),
    getKeywords(projectId, opts),
    getLatestAudit(projectId),
    getArticles(projectId),
    getLeads(projectId),
  ]);

  const topOpportunities = keywords.rows
    .filter((r) => r.band === 'quick-win' || r.band === 'high')
    .slice(0, 6);

  return { visibility, keywords, audit, content, leads, topOpportunities };
}

function avg(values: number[]): number {
  if (!values.length) return 0;
  return Math.round(values.reduce((a, b) => a + b, 0) / values.length);
}

export { ctrForPosition };
