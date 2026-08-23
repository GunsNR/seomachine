import 'server-only';
import { rollUpVisibility } from './ai/analysis';
import { MEASURABLE_ENGINES, type EngineId } from './ai/engines';
import { db } from './db';
import { ctrForPosition, estimatedTraffic, opportunityScore, shareOfVoice } from './seo/metrics';
import { isObserved, type CheckStatus } from './ai/providers';
import { summarizeProvenance, type Provenance } from './provenance';
import { keywordMetricsSource, rankSource } from './data-sources';
import { parseJson } from './utils';

/** A daily/weekly point for the trend charts. */
export interface TrendPoint { date: string; value: number }

export type { Provenance };

export async function getProjects(orgId: string) {
  return db.project.findMany({ where: { orgId }, orderBy: { createdAt: 'asc' } });
}

/* ------------------------------------------------------------------ */
/* AI visibility                                                       */
/* ------------------------------------------------------------------ */

export async function getAiVisibility(projectId: string) {
  const prompts = await db.aiPrompt.findMany({
    where: { projectId },
    include: { checks: { orderBy: { runAt: 'desc' } } },
  });

  const allChecks = prompts.flatMap((p) => p.checks);
  if (!allChecks.length) {
    return {
      rollup: rollUpVisibility([]),
      previousScore: 0,
      byEngine: [] as Array<{
        id: EngineId; name: string; color: string;
        score: number | null; mentionRate: number | null; citationRate: number | null;
        checks: number; observed: number; status: string; reason: string;
      }>,
      trend: [] as TrendPoint[],
      promptRows: [] as Array<{
        id: string; text: string; cluster: string;
        mentionRate: number | null; citationRate: number | null;
        engines: number; observed: number; lastRun: Date | null;
      }>,
      competitorShare: [] as Array<{ domain: string; mentions: number; share: number }>,
      gaps: [] as Array<{ id: string; text: string; cluster: string }>,
      provenance: summarizeProvenance([]),
      totalChecks: 0,
    };
  }

  // Group runs into discrete dates so the trend is per-run, not per-check.
  const runDates = [...new Set(allChecks.map((c) => c.runAt.toISOString().slice(0, 10)))].sort();
  const latestDate = runDates[runDates.length - 1];
  const previousDate = runDates[runDates.length - 2];

  const latest = allChecks.filter((c) => c.runAt.toISOString().slice(0, 10) === latestDate);
  const previous = previousDate
    ? allChecks.filter((c) => c.runAt.toISOString().slice(0, 10) === previousDate)
    : [];

  // Every rate below is computed over *observed* checks. A check that failed
  // or was never attempted is a hole in the run, and treating it as a zero
  // would silently report an outage as a drop in visibility.
  const observed = (rows: typeof allChecks) => rows.filter((c) => isObserved(c.status as CheckStatus));

  const provenance = summarizeProvenance(latest);
  const latestObserved = observed(latest);
  const rollup = rollUpVisibility(latestObserved);
  const previousObserved = observed(previous);
  const previousScore = previousObserved.length ? rollUpVisibility(previousObserved).score : rollup.score;

  const byEngine = MEASURABLE_ENGINES.map((e) => {
    const rows = latest.filter((c) => c.engine === e.id);
    const seen = observed(rows);
    const r = rollUpVisibility(seen);
    const p = summarizeProvenance(rows);
    return {
      id: e.id, name: e.name, color: e.color,
      // null, not zero: "we did not measure" is not "we measured nothing".
      score: seen.length ? r.score : null,
      mentionRate: seen.length ? r.mentionRate : null,
      citationRate: seen.length ? r.citationRate : null,
      checks: rows.length,
      observed: seen.length,
      status: p.mode,
      reason: rows.find((c) => c.errorCategory)?.errorCategory ?? '',
    };
  });

  const trend: TrendPoint[] = runDates
    .map((date) => {
      const rows = observed(allChecks.filter((c) => c.runAt.toISOString().slice(0, 10) === date));
      return { date, value: rows.length ? rollUpVisibility(rows).score : null };
    })
    // A day on which nothing was observed is omitted rather than plotted as a
    // crash to zero.
    .filter((p): p is TrendPoint => p.value !== null);

  const promptRows = prompts.map((p) => {
    const rows = p.checks.filter((c) => c.runAt.toISOString().slice(0, 10) === latestDate);
    const seen = observed(rows);
    const r = rollUpVisibility(seen);
    return {
      id: p.id, text: p.text, cluster: p.cluster,
      mentionRate: seen.length ? r.mentionRate : null,
      citationRate: seen.length ? r.citationRate : null,
      engines: rows.length,
      observed: seen.length,
      lastRun: rows[0]?.runAt ?? null,
    };
  }).sort((a, b) => (a.mentionRate ?? 1) - (b.mentionRate ?? 1));

  // Competitor share of voice across the latest run.
  const tally = new Map<string, number>();
  for (const c of latestObserved) {
    for (const domain of parseJson<string[]>(c.competitors, [])) {
      tally.set(domain, (tally.get(domain) ?? 0) + 1);
    }
  }
  const totalCompetitorMentions = [...tally.values()].reduce((a, b) => a + b, 0) || 1;
  const competitorShare = [...tally.entries()]
    .map(([domain, mentions]) => ({ domain, mentions, share: mentions / totalCompetitorMentions }))
    .sort((a, b) => b.mentions - a.mentions);

  return {
    rollup,
    previousScore,
    byEngine,
    trend,
    promptRows,
    competitorShare,
    // Prompts where the brand was observed and never named — the
    // highest-leverage list. A prompt with no observation is not a gap in
    // visibility, it is a gap in measurement, so it is excluded.
    gaps: promptRows.filter((p) => p.observed > 0 && p.mentionRate === 0).slice(0, 10)
      .map((p) => ({ id: p.id, text: p.text, cluster: p.cluster })),
    provenance,
    totalChecks: allChecks.length,
  };
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
