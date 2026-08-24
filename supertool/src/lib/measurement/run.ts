// Deliberately NOT marked `server-only`: this orchestrator is used by route
// handlers and by prisma/seed.ts, which runs as a plain Node script. It imports
// the Prisma client, which cannot execute in a browser regardless, and Next's
// bundler fails loudly on any client import of it.
import { createHash } from 'node:crypto';
import { analyzeAnswer } from '../ai/analysis';
import { MEASURABLE_ENGINES, DEMO_ENGINES, type Engine } from '../ai/engines';
import { ask, isObserved, type DataMode } from '../ai/providers';
import { db } from '../db';
import { estimateCostUsd } from './pricing';
import { METHODOLOGY_VERSION, PARSER_VERSION, coverageOf, costTotals } from './stats';

/**
 * Run orchestration.
 *
 * Two properties matter more than anything else here, and both are about what
 * happens when things go wrong:
 *
 *   1. The run row is written BEFORE the first provider call, and each
 *      observation is written AS IT COMPLETES. A process killed halfway leaves
 *      a durable, honest partial run — not a lost run, and not a run that
 *      silently reports itself complete.
 *
 *   2. Retrying is idempotent. The (runId, promptId, engine, sampleIndex)
 *      uniqueness constraint means a retry fills gaps and cannot double-count
 *      an observation that already landed.
 *
 * No paid queue infrastructure: Gate 1 deliberately keeps this in-process.
 * Gate 2 owns durable queueing.
 */

/** The run state machine. See docs/measurement-spec.md section 6. */
export type RunStatus =
  | 'queued'
  | 'running'
  | 'partial'
  | 'completed'
  | 'failed'
  | 'cancelled';

export type RunTrigger = 'manual' | 'scheduled' | 'backfill';

/** A run left in `running` longer than this is reported as interrupted. */
export const STALE_RUN_MS = 30 * 60_000;

export interface PromptInput {
  id: string;
  text: string;
  cluster?: string;
}

export interface StartRunInput {
  orgId: string;
  projectId: string;
  projectName: string;
  projectDomain: string;
  prompts: readonly PromptInput[];
  competitors: ReadonlyArray<{ name?: string; domain: string }>;
  dataMode: DataMode;
  trigger: RunTrigger;
  /** Repetitions per (prompt, engine) pair. */
  samplesPerPair?: number;
  localeTag?: string;
  regionCode?: string;
  /** Injectable for tests; defaults to the real registry. */
  engines?: readonly Engine[];
}

/**
 * Content hash of the prompt texts, in a stable order.
 *
 * Two runs with different versions measured with different instruments, so the
 * UI must not compare them silently.
 */
export function promptSetVersion(prompts: readonly PromptInput[]): string {
  const canonical = [...prompts].map((p) => p.text.trim()).sort().join(' ');
  return createHash('sha256').update(canonical).digest('hex').slice(0, 16);
}

/** Version of a single prompt's text, for the immutable per-observation snapshot. */
export function promptVersion(text: string): string {
  return createHash('sha256').update(text.trim()).digest('hex').slice(0, 12);
}

function answerHash(answer: string): string {
  return answer ? createHash('sha256').update(answer).digest('hex').slice(0, 16) : '';
}

/**
 * Which engines a run of this mode may attempt.
 *
 * Live runs iterate measurable surfaces only. Demo runs iterate surfaces that
 * have a real public API, because demo text is labelled sample data rather than
 * a measurement — but never a surface with no API at all.
 */
export function enginesForMode(mode: DataMode, override?: readonly Engine[]): readonly Engine[] {
  if (override) return override;
  return mode === 'demo' ? DEMO_ENGINES : MEASURABLE_ENGINES;
}

/**
 * Create the run row and return its id.
 *
 * Deliberately separate from execution so the run is durable before any
 * provider is contacted.
 */
export async function createRun(input: StartRunInput): Promise<string> {
  const engines = enginesForMode(input.dataMode, input.engines);
  const samples = Math.max(1, input.samplesPerPair ?? 1);

  const run = await db.measurementRun.create({
    data: {
      orgId: input.orgId,
      projectId: input.projectId,
      trigger: input.trigger,
      dataMode: input.dataMode,
      status: 'queued',
      promptSetVersion: promptSetVersion(input.prompts),
      methodologyVersion: METHODOLOGY_VERSION,
      samplesPerPair: samples,
      localeTag: input.localeTag ?? 'en-US',
      regionCode: input.regionCode ?? 'US',
      expectedObservations: input.prompts.length * engines.length * samples,
    },
    select: { id: true },
  });

  return run.id;
}

/** One observation row, ready to persist. */
function buildObservation(args: {
  runId: string;
  prompt: PromptInput;
  engine: Engine;
  sampleIndex: number;
  localeTag: string;
  regionCode: string;
  result: Awaited<ReturnType<typeof ask>>;
  brand: string;
  domain: string;
  competitors: ReadonlyArray<{ name?: string; domain: string }>;
}) {
  const { runId, prompt, engine, sampleIndex, localeTag, regionCode, result } = args;

  const base = {
    runId,
    promptId: prompt.id,
    promptTextSnapshot: prompt.text,
    promptVersion: promptVersion(prompt.text),
    promptCluster: prompt.cluster ?? '',
    engine: engine.id as string,
    vendor: engine.vendor,
    accessMethod: engine.accessMethod,
    modelRequested: result.model || (engine.model ?? ''),
    modelReturned: result.modelReturned,
    groundingRequested: result.groundingRequested,
    groundingConfirmed: result.groundingConfirmed,
    sampleIndex,
    localeTag,
    regionCode,
    status: result.status,
    errorCategory: result.errorCategory,
    errorDetail: result.error ?? '',
    latencyMs: result.latencyMs,
    inputTokens: result.inputTokens,
    outputTokens: result.outputTokens,
    estimatedCostUsd: estimateCostUsd(engine.id, result.inputTokens, result.outputTokens),
    parserVersion: PARSER_VERSION,
    methodologyVersion: METHODOLOGY_VERSION,
  };

  // A failed or unavailable observation produced no answer. Leaving the parsed
  // outcomes at their defaults keeps "we never asked" distinguishable from "the
  // assistant did not name you" — the aggregation reads `status`, never these.
  if (!isObserved(result.status)) return base;

  const a = analyzeAnswer({
    answer: result.answer,
    brand: args.brand,
    domain: args.domain,
    competitors: [...args.competitors],
    providedCitations: result.citations,
  });

  return {
    ...base,
    brandMentioned: a.brandMentioned,
    brandCited: a.brandCited,
    mentionRank: a.mentionRank,
    sentiment: a.sentiment,
    shareOfVoice: a.shareOfVoice,
    citedUrls: JSON.stringify(a.citedUrls),
    competitors: JSON.stringify(a.competitorsMentioned),
    evidenceExcerpt: a.excerpt,
    rawAnswerHash: answerHash(result.answer),
  };
}

export interface ExecuteResult {
  runId: string;
  status: RunStatus;
  attempted: number;
  observed: number;
  failed: number;
  unavailable: number;
  coverage: number;
  /** Observations skipped because a prior attempt already recorded them. */
  skippedExisting: number;
}

/**
 * Execute (or resume) a run.
 *
 * Safe to call more than once for the same run id: observations that already
 * exist are skipped rather than duplicated, so this doubles as the retry path.
 */
export async function executeRun(runId: string, input: StartRunInput): Promise<ExecuteResult> {
  const engines = enginesForMode(input.dataMode, input.engines);
  const samples = Math.max(1, input.samplesPerPair ?? 1);
  const localeTag = input.localeTag ?? 'en-US';
  const regionCode = input.regionCode ?? 'US';
  const competitors = [...input.competitors];

  await db.measurementRun.update({ where: { id: runId }, data: { status: 'running' } });

  // Whatever a previous attempt already durably recorded. Retrying must not
  // re-ask a question that already has an answer.
  const existing = await db.observation.findMany({
    where: { runId },
    select: { promptId: true, engine: true, sampleIndex: true },
  });
  const done = new Set(existing.map((o) => `${o.promptId}|${o.engine}|${o.sampleIndex}`));
  let skippedExisting = 0;

  try {
    for (const prompt of input.prompts) {
      for (let sampleIndex = 0; sampleIndex < samples; sampleIndex++) {
        // Engines run in parallel; prompts and samples run in sequence. That
        // bounds concurrency without a queue while keeping a run finishable.
        const results = await Promise.all(
          engines.map(async (engine) => {
            const key = `${prompt.id}|${engine.id}|${sampleIndex}`;
            if (done.has(key)) {
              skippedExisting++;
              return null;
            }

            const result = await ask({
              prompt: prompt.text,
              engine: engine.id,
              brand: input.projectName,
              domain: input.projectDomain,
              competitors,
              // Seeded per sample so repeated demo samples differ from each
              // other instead of being identical copies.
              seed: `${runId}|${prompt.id}|${sampleIndex}`,
              mode: input.dataMode,
            });

            return buildObservation({
              runId,
              prompt,
              engine,
              sampleIndex,
              localeTag,
              regionCode,
              result,
              brand: input.projectName,
              domain: input.projectDomain,
              competitors,
            });
          }),
        );

        // Persist as each fan-out completes, not at the end of the run. An
        // interruption after this point leaves these observations durable.
        for (const row of results) {
          if (!row) continue;
          await db.observation.create({ data: row as never }).catch(() => {
            // A unique-constraint violation means a concurrent attempt won the
            // race and already recorded this observation. That is the
            // idempotency guarantee working, not an error.
            skippedExisting++;
          });
        }
      }
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown run error';
    const partial = await finalizeRun(runId, message);
    return { ...partial, skippedExisting };
  }

  const finished = await finalizeRun(runId);
  return { ...finished, skippedExisting };
}

/**
 * Close out a run from what was actually persisted.
 *
 * Counts are recomputed from the observation rows rather than tracked in
 * memory, so a resumed run and a fresh run finalise identically.
 */
export async function finalizeRun(
  runId: string,
  error = '',
): Promise<Omit<ExecuteResult, 'skippedExisting'>> {
  const rows = await db.observation.findMany({
    where: { runId },
    select: {
      status: true,
      inputTokens: true,
      outputTokens: true,
      estimatedCostUsd: true,
      latencyMs: true,
    },
  });

  const run = await db.measurementRun.findUnique({
    where: { id: runId },
    select: { expectedObservations: true },
  });

  const cover = coverageOf(rows);
  const cost = costTotals(rows);
  const expected = run?.expectedObservations ?? cover.attempted;

  // A run that produced nothing is `failed`, not `completed` with a zero score.
  // A run that produced something but not everything is `partial` — a
  // first-class result, not an error.
  let status: RunStatus;
  if (cover.observed === 0) status = 'failed';
  else if (cover.attempted < expected || !cover.complete) status = 'partial';
  else status = 'completed';

  await db.measurementRun.update({
    where: { id: runId },
    data: {
      status,
      finishedAt: new Date(),
      observedCount: cover.observed,
      failedCount: cover.failed,
      unavailableCount: cover.unavailable,
      totalInputTokens: cost.inputTokens,
      totalOutputTokens: cost.outputTokens,
      totalCostUsd: cost.estimatedCostUsd,
      usageReportedCount: cost.usageReported,
      error,
    },
  });

  return {
    runId,
    status,
    attempted: cover.attempted,
    observed: cover.observed,
    failed: cover.failed,
    unavailable: cover.unavailable,
    coverage: cover.coverage,
  };
}

/** Create and execute in one call. */
export async function startRun(input: StartRunInput): Promise<ExecuteResult> {
  const runId = await createRun(input);
  return executeRun(runId, input);
}

/** True when a run has been sitting in `running` long enough to be suspect. */
export function isInterrupted(status: string, startedAt: Date, now = Date.now()): boolean {
  return status === 'running' && now - startedAt.getTime() > STALE_RUN_MS;
}
