import Link from 'next/link';
import { cn } from '@/lib/utils';
import { formatCoverage, formatInterval, formatRate, type RateResult } from '@/lib/measurement/stats';

/**
 * The minimum surface Gate 1 owes a reader: which run this is, when it ran,
 * whether it finished, how much of it produced data, and how wide the
 * uncertainty is.
 *
 * Deliberately plain. Gate 3 owns the broader UX; this exists so no number is
 * displayed without the evidence needed to judge it.
 */

const TONE = {
  ok: 'bg-ok/10 ring-ok/25',
  info: 'bg-brand/10 ring-brand/25',
  warn: 'bg-warn/10 ring-warn/25',
  error: 'bg-bad/10 ring-bad/30',
} as const;

export interface RunHeaderData {
  runId: string;
  startedAt: Date;
  finishedAt: Date | null;
  status: string;
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
}

function statusTone(run: RunHeaderData): keyof typeof TONE {
  if (run.interrupted) return 'error';
  if (run.dataMode === 'demo') return 'info';
  if (run.status === 'failed') return 'error';
  if (run.status === 'partial' || run.status === 'running') return 'warn';
  return 'ok';
}

function statusSentence(run: RunHeaderData): string {
  if (run.dataMode === 'demo') {
    return 'Demo workspace. Every answer in this run is generated sample text, not a measurement of any assistant. No provider was called.';
  }
  if (run.interrupted) {
    return 'This run was interrupted and never finished. The observations below are the ones that completed before it stopped; nothing has been inferred to fill the gap.';
  }
  switch (run.status) {
    case 'completed':
      return `All ${run.attempted} checks in this run returned an answer.`;
    case 'partial':
      return `${run.observed} of ${run.attempted} checks returned an answer. Rates below are calculated over what was observed — a check that never ran is not evidence that your brand was absent.`;
    case 'failed':
      return 'Nothing was observed in this run, so there is no rate to report. Connect a measurable engine to start collecting evidence.';
    case 'running':
      return 'This run is still in progress. Figures update as observations land.';
    case 'cancelled':
      return 'This run was cancelled. It reports only the observations that completed first.';
    default:
      return 'This run has not started yet.';
  }
}

/** Run identity, timing, status and coverage. */
export function RunHeader({ run }: { run: RunHeaderData }) {
  const tone = statusTone(run);

  return (
    <div className={cn('rounded-xl p-4 text-[0.84rem] leading-relaxed text-ink ring-1', TONE[tone])}>
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <strong className="font-semibold capitalize">
          {run.interrupted ? 'Interrupted run' : `${run.status} run`}
        </strong>
        <code className="rounded bg-white/70 px-1.5 py-0.5 text-[0.72rem]">{run.runId.slice(0, 12)}</code>
        <time dateTime={run.startedAt.toISOString()} className="text-[0.78rem] text-body">
          {run.startedAt.toISOString().replace('T', ' ').slice(0, 16)} UTC
        </time>
        <span className="text-[0.78rem] text-body">· {run.trigger}</span>
      </div>

      <p className="mt-2">{statusSentence(run)}</p>

      <dl className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-[0.76rem] text-body">
        <span>
          <dt className="inline font-semibold">Coverage:</dt>{' '}
          <dd className="inline">{formatCoverage({
            attempted: run.attempted,
            observed: run.observed,
            live: 0,
            simulated: 0,
            failed: run.failed,
            unavailable: run.unavailable,
            coverage: run.coverage,
            complete: run.coverage === 1,
          })}</dd>
        </span>
        <span>
          <dt className="inline font-semibold">Samples per pair:</dt>{' '}
          <dd className="inline">{run.samplesPerPair}</dd>
        </span>
        <span>
          <dt className="inline font-semibold">Prompt set:</dt>{' '}
          <dd className="inline"><code>{run.promptSetVersion.slice(0, 8) || 'n/a'}</code></dd>
        </span>
        <span>
          <dt className="inline font-semibold">Methodology:</dt>{' '}
          <dd className="inline"><code>{run.methodologyVersion}</code></dd>
        </span>
        <span>
          <dt className="inline font-semibold">Locale requested:</dt>{' '}
          <dd className="inline">{run.localeTag}/{run.regionCode}</dd>
        </span>
      </dl>

      {(run.status === 'failed' || run.status === 'partial') && (
        <p className="mt-2">
          <Link href="/app/settings" className="font-semibold text-brand hover:underline">
            Check engine configuration
          </Link>
        </p>
      )}
    </div>
  );
}

/**
 * A rate with its interval, or an explicit insufficient-evidence state.
 *
 * Below the documented minimum this shows the observation count and the words
 * "insufficient evidence" rather than a percentage. A rate from one or two
 * samples is noise wearing the costume of a measurement.
 */
export function RateTile({
  label, result, sub,
}: { label: string; result: RateResult; sub?: string }) {
  return (
    <div className="rounded-xl bg-white p-5 ring-1 ring-line">
      <p className="text-[0.72rem] font-bold uppercase tracking-[0.1em] text-body/70">{label}</p>

      {result.insufficientEvidence ? (
        <>
          <p className="mt-2 font-heading text-[1.35rem] font-extrabold leading-none text-body/60">
            Insufficient evidence
          </p>
          <p className="mt-2 text-[0.78rem] leading-relaxed text-body">
            {result.n} observed {result.n === 1 ? 'answer' : 'answers'}. A rate is not shown below
            the documented minimum, because it would be noise rather than a measurement.
          </p>
        </>
      ) : (
        <>
          <p className="mt-2 font-heading text-[1.85rem] font-extrabold leading-none text-ink">
            {formatRate(result.rate)}
          </p>
          <p className="mt-1.5 text-[0.78rem] text-body">
            95% interval {formatInterval(result.interval)}
          </p>
          <p className="mt-1 text-[0.72rem] leading-snug text-body/70">
            {result.successes} of {result.n} observed. Interval assumes independent samples, so
            treat it as a lower bound on uncertainty.
          </p>
        </>
      )}

      {sub && <p className="mt-2 text-[0.72rem] text-body/70">{sub}</p>}
    </div>
  );
}

/** Empirical spread across comparable runs, or nothing when there are too few. */
export function VariationNote({
  variation,
}: {
  variation: { runs: number; min: number; max: number; standardDeviation: number; insufficientRuns: boolean } | null;
}) {
  if (!variation || variation.insufficientRuns) {
    return (
      <p className="text-[0.8rem] leading-relaxed text-body">
        Run-to-run variation needs at least two completed runs on the same prompt set. With one run
        there is no way to tell a real change from normal answer-engine variance.
      </p>
    );
  }

  return (
    <p className="text-[0.8rem] leading-relaxed text-body">
      Across {variation.runs} runs on the same prompt set, inclusion ranged from{' '}
      <strong className="font-semibold text-ink">{Math.round(variation.min * 100)}%</strong> to{' '}
      <strong className="font-semibold text-ink">{Math.round(variation.max * 100)}%</strong>{' '}
      (standard deviation {Math.round(variation.standardDeviation * 100)} points). This is measured
      spread between runs, not a modelled interval — a change smaller than this range is not
      distinguishable from normal variance.
    </p>
  );
}

/** Legacy pre-Gate-1 rows, reported but never counted. */
export function LegacyNote({ legacy }: { legacy: { rows: number; earliest: Date | null; latest: Date | null } }) {
  if (!legacy.rows) return null;

  return (
    <div className="rounded-xl bg-surface-alt p-4 text-[0.82rem] leading-relaxed text-body ring-1 ring-line">
      <strong className="font-semibold text-ink">{legacy.rows} legacy checks are excluded.</strong>{' '}
      Rows recorded before this project moved to run-based measurement have no run id, no sample
      index and no token accounting, so they cannot be reconstructed into observations without
      inventing those fields. They are kept for reference and excluded from every rate, interval and
      trend above rather than relabelled as measurements.
    </div>
  );
}
