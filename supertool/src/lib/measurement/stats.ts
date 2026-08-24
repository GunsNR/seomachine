/**
 * The arithmetic behind every number the product reports.
 *
 * Normative definitions live in docs/measurement-spec.md §2 and §5. This module
 * is the single implementation of them; nothing else in the codebase may divide
 * one observation count by another.
 *
 * The governing rule, restated because it is the one that is easy to get wrong:
 * a failed or unavailable observation belongs to the denominator of COVERAGE
 * ONLY. It never enters the numerator or denominator of a rate. Dividing by
 * attempts instead of observations turns a provider outage into a finding about
 * the brand.
 */

/** Bump when any definition in docs/measurement-spec.md changes. */
export const METHODOLOGY_VERSION = 'm1';
/** Bump when the answer parser changes what it extracts. */
export const PARSER_VERSION = 'p1';

/**
 * Observed observations required before a rate is shown as a number.
 *
 * A documented product judgement, not a statistical derivation: low enough to
 * be reachable on a small prompt set, high enough that the interval around the
 * rate is visibly wide rather than invisibly wrong.
 */
export const MIN_OBSERVATIONS_FOR_RATE = 5;

/** Runs required before run-to-run variation is reported at all. */
export const MIN_RUNS_FOR_VARIATION = 2;

/** z for a two-sided 95% interval. */
const Z_95 = 1.96;

/** The four provenance states an observation can be in. */
export type ObservationStatus = 'live' | 'simulated' | 'failed' | 'unavailable';

/** True when this observation carries an answer that could be analysed. */
export function isObservedStatus(status: string): boolean {
  return status === 'live' || status === 'simulated';
}

export interface Interval {
  low: number;
  high: number;
  /** Half-width, for callers that want a ± presentation. */
  half: number;
}

/**
 * 95% Wilson score interval for a binomial proportion.
 *
 * Wilson rather than the normal approximation because the normal approximation
 * is degenerate exactly where this product operates: at k = 0 it returns
 * [0, 0], asserting certainty from evidence containing none. Wilson stays
 * inside [0, 1] and stays sensible at k = 0 and k = n.
 *
 * ASSUMPTION, and it is not fully met here: this treats the n observations as
 * independent Bernoulli trials. Samples within a run are drawn close together
 * against the same index state, and samples across engines share a prompt, so
 * the real uncertainty is at least this wide and probably wider. Callers must
 * present this as a lower bound on uncertainty, never as a guarantee. Between-
 * run variance is reported separately by `runToRunVariation`.
 */
export function wilsonInterval(successes: number, n: number, z: number = Z_95): Interval {
  if (n <= 0) return { low: 0, high: 1, half: 0.5 };

  const k = Math.max(0, Math.min(successes, n));
  const z2 = z * z;
  const denominator = n + z2;
  const centre = (k + z2 / 2) / denominator;
  const half = (z / denominator) * Math.sqrt((k * (n - k)) / n + z2 / 4);

  return {
    low: Math.max(0, centre - half),
    high: Math.min(1, centre + half),
    half,
  };
}

/** A rate with everything needed to judge whether to believe it. */
export interface RateResult {
  /** Observations that produced an answer. The denominator. */
  n: number;
  /** Observations meeting the condition. The numerator. */
  successes: number;
  /** null below MIN_OBSERVATIONS_FOR_RATE — deliberately not a number. */
  rate: number | null;
  /** null whenever `rate` is null. */
  interval: Interval | null;
  /** True when there is not yet enough evidence to state a rate. */
  insufficientEvidence: boolean;
}

/**
 * Compute a binary rate over observed rows only.
 *
 * Below the minimum-evidence threshold this returns `rate: null` rather than a
 * number. That is the point: a rate from one or two samples is noise wearing
 * the costume of a measurement, and a customer cannot be expected to know that.
 */
export function binaryRate(successes: number, observed: number): RateResult {
  const n = Math.max(0, observed);
  const k = Math.max(0, Math.min(successes, n));
  const enough = n >= MIN_OBSERVATIONS_FOR_RATE;

  return {
    n,
    successes: k,
    rate: enough ? k / n : null,
    interval: enough ? wilsonInterval(k, n) : null,
    insufficientEvidence: !enough,
  };
}

/** The minimum shape `summarize` needs from a stored observation. */
export interface ObservationLike {
  status: string;
  brandMentioned?: boolean;
  brandCited?: boolean;
  mentionRank?: number;
  shareOfVoice?: number;
  inputTokens?: number;
  outputTokens?: number;
  estimatedCostUsd?: number;
  latencyMs?: number;
}

export interface CoverageResult {
  /** Every observation in the set, whatever its status. */
  attempted: number;
  /** live + simulated. */
  observed: number;
  live: number;
  simulated: number;
  failed: number;
  unavailable: number;
  /** observed / attempted, 0-1. */
  coverage: number;
  /** True only when every single attempt produced an answer. */
  complete: boolean;
}

export function coverageOf(rows: readonly ObservationLike[]): CoverageResult {
  let live = 0, simulated = 0, failed = 0, unavailable = 0;
  for (const r of rows) {
    if (r.status === 'live') live++;
    else if (r.status === 'simulated') simulated++;
    else if (r.status === 'failed') failed++;
    else unavailable++;
  }
  const attempted = rows.length;
  const observed = live + simulated;

  return {
    attempted,
    observed,
    live,
    simulated,
    failed,
    unavailable,
    coverage: attempted ? observed / attempted : 0,
    complete: attempted > 0 && observed === attempted,
  };
}

export interface CostTotals {
  inputTokens: number;
  outputTokens: number;
  estimatedCostUsd: number;
  /** How many observations actually reported usage. 0 tokens means "not
   *  reported", not "none used", so this distinguishes the two. */
  usageReported: number;
  /** Mean latency over observations that recorded one. */
  meanLatencyMs: number | null;
}

/**
 * Cost and token totals.
 *
 * Aggregated over every attempted observation, not just observed ones: a failed
 * call can still have cost money, and hiding that would understate spend.
 */
export function costTotals(rows: readonly ObservationLike[]): CostTotals {
  let inputTokens = 0, outputTokens = 0, cost = 0, usageReported = 0;
  let latencySum = 0, latencyCount = 0;

  for (const r of rows) {
    const inTok = r.inputTokens ?? 0;
    const outTok = r.outputTokens ?? 0;
    inputTokens += inTok;
    outputTokens += outTok;
    cost += r.estimatedCostUsd ?? 0;
    if (inTok > 0 || outTok > 0) usageReported++;
    if (r.latencyMs && r.latencyMs > 0) { latencySum += r.latencyMs; latencyCount++; }
  }

  return {
    inputTokens,
    outputTokens,
    // Money, rounded to the cent. Not reconciled against any invoice.
    estimatedCostUsd: Math.round(cost * 100) / 100,
    usageReported,
    meanLatencyMs: latencyCount ? Math.round(latencySum / latencyCount) : null,
  };
}

/** Everything one run says, with the evidence to judge it. */
export interface RunSummary {
  coverage: CoverageResult;
  inclusion: RateResult;
  citation: RateResult;
  /** Mean share of voice over observed rows. null when nothing was observed. */
  shareOfVoice: number | null;
  /** Mean rank over INCLUSIONS, not observations — rank is undefined when absent. */
  meanMentionRank: number | null;
  cost: CostTotals;
}

/**
 * Summarise one run's observations.
 *
 * Every denominator here is `observed`, except coverage's, which is `attempted`.
 * That asymmetry is the whole design.
 */
export function summarizeRun(rows: readonly ObservationLike[]): RunSummary {
  const coverage = coverageOf(rows);
  const observedRows = rows.filter((r) => isObservedStatus(r.status));

  const mentions = observedRows.filter((r) => r.brandMentioned === true);
  const citations = observedRows.filter((r) => r.brandCited === true);

  const sovSum = observedRows.reduce((s, r) => s + (r.shareOfVoice ?? 0), 0);
  const rankRows = mentions.filter((r) => (r.mentionRank ?? 0) > 0);
  const rankSum = rankRows.reduce((s, r) => s + (r.mentionRank ?? 0), 0);

  return {
    coverage,
    inclusion: binaryRate(mentions.length, observedRows.length),
    citation: binaryRate(citations.length, observedRows.length),
    shareOfVoice: observedRows.length ? sovSum / observedRows.length : null,
    meanMentionRank: rankRows.length ? rankSum / rankRows.length : null,
    cost: costTotals(rows),
  };
}

export interface Variation {
  /** How many runs contributed. */
  runs: number;
  mean: number;
  min: number;
  max: number;
  /** Sample standard deviation across run-level rates. */
  standardDeviation: number;
  /** True when there were too few comparable runs to say anything. */
  insufficientRuns: boolean;
}

/**
 * Empirical spread of a rate across completed runs.
 *
 * Reported separately from the within-run interval on purpose. The Wilson
 * interval assumes independent samples, which repeated samples inside one run
 * are not. This is the between-run variance that assumption misses, measured
 * rather than modelled.
 *
 * Callers must only pass runs that share a prompt-set version: comparing runs
 * built from different prompt sets compares two different instruments.
 */
export function runToRunVariation(runRates: readonly (number | null)[]): Variation {
  const rates = runRates.filter((r): r is number => r !== null && Number.isFinite(r));

  if (rates.length < MIN_RUNS_FOR_VARIATION) {
    return {
      runs: rates.length,
      mean: 0,
      min: 0,
      max: 0,
      standardDeviation: 0,
      insufficientRuns: true,
    };
  }

  const mean = rates.reduce((a, b) => a + b, 0) / rates.length;
  // Sample (n-1) rather than population: these runs are a sample of the runs
  // that could have happened, not the whole population of them.
  const variance = rates.reduce((s, r) => s + (r - mean) ** 2, 0) / (rates.length - 1);

  return {
    runs: rates.length,
    mean,
    min: Math.min(...rates),
    max: Math.max(...rates),
    standardDeviation: Math.sqrt(variance),
    insufficientRuns: false,
  };
}

/* ------------------------------------------------------------------ */
/* Presentation helpers — kept here so precision rules live in one place */
/* ------------------------------------------------------------------ */

/** Whole percentage points. Never more precision than the evidence supports. */
export function formatRate(rate: number | null): string {
  return rate === null ? '—' : `${Math.round(rate * 100)}%`;
}

/** "12%–34%", or an em dash when there is no interval to show. */
export function formatInterval(interval: Interval | null): string {
  if (!interval) return '—';
  return `${Math.round(interval.low * 100)}%–${Math.round(interval.high * 100)}%`;
}

/** "3 of 30 observed (10% coverage)". */
export function formatCoverage(c: CoverageResult): string {
  return `${c.observed} of ${c.attempted} observed (${Math.round(c.coverage * 100)}% coverage)`;
}
