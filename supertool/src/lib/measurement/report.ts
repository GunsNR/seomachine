import 'server-only';
import { db } from '../db';
import { MEASURABLE_ENGINES, DEMO_ENGINES, getEngine, type Engine } from '../ai/engines';
import {
  MIN_OBSERVATIONS_FOR_RATE,
  binaryRate,
  coverageOf,
  costTotals,
  isObservedStatus,
  runToRunVariation,
  summarizeRun,
  type RateResult,
  type Variation,
} from './stats';
import { isInterrupted, type RunStatus } from './run';

/**
 * Reading measurement data back out.
 *
 * The single rule this module exists to enforce: observations are grouped by
 * RUN ID and only by run ID. Grouping by date — which is what this codebase did
 * before Gate 1 — invents runs that never happened, hides before/after
 * comparisons, silently reweights unequal runs, and splits or merges depending
 * on the viewer's timezone. See docs/measurement-spec.md section 7.
 */

export interface EngineBreakdown {
  id: string;
  name: string;
  color: string;
  attempted: number;
  observed: number;
  /** null when this engine observed nothing in the run. */
  inclusionRate: number | null;
  citationRate: number | null;
  insufficientEvidence: boolean;
  /** Why nothing was observed, when nothing was. */
  reason: string;
  groundingConfirmed: boolean;
}

export interface RunReport {
  runId: string;
  startedAt: Date;
  finishedAt: Date | null;
  status: RunStatus;
  /** True when the run has sat in `running` past the staleness window. */
  interrupted: boolean;
  trigger: string;
  dataMode: string;
  promptSetVersion: string;
  methodologyVersion: string;
  samplesPerPair: number;
  localeTag: string;
  regionCode: string;

  attempted: number;
  observed: number;
  failed: number;
  unavailable: number;
  coverage: number;

  inclusion: RateResult;
  citation: RateResult;
  shareOfVoice: number | null;
  meanMentionRank: number | null;

  totalCostUsd: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  usageReportedCount: number;

  byEngine: EngineBreakdown[];
}

function engineList(dataMode: string): readonly Engine[] {
  return dataMode === 'demo' ? DEMO_ENGINES : MEASURABLE_ENGINES;
}

/**
 * Build a report for one run.
 *
 * Every rate here comes from `summarizeRun`, which divides by observed rows.
 * Coverage is the only figure whose denominator is attempts.
 */
export async function getRunReport(runId: string): Promise<RunReport | null> {
  const run = await db.measurementRun.findUnique({ where: { id: runId } });
  if (!run) return null;

  const rows = await db.observation.findMany({ where: { runId } });
  const summary = summarizeRun(rows);

  // Engines that appear in the data, plus engines the run should have covered,
  // so an engine that produced nothing is visible as a gap rather than absent.
  const expectedEngines = engineList(run.dataMode);
  const seen = new Set(rows.map((r) => r.engine));
  const engineIds = [...new Set([...expectedEngines.map((e) => e.id), ...seen])];

  const byEngine: EngineBreakdown[] = engineIds.map((id) => {
    const engineRows = rows.filter((r) => r.engine === id);
    const observedRows = engineRows.filter((r) => isObservedStatus(r.status));
    const inclusion = binaryRate(
      observedRows.filter((r) => r.brandMentioned).length,
      observedRows.length,
    );
    const citation = binaryRate(
      observedRows.filter((r) => r.brandCited).length,
      observedRows.length,
    );
    const def = getEngine(id);

    return {
      id,
      name: def?.name ?? id,
      color: def?.color ?? '#888888',
      attempted: engineRows.length,
      observed: observedRows.length,
      inclusionRate: inclusion.rate,
      citationRate: citation.rate,
      insufficientEvidence: inclusion.insufficientEvidence,
      reason:
        engineRows.find((r) => r.errorDetail)?.errorDetail ||
        def?.unavailableReason ||
        (engineRows.length === 0 ? 'Not attempted in this run.' : ''),
      groundingConfirmed: engineRows.some((r) => r.groundingConfirmed),
    };
  });

  return {
    runId: run.id,
    startedAt: run.startedAt,
    finishedAt: run.finishedAt,
    status: run.status as RunStatus,
    interrupted: isInterrupted(run.status, run.startedAt),
    trigger: run.trigger,
    dataMode: run.dataMode,
    promptSetVersion: run.promptSetVersion,
    methodologyVersion: run.methodologyVersion,
    samplesPerPair: run.samplesPerPair,
    localeTag: run.localeTag,
    regionCode: run.regionCode,

    attempted: summary.coverage.attempted,
    observed: summary.coverage.observed,
    failed: summary.coverage.failed,
    unavailable: summary.coverage.unavailable,
    coverage: summary.coverage.coverage,

    inclusion: summary.inclusion,
    citation: summary.citation,
    shareOfVoice: summary.shareOfVoice,
    meanMentionRank: summary.meanMentionRank,

    totalCostUsd: summary.cost.estimatedCostUsd,
    totalInputTokens: summary.cost.inputTokens,
    totalOutputTokens: summary.cost.outputTokens,
    usageReportedCount: summary.cost.usageReported,

    byEngine,
  };
}

export interface TrendPoint {
  runId: string;
  startedAt: Date;
  /** null when that run had insufficient evidence. */
  inclusionRate: number | null;
  citationRate: number | null;
  observed: number;
  attempted: number;
  coverage: number;
  promptSetVersion: string;
  status: string;
}

/**
 * One point per RUN, never one point per day.
 *
 * Runs with a different prompt-set version are still returned — hiding them
 * would be its own distortion — but each point carries its version so the UI
 * can mark the instrument change rather than drawing a continuous line through
 * two different instruments.
 */
export async function getRunTrend(projectId: string, limit = 30): Promise<TrendPoint[]> {
  const runs = await db.measurementRun.findMany({
    where: { projectId, status: { in: ['completed', 'partial'] } },
    orderBy: { startedAt: 'desc' },
    take: limit,
    include: {
      observations: {
        select: { status: true, brandMentioned: true, brandCited: true },
      },
    },
  });

  return runs
    .map((run) => {
      const summary = summarizeRun(run.observations);
      return {
        runId: run.id,
        startedAt: run.startedAt,
        inclusionRate: summary.inclusion.rate,
        citationRate: summary.citation.rate,
        observed: summary.coverage.observed,
        attempted: summary.coverage.attempted,
        coverage: summary.coverage.coverage,
        promptSetVersion: run.promptSetVersion,
        status: run.status,
      };
    })
    .reverse();
}

export interface VariationReport {
  inclusion: Variation;
  citation: Variation;
  /** Runs that shared the prompt-set version being compared. */
  comparableRuns: number;
  promptSetVersion: string;
}

/**
 * Run-to-run spread for the most recent prompt-set version.
 *
 * Deliberately restricted to runs sharing a prompt-set version: comparing runs
 * built from different prompt sets compares two different instruments. Reported
 * separately from the within-run interval because repeated samples inside one
 * run are not independent, so the Wilson interval cannot capture between-run
 * variance.
 */
export async function getRunVariation(projectId: string): Promise<VariationReport | null> {
  const latest = await db.measurementRun.findFirst({
    where: { projectId, status: { in: ['completed', 'partial'] } },
    orderBy: { startedAt: 'desc' },
    select: { promptSetVersion: true },
  });
  if (!latest) return null;

  const runs = await db.measurementRun.findMany({
    where: {
      projectId,
      promptSetVersion: latest.promptSetVersion,
      status: { in: ['completed', 'partial'] },
    },
    orderBy: { startedAt: 'desc' },
    take: 20,
    include: { observations: { select: { status: true, brandMentioned: true, brandCited: true } } },
  });

  const summaries = runs.map((r) => summarizeRun(r.observations));

  return {
    inclusion: runToRunVariation(summaries.map((s) => s.inclusion.rate)),
    citation: runToRunVariation(summaries.map((s) => s.citation.rate)),
    comparableRuns: runs.length,
    promptSetVersion: latest.promptSetVersion,
  };
}

/** The most recent run of any status, so an interrupted run is still visible. */
export async function getLatestRun(projectId: string) {
  return db.measurementRun.findFirst({
    where: { projectId },
    orderBy: { startedAt: 'desc' },
  });
}

export interface LegacySummary {
  /** Legacy AiCheck rows that exist for this project. */
  rows: number;
  /** How many carry a status other than the fail-closed default. */
  labelled: number;
  earliest: Date | null;
  latest: Date | null;
}

/**
 * Legacy `AiCheck` data, read but never promoted.
 *
 * Rows written before Gate 1 have no run id, no sample index, no prompt
 * snapshot and no token accounting. They cannot be reconstructed into
 * observations without inventing those fields, so they are reported as a
 * separate legacy record and are excluded from every rate, interval and trend.
 *
 * They are NOT relabelled as live measurements and NOT migrated here. Gate 2
 * owns the first reviewed Postgres migration; whether legacy rows are archived
 * or discarded is a decision for that gate, made with a real database in front
 * of it rather than assumed now.
 */
export async function getLegacySummary(projectId: string): Promise<LegacySummary> {
  const rows = await db.aiCheck.findMany({
    where: { prompt: { projectId } },
    select: { status: true, runAt: true },
    orderBy: { runAt: 'asc' },
  });

  return {
    rows: rows.length,
    labelled: rows.filter((r) => r.status !== 'unavailable').length,
    earliest: rows[0]?.runAt ?? null,
    latest: rows[rows.length - 1]?.runAt ?? null,
  };
}

export { MIN_OBSERVATIONS_FOR_RATE, coverageOf, costTotals };
