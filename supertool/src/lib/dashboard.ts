import 'server-only';
import { rollUpVisibility } from './ai/analysis';
import { ENGINES, type EngineId } from './ai/engines';
import { db } from './db';
import { ctrForPosition, estimatedTraffic, opportunityScore, shareOfVoice } from './seo/metrics';
import { parseJson } from './utils';

/** A daily/weekly point for the trend charts. */
export interface TrendPoint { date: string; value: number }

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
      byEngine: [] as Array<{ id: EngineId; name: string; color: string; score: number; mentionRate: number; citationRate: number; checks: number }>,
      trend: [] as TrendPoint[],
      promptRows: [] as Array<{ id: string; text: string; cluster: string; mentionRate: number; citationRate: number; engines: number; lastRun: Date | null }>,
      competitorShare: [] as Array<{ domain: string; mentions: number; share: number }>,
      gaps: [] as Array<{ id: string; text: string; cluster: string }>,
      simulated: true,
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

  const rollup = rollUpVisibility(latest);
  const previousScore = previous.length ? rollUpVisibility(previous).score : rollup.score;

  const byEngine = ENGINES.map((e) => {
    const rows = latest.filter((c) => c.engine === e.id);
    const r = rollUpVisibility(rows);
    return {
      id: e.id, name: e.name, color: e.color,
      score: r.score, mentionRate: r.mentionRate, citationRate: r.citationRate, checks: rows.length,
    };
  });

  const trend: TrendPoint[] = runDates.map((date) => ({
    date,
    value: rollUpVisibility(allChecks.filter((c) => c.runAt.toISOString().slice(0, 10) === date)).score,
  }));

  const promptRows = prompts.map((p) => {
    const rows = p.checks.filter((c) => c.runAt.toISOString().slice(0, 10) === latestDate);
    const r = rollUpVisibility(rows);
    return {
      id: p.id, text: p.text, cluster: p.cluster,
      mentionRate: r.mentionRate, citationRate: r.citationRate,
      engines: rows.length,
      lastRun: rows[0]?.runAt ?? null,
    };
  }).sort((a, b) => a.mentionRate - b.mentionRate);

  // Competitor share of voice across the latest run.
  const tally = new Map<string, number>();
  for (const c of latest) {
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
    // Prompts where the brand is never named — the highest-leverage list.
    gaps: promptRows.filter((p) => p.mentionRate === 0).slice(0, 10)
      .map((p) => ({ id: p.id, text: p.text, cluster: p.cluster })),
    simulated: latest.every((c) => c.simulated),
    totalChecks: allChecks.length,
  };
}

/* ------------------------------------------------------------------ */
/* Keywords and rankings                                               */
/* ------------------------------------------------------------------ */

export async function getKeywords(projectId: string) {
  const keywords = await db.keyword.findMany({
    where: { projectId },
    include: { snapshots: { orderBy: { capturedAt: 'desc' }, take: 40 } },
  });

  const rows = keywords.map((k) => {
    const current = k.snapshots[0]?.position ?? 0;
    // Compare against roughly 30 days back (snapshots are every 3 days).
    const prior = k.snapshots[10]?.position ?? current;
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
      volume: k.volume,
      difficulty: k.difficulty,
      cpc: k.cpc,
      intent: k.intent,
      position: current,
      // Positive delta means the rank improved (moved toward 1).
      delta: prior && current ? prior - current : 0,
      traffic,
      value: Math.round(traffic * k.cpc * 100) / 100,
      opportunity: opportunity.score,
      band: opportunity.band,
      rationale: opportunity.rationale,
      history: [...k.snapshots].reverse().map((s) => ({
        date: s.capturedAt.toISOString().slice(0, 10),
        value: s.position,
      })),
    };
  });

  const ranked = rows.filter((r) => r.position >= 1 && r.position <= 100);

  return {
    rows: rows.sort((a, b) => b.opportunity - a.opportunity),
    summary: {
      total: rows.length,
      top3: ranked.filter((r) => r.position <= 3).length,
      top10: ranked.filter((r) => r.position <= 10).length,
      top100: ranked.length,
      traffic: rows.reduce((s, r) => s + r.traffic, 0),
      value: Math.round(rows.reduce((s, r) => s + r.value, 0)),
      shareOfVoice: shareOfVoice(rows.map((r) => ({ volume: r.volume, position: r.position }))),
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
  const byEngine = ENGINES.map((e) => ({
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
export async function getOverview(projectId: string) {
  const [visibility, keywords, audit, content, leads] = await Promise.all([
    getAiVisibility(projectId),
    getKeywords(projectId),
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
