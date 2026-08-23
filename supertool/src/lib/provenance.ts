/**
 * How to describe a set of observations honestly.
 *
 * A run is a set of rows, each with its own status. Summarising that set is
 * where products usually start lying: "5 of 6 engines failed" becomes a score,
 * and a single live result launders five simulated ones. So the rule here is
 * that a summary is `live` only when every row is a successful live call, and
 * anything else says exactly what it is.
 */
import type { CheckStatus } from './ai/providers';

/** Overall label for a set of observations. */
export type ProvenanceMode =
  /** Every row is a successful live provider call. */
  | 'live'
  /** Some rows are live, some could not be observed. Coverage is below 100%. */
  | 'partial'
  /** Sample data from a demo workspace. Not a measurement of anything. */
  | 'demo'
  /** Live and simulated rows in the same set — a bug, reported as one. */
  | 'mixed'
  /** Nothing could be observed at all. */
  | 'unavailable'
  /** No rows yet. */
  | 'none';

export interface Provenance {
  mode: ProvenanceMode;
  total: number;
  live: number;
  simulated: number;
  failed: number;
  unavailable: number;
  /** Rows carrying an answer that could be analysed. */
  observed: number;
  /** observed / total, 0-1. The share of the run that produced data. */
  coverage: number;
  /** True only when every single row is a successful live call. */
  fullyLive: boolean;
  /** True when any row is sample data. */
  containsSimulated: boolean;
}

export interface StatusRow {
  status: string;
}

const EMPTY: Provenance = {
  mode: 'none', total: 0, live: 0, simulated: 0, failed: 0, unavailable: 0,
  observed: 0, coverage: 0, fullyLive: false, containsSimulated: false,
};

export function summarizeProvenance(rows: readonly StatusRow[]): Provenance {
  const total = rows.length;
  if (!total) return EMPTY;

  let live = 0, simulated = 0, failed = 0, unavailable = 0;
  for (const r of rows) {
    if (r.status === 'live') live++;
    else if (r.status === 'simulated') simulated++;
    else if (r.status === 'failed') failed++;
    else unavailable++;
  }

  const observed = live + simulated;
  const fullyLive = live === total;

  let mode: ProvenanceMode;
  if (simulated > 0 && live > 0) mode = 'mixed';
  else if (simulated > 0) mode = 'demo';
  else if (live > 0) mode = fullyLive ? 'live' : 'partial';
  else mode = 'unavailable';

  return {
    mode,
    total,
    live,
    simulated,
    failed,
    unavailable,
    observed,
    coverage: Math.round((observed / total) * 10000) / 10000,
    fullyLive,
    containsSimulated: simulated > 0,
  };
}

/** A short label for a badge. */
export function provenanceLabel(p: Provenance): string {
  switch (p.mode) {
    case 'live': return 'Live data';
    case 'partial': return `Partial — ${Math.round(p.coverage * 100)}% coverage`;
    case 'demo': return 'Demo workspace — sample data';
    case 'mixed': return 'Mixed sources — do not rely on this';
    case 'unavailable': return 'No data collected';
    case 'none': return 'Nothing measured yet';
  }
}

/** A full sentence for a banner. Says what happened, never reassures. */
export function provenanceExplanation(p: Provenance): string {
  const gaps: string[] = [];
  if (p.failed) gaps.push(`${p.failed} provider ${p.failed === 1 ? 'call' : 'calls'} failed`);
  if (p.unavailable) gaps.push(`${p.unavailable} ${p.unavailable === 1 ? 'surface was' : 'surfaces were'} not connected`);
  const gapText = gaps.length ? ` ${gaps.join(' and ')}.` : '';

  switch (p.mode) {
    case 'live':
      return `All ${p.total} checks in this run came back from a live provider call.`;
    case 'partial':
      return `${p.live} of ${p.total} checks came back from a live provider call.${gapText} The rates below are calculated over what was observed, not over the full set — a check that never ran is not evidence that your brand was absent.`;
    case 'demo':
      return 'This is the demo workspace. Every answer here is generated sample text, not a measurement of any real assistant. No provider was called.';
    case 'mixed':
      return 'This run contains both live and sample rows, which should not be possible. Treat these numbers as unusable and report it.';
    case 'unavailable':
      return `Nothing was observed in this run.${gapText} Connect at least one provider credential to start measuring.`;
    case 'none':
      return 'No checks have been run for this project yet.';
  }
}

/** Severity for the UI: how loudly to say it. */
export function provenanceTone(p: Provenance): 'ok' | 'info' | 'warn' | 'error' {
  switch (p.mode) {
    case 'live': return 'ok';
    case 'partial': return 'warn';
    case 'demo': return 'info';
    case 'mixed': return 'error';
    case 'unavailable': return 'error';
    case 'none': return 'info';
  }
}

/** True when a set of rows may be presented as a measurement of reality. */
export function isRealMeasurement(p: Provenance): boolean {
  return (p.mode === 'live' || p.mode === 'partial') && p.live > 0;
}

export type { CheckStatus };
