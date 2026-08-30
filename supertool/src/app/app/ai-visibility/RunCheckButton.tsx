'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Ban, CheckCircle2, Clock, Loader2, Sparkles, TriangleAlert } from 'lucide-react';

/**
 * Start a measurement run and follow it to a truthful end state.
 *
 * The button used to await the whole run inside one fetch. That made the tab
 * load-bearing: closing it did not stop the work, but it did remove the only
 * thing that would ever report the outcome. It also meant a run longer than the
 * platform's request ceiling ended as a network error, which reads to a
 * customer as "it broke" rather than "it is still going".
 *
 * The run is now queued, and this polls for its state. Three rules keep that
 * honest:
 *
 *   - Every state the backend can be in is rendered as itself. There is no
 *     single "loading" spinner standing in for queued, running and retrying,
 *     because a run waiting for a worker and a run halfway through calling six
 *     engines are different facts about the customer's money.
 *   - Polling stops when the server says it is terminal, never on a guess here.
 *   - Nothing is claimed to have finished until the run row says so.
 */

interface Snapshot {
  jobId: string | null;
  runId: string | null;
  terminal: boolean;
  job: {
    status: string;
    attempts: number;
    maxAttempts: number;
    cancelRequested: boolean;
    error: string;
    errorCategory: string;
    nextAttemptAt: string | null;
  } | null;
  run: {
    status: string;
    interrupted: boolean;
    expected: number;
    attempted: number;
    observed: number;
    coverage: number;
    error: string;
  } | null;
}

/** Start gentle, ease off. A queued run is usually picked up within seconds. */
const POLL_MIN_MS = 2_000;
const POLL_MAX_MS = 10_000;
/** After this, stop polling and tell the reader to come back, rather than spinning forever. */
const POLL_CEILING_MS = 20 * 60_000;

export function RunCheckButton({ projectId }: { projectId: string }) {
  const router = useRouter();
  const [jobId, setJobId] = useState<string | null>(null);
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [starting, setStarting] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [gaveUpWaiting, setGaveUpWaiting] = useState(false);
  const [error, setError] = useState('');

  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  /**
   * The job this component is currently following.
   *
   * A poll loop is an async recursion, so it cannot be stopped by clearing a
   * timer alone — a tick already in flight will schedule the next one after the
   * clear. Every tick therefore re-checks that it is still the loop anyone
   * wants, which is what stops an unmount, or a second click, leaving two loops
   * writing to the same state.
   */
  const following = useRef<string | null>(null);

  useEffect(() => {
    return () => {
      following.current = null;
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  const poll = useCallback(
    async (id: string) => {
      const startedAt = Date.now();
      let delay = POLL_MIN_MS;
      following.current = id;

      const tick = async () => {
        if (following.current !== id) return;

        try {
          const res = await fetch(`/api/app/run-check?jobId=${encodeURIComponent(id)}`, {
            cache: 'no-store',
          });
          const data = (await res.json()) as Snapshot & { error?: string };
          if (!res.ok) throw new Error(data.error ?? 'The run status could not be read.');

          setSnapshot(data);

          if (data.terminal) {
            // Only now is there something new for the server components to show.
            following.current = null;
            router.refresh();
            return;
          }
        } catch (err) {
          // A failed poll is not a failed run. Say so, keep polling.
          setError(err instanceof Error ? err.message : 'The run status could not be read.');
        }

        if (Date.now() - startedAt > POLL_CEILING_MS) {
          following.current = null;
          setGaveUpWaiting(true);
          return;
        }

        if (following.current !== id) return;
        delay = Math.min(POLL_MAX_MS, Math.round(delay * 1.5));
        timer.current = setTimeout(tick, delay);
      };

      await tick();
    },
    [router],
  );

  async function start() {
    setStarting(true);
    setError('');
    setGaveUpWaiting(false);
    setSnapshot(null);

    try {
      const res = await fetch('/api/app/run-check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'The run could not be queued.');

      setJobId(json.jobId);
      // A deduped response means this click joined a run already in flight.
      // Nothing else in the UI needs to distinguish the two: the state that
      // follows is identical, and it is the same run either way.
      void poll(json.jobId);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'The run could not be queued.');
    } finally {
      setStarting(false);
    }
  }

  async function cancel() {
    if (!jobId) return;
    setCancelling(true);
    try {
      const res = await fetch(`/api/app/run-check?jobId=${encodeURIComponent(jobId)}`, {
        method: 'DELETE',
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'The run could not be cancelled.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'The run could not be cancelled.');
    } finally {
      setCancelling(false);
    }
  }

  const phase = describe(snapshot, starting, gaveUpWaiting);
  const busy = starting || (Boolean(jobId) && !snapshot?.terminal && !gaveUpWaiting);

  return (
    <div className="flex flex-col items-end gap-1.5">
      <div className="flex items-center gap-2">
        {busy && jobId && (
          <button
            type="button"
            onClick={cancel}
            disabled={cancelling || Boolean(snapshot?.job?.cancelRequested)}
            className="btn btn-sm"
          >
            <Ban className="h-4 w-4" aria-hidden="true" />
            {snapshot?.job?.cancelRequested ? 'Stopping…' : 'Cancel'}
          </button>
        )}

        <button type="button" onClick={start} disabled={busy} className="btn btn-sm btn-primary">
          {busy ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              {phase.button}
            </>
          ) : (
            <>
              <Sparkles className="h-4 w-4" aria-hidden="true" />
              Run check now
            </>
          )}
        </button>
      </div>

      {phase.note && (
        <p
          className={`flex items-center gap-1.5 text-[0.75rem] ${phase.tone}`}
          // Polite: this updates repeatedly while the run progresses, and an
          // assertive region would interrupt a screen reader every few seconds.
          aria-live="polite"
        >
          {phase.icon}
          {phase.note}
        </p>
      )}

      {error && (
        <p role="alert" className="text-[0.75rem] text-bad">
          {error}
        </p>
      )}
    </div>
  );
}

interface Phase {
  button: string;
  note: string;
  tone: string;
  icon: React.ReactNode;
}

/**
 * Turn a snapshot into what the reader is told.
 *
 * Every branch here corresponds to a state the backend can genuinely be in.
 * None of them summarise two different states into one reassuring sentence.
 */
function describe(snapshot: Snapshot | null, starting: boolean, gaveUpWaiting: boolean): Phase {
  const spinner = <Clock className="h-3.5 w-3.5" aria-hidden="true" />;

  if (starting) {
    return { button: 'Queueing…', note: '', tone: 'text-body', icon: null };
  }

  if (gaveUpWaiting) {
    return {
      button: 'Run check now',
      note: 'Still running. This page will show the result once it finishes — you do not need to wait here.',
      tone: 'text-body',
      icon: spinner,
    };
  }

  if (!snapshot) return { button: 'Queueing…', note: '', tone: 'text-body', icon: null };

  const job = snapshot.job;
  const run = snapshot.run;

  // A retry is a distinct, visible state. Hiding it behind "running" means a run
  // that failed twice looks identical to one that has not started.
  if (job?.status === 'queued' && job.attempts > 0) {
    return {
      button: 'Retrying…',
      note: `Attempt ${job.attempts} of ${job.maxAttempts} did not complete. Waiting to try again.`,
      tone: 'text-warn',
      icon: <TriangleAlert className="h-3.5 w-3.5" aria-hidden="true" />,
    };
  }

  if (job?.status === 'queued') {
    return {
      button: 'Queued…',
      note: 'Queued. It will start as soon as a worker is free.',
      tone: 'text-body',
      icon: spinner,
    };
  }

  if (job?.status === 'running' || run?.status === 'running') {
    const progress =
      run && run.expected > 0
        ? ` ${run.attempted} of ${run.expected} checks done.`
        : '';
    return {
      button: 'Running…',
      note: `Running across all engines.${progress}`,
      tone: 'text-body',
      icon: spinner,
    };
  }

  if (job?.status === 'cancelled' || run?.status === 'cancelled') {
    return {
      button: 'Run check now',
      note: 'Cancelled. Whatever was measured before it stopped has been kept.',
      tone: 'text-body',
      icon: <Ban className="h-3.5 w-3.5" aria-hidden="true" />,
    };
  }

  if (job?.status === 'dead') {
    return {
      button: 'Run check now',
      // `job.error` is redacted at write time and is a sentence, not a trace.
      note: job.error || 'The run stopped after repeated failures and will not be retried.',
      tone: 'text-bad',
      icon: <TriangleAlert className="h-3.5 w-3.5" aria-hidden="true" />,
    };
  }

  if (run?.status === 'failed') {
    return {
      button: 'Run check now',
      note: 'The run finished without observing anything. See the run details below.',
      tone: 'text-bad',
      icon: <TriangleAlert className="h-3.5 w-3.5" aria-hidden="true" />,
    };
  }

  if (run?.status === 'partial') {
    return {
      button: 'Run check now',
      note: `Finished with partial coverage — ${run.observed} of ${run.attempted} checks returned an answer.`,
      tone: 'text-warn',
      icon: <TriangleAlert className="h-3.5 w-3.5" aria-hidden="true" />,
    };
  }

  if (run?.status === 'completed') {
    return {
      button: 'Run check now',
      note: `Finished. All ${run.attempted} checks returned an answer.`,
      tone: 'text-ok',
      icon: <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />,
    };
  }

  return { button: 'Working…', note: '', tone: 'text-body', icon: null };
}
