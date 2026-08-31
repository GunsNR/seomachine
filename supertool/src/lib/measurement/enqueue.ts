// Deliberately NOT `server-only`: shared by route handlers and by the cron
// sweep, and imports only the Prisma client and the queue.
import { MEASUREMENT_RUN_KIND } from '../jobs/handlers';
import { enqueue, findActiveJob, idempotencyKeyFor } from '../jobs/queue';
import { db } from '../db';
import { createRun, type PromptInput, type RunTrigger, type StartRunInput } from './run';

/**
 * Turning a request to measure into queued work.
 *
 * The producer's job is narrower than it looks, and getting the boundary wrong
 * is what makes queued systems bill twice. It does three things:
 *
 *   1. Decides an idempotency key, so two deliveries of the same intent are one
 *      unit of work.
 *   2. Writes the `MeasurementRun` row, so the customer sees a `queued` run the
 *      moment they click and a job that is never picked up still leaves
 *      evidence they asked.
 *   3. Enqueues a job carrying that run's id and nothing privileged.
 *
 * It does not decide entitlement, ownership or engine selection for the run
 * itself — the handler re-derives all of that at execution time, because
 * minutes can pass and a session is not proof of anything by then.
 */

/** How wide a window collapses repeated manual clicks into one run. */
export const MANUAL_DEDUPE_WINDOW_MS = 60_000;

export interface EnqueueRunInput {
  orgId: string;
  projectId: string;
  projectName: string;
  projectDomain: string;
  prompts: readonly PromptInput[];
  dataMode: StartRunInput['dataMode'];
  trigger: RunTrigger;
  samplesPerPair?: number;
  /**
   * Bucket that two requests must share to be considered the same intent.
   *
   * Manual runs pass a coarse clock bucket: a double-click is one run, a
   * deliberate re-run a minute later is a new one. Scheduled runs pass the start
   * of the period they are due for, so a cron retry — or two overlapping cron
   * deliveries — cannot produce a second run for the same period.
   */
  dedupeBucket: string;
  priority?: number;
}

export interface EnqueuedRun {
  jobId: string;
  runId: string;
  /** True when this request joined work that was already queued or running. */
  deduped: boolean;
}

/**
 * Create the run row and enqueue the job, or join the work already in flight.
 *
 * Two layers of deduplication, because they catch different things. The active
 * job lookup answers "is a run already happening for this project?", which is
 * what a user clicking twice thirty seconds apart actually means. The
 * idempotency key closes the millisecond window that lookup cannot, using the
 * database's uniqueness constraint rather than a read.
 */
export async function enqueueMeasurementRun(input: EnqueueRunInput): Promise<EnqueuedRun> {
  const samples = Math.max(1, input.samplesPerPair ?? 1);

  const active = await findActiveJob(MEASUREMENT_RUN_KIND, input.orgId, input.projectId);
  if (active && typeof active.payload.runId === 'string') {
    return { jobId: active.id, runId: active.payload.runId, deduped: true };
  }

  const key = idempotencyKeyFor(
    MEASUREMENT_RUN_KIND,
    input.orgId,
    input.projectId,
    input.trigger,
    String(samples),
    input.dedupeBucket,
  );

  // Checked before the run row is written so the ordinary duplicate costs
  // nothing. The race below handles the rest.
  const existing = await db.job.findUnique({
    where: { idempotencyKey: key },
    select: { id: true, payload: true },
  });
  if (existing) {
    const runId = readRunId(existing.payload);
    if (runId) return { jobId: existing.id, runId, deduped: true };
  }

  const runInput: StartRunInput = {
    orgId: input.orgId,
    projectId: input.projectId,
    projectName: input.projectName,
    projectDomain: input.projectDomain,
    prompts: input.prompts,
    competitors: [],
    dataMode: input.dataMode,
    trigger: input.trigger,
    samplesPerPair: samples,
  };

  const runId = await createRun(runInput);

  const job = await enqueue({
    kind: MEASUREMENT_RUN_KIND,
    orgId: input.orgId,
    projectId: input.projectId,
    priority: input.priority ?? (input.trigger === 'manual' ? 50 : 100),
    idempotencyKey: key,
    payload: {
      runId,
      projectId: input.projectId,
      samplesPerPair: samples,
      trigger: input.trigger,
    } satisfies Record<string, unknown>,
  });

  if (job.deduped) {
    // Lost the race by microseconds: another request created the job under the
    // same key while this one was writing its run row. That row has no
    // observations and no job pointing at it, so it is removed rather than left
    // as a permanently `queued` run the customer would watch forever. The
    // delete is guarded on emptiness so it can never take a real run with it.
    const winnerRunId = await runIdForJob(job.id);
    if (winnerRunId && winnerRunId !== runId) {
      await db.measurementRun
        .deleteMany({ where: { id: runId, status: 'queued', observations: { none: {} } } })
        .catch(() => undefined);
      return { jobId: job.id, runId: winnerRunId, deduped: true };
    }
  }

  return { jobId: job.id, runId, deduped: job.deduped };
}

function readRunId(raw: string): string | null {
  try {
    const parsed = JSON.parse(raw) as { runId?: unknown };
    return typeof parsed.runId === 'string' && parsed.runId ? parsed.runId : null;
  } catch {
    return null;
  }
}

async function runIdForJob(jobId: string): Promise<string | null> {
  const job = await db.job.findUnique({ where: { id: jobId }, select: { payload: true } });
  return job ? readRunId(job.payload) : null;
}

/** The clock bucket a manual request falls into. */
export function manualDedupeBucket(now = Date.now()): string {
  return `manual:${Math.floor(now / MANUAL_DEDUPE_WINDOW_MS)}`;
}

/**
 * The start of the period a scheduled run is due for.
 *
 * Derived from the plan's interval rather than from the wall clock, so a cron
 * delivered twice — or delivered late — maps to the same bucket and therefore
 * the same job.
 */
export function scheduledDedupeBucket(intervalMs: number, now = Date.now()): string {
  return `scheduled:${intervalMs}:${Math.floor(now / intervalMs)}`;
}
