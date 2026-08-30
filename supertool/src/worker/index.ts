/**
 * The worker process.
 *
 * A plain Node loop, not a serverless function and not a request handler. That
 * is the point of the whole change: a measurement run is minutes of provider
 * latency, and a request that holds a connection open for minutes is a request
 * that a load balancer, a platform timeout or a deploy will eventually kill
 * halfway through — silently, from the customer's side.
 *
 * The loop is deliberately boring:
 *
 *   claim → run → record outcome → repeat, backing off when idle
 *
 * Everything interesting is in the failure paths, and each one has a rule:
 *
 *   - **A lost lease is not a failure to record.** Every transition is scoped to
 *     `lockedBy`, so a worker whose lease was taken over writes nothing. It
 *     cannot corrupt the job that is now someone else's.
 *   - **Shutdown is not a failure either.** SIGTERM stops new claims and lets
 *     the in-flight job reach its next checkpoint, then hands it back to the
 *     queue. Work is never abandoned without a row saying so.
 *   - **An unknown kind is permanent.** It will be exactly as unknown next time.
 *
 * Run it with `npm run worker`. It is safe to run several: claiming is atomic.
 */
import { randomBytes } from 'node:crypto';
import {
  getHandler,
  JOB_KINDS,
  type JobContext,
  type JobHandler,
  type JobOutcome,
} from '../lib/jobs/handlers';
import { withLock } from '../lib/jobs/lock';
import {
  claimNext,
  isCancellationRequested,
  markCancelled,
  markFailed,
  markSucceeded,
  reapExpiredLeases,
  redact,
  releaseForShutdown,
  renewLease,
  type JobErrorCategory,
} from '../lib/jobs/queue';
import { db } from '../lib/db';
import { log } from '../lib/observability';

/** Poll delay when a claim found nothing, and the ceiling it backs off to. */
const IDLE_MIN_MS = Number(process.env.WORKER_IDLE_MIN_MS ?? 1_000);
const IDLE_MAX_MS = Number(process.env.WORKER_IDLE_MAX_MS ?? 15_000);

/** How often to sweep for leases that lapsed without their worker returning. */
const REAP_INTERVAL_MS = Number(process.env.WORKER_REAP_INTERVAL_MS ?? 60_000);

/** How long the reaper may hold its lock. Longer than the sweep, shorter than a lease. */
const REAP_LOCK_MS = 30_000;

/** How long shutdown waits for the in-flight job to reach a checkpoint. */
const SHUTDOWN_GRACE_MS = Number(process.env.WORKER_SHUTDOWN_GRACE_MS ?? 30_000);

export interface WorkerOptions {
  workerId?: string;
  kinds?: readonly string[];
  idleMinMs?: number;
  idleMaxMs?: number;
  reapIntervalMs?: number;
  /** Stop after this many loop iterations. Tests use it; production does not. */
  maxIterations?: number;
  /** Stop once the queue has nothing left to claim. Tests use it. */
  exitWhenDrained?: boolean;
  /**
   * How a kind is resolved to a handler.
   *
   * Defaults to the allowlisted registry, and production never passes anything
   * else — the parameter exists so a test can drive the loop's failure branches
   * (retryable, permanent, thrown, preempted) with a handler that fails on
   * demand, which no real handler will do reliably. Overriding it does not
   * widen what a deployed worker will execute, because a deployed worker never
   * constructs these options.
   */
  resolveHandler?: (kind: string) => JobHandler | null;
}

export interface WorkerHandle {
  workerId: string;
  /** Resolves when the loop has stopped and any in-flight job is settled. */
  done: Promise<WorkerStats>;
  /** Ask the loop to stop. Idempotent. */
  stop: () => void;
  /** True once shutdown has been requested. */
  isShuttingDown: () => boolean;
}

export interface WorkerStats {
  claimed: number;
  succeeded: number;
  failed: number;
  cancelled: number;
  suspended: number;
}

function newWorkerId(): string {
  return `${process.env.HOSTNAME ?? 'worker'}-${process.pid}-${randomBytes(4).toString('hex')}`;
}

/**
 * An idle wait that a shutdown can cut short.
 *
 * A plain `setTimeout` would make SIGTERM wait out the current backoff — up to
 * the idle ceiling — before the loop even looks at the flag. That turns a
 * routine deploy into seconds of doing nothing while the platform counts down
 * to SIGKILL, which is exactly when work gets abandoned.
 */
function interruptibleSleep(ms: number): { wait: Promise<void>; wake: () => void } {
  let wake = () => {};
  const wait = new Promise<void>((resolve) => {
    const timer = setTimeout(resolve, ms);
    wake = () => {
      clearTimeout(timer);
      resolve();
    };
  });
  return { wait, wake };
}

/**
 * Classify a thrown error into a retry decision.
 *
 * Errors that reach here escaped a handler rather than being returned by it, so
 * the classification is necessarily coarse. It is deliberately conservative:
 * anything not recognisably permanent is treated as worth another attempt,
 * because the cost of one wasted retry is a slot, and the cost of wrongly giving
 * up is a customer's run that never happens.
 */
export function classifyThrown(err: unknown): JobErrorCategory {
  const message = (err instanceof Error ? err.message : String(err ?? '')).toLowerCase();

  if (/\b(not found|invalid|unsupported|malformed|no prompts|forbidden|not entitled)\b/.test(message)) {
    return 'permanent';
  }
  if (/\b(rate limit|rate_limit|too many requests|429)\b/.test(message)) return 'rate_limited';
  if (/\b(timeout|timed out|econnreset|econnrefused|enotfound|socket hang up|network)\b/.test(message)) {
    return 'transient';
  }
  return 'unknown';
}

/**
 * Start the loop.
 *
 * Returns a handle rather than blocking, so a test can drive it and the process
 * entry point can wire signals to it. The two callers want the same loop and
 * different lifetimes.
 */
export function startWorker(options: WorkerOptions = {}): WorkerHandle {
  const workerId = options.workerId ?? newWorkerId();
  const kinds = options.kinds ?? JOB_KINDS;
  const idleMin = options.idleMinMs ?? IDLE_MIN_MS;
  const idleMax = options.idleMaxMs ?? IDLE_MAX_MS;
  const reapInterval = options.reapIntervalMs ?? REAP_INTERVAL_MS;
  const resolveHandler = options.resolveHandler ?? getHandler;

  let shuttingDown = false;
  /** Set while the loop is idling, so `stop()` can end the wait immediately. */
  let wakeFromIdle: (() => void) | null = null;
  const stats: WorkerStats = { claimed: 0, succeeded: 0, failed: 0, cancelled: 0, suspended: 0 };

  const done = (async (): Promise<WorkerStats> => {
    let idle = idleMin;
    let lastReapAt = 0;
    let iterations = 0;

    log.info('worker.started', { workerId, kinds: [...kinds] });

    while (!shuttingDown) {
      if (options.maxIterations !== undefined && iterations >= options.maxIterations) break;
      iterations++;

      // The reaper runs under a named lock so N workers do not all sweep. It is
      // strictly a visibility measure: `claimNext` already treats a lapsed lease
      // as claimable, but a job silently re-run is a job nobody can account for
      // afterwards. The sweep leaves a row saying the lease was lost.
      if (Date.now() - lastReapAt >= reapInterval) {
        lastReapAt = Date.now();
        await withLock('worker:reaper', workerId, REAP_LOCK_MS, async () => {
          const reaped = await reapExpiredLeases();
          if (reaped > 0) log.warn('worker.leases.reaped', { workerId, count: reaped });
        }).catch((err) => log.error('worker.reaper.failed', { workerId, error: redact(err) }));
      }

      // Re-checked after the reaper, which awaits: a signal that arrived during
      // it must not be answered by claiming one more job.
      if (shuttingDown) break;

      let claimed;
      try {
        claimed = await claimNext(workerId, kinds);
      } catch (err) {
        // A database blip must not kill the process. Back off and try again.
        log.error('worker.claim.failed', { workerId, error: redact(err) });
        await idleFor(idleMax);
        continue;
      }

      if (!claimed) {
        if (options.exitWhenDrained) break;
        await idleFor(idle);
        idle = Math.min(idleMax, idle * 2);
        continue;
      }

      idle = idleMin; // Work exists; poll eagerly again once this one is done.
      stats.claimed++;

      await runOne(claimed, workerId, () => shuttingDown, stats, resolveHandler);
    }

    log.info('worker.stopped', { workerId, ...stats });
    return stats;

    async function idleFor(ms: number): Promise<void> {
      const { wait, wake } = interruptibleSleep(ms);
      wakeFromIdle = wake;
      try {
        await wait;
      } finally {
        wakeFromIdle = null;
      }
    }
  })();

  return {
    workerId,
    done,
    stop: () => {
      shuttingDown = true;
      wakeFromIdle?.();
    },
    isShuttingDown: () => shuttingDown,
  };
}

async function runOne(
  claimed: Awaited<ReturnType<typeof claimNext>> & object,
  workerId: string,
  isShuttingDown: () => boolean,
  stats: WorkerStats,
  resolveHandler: (kind: string) => JobHandler | null,
): Promise<void> {
  const handler = resolveHandler(claimed.kind);

  if (!handler) {
    // Not an allowlisted kind. This is a deployment or data problem, and it
    // will be identical on every retry, so it goes straight to `dead` where an
    // operator can see it rather than cycling through five attempts first.
    log.error('worker.kind.unknown', { workerId, jobId: claimed.id, kind: claimed.kind });
    await markFailed(
      claimed.id,
      workerId,
      new Error(`No handler is registered for job kind "${claimed.kind}".`),
      'permanent',
    );
    stats.failed++;
    return;
  }

  const ctx: JobContext = {
    jobId: claimed.id,
    orgId: claimed.orgId,
    projectId: claimed.projectId,
    payload: claimed.payload,
    attempts: claimed.attempts,
    maxAttempts: claimed.maxAttempts,
    renewLease: () => renewLease(claimed.id, workerId),
    isCancelled: () => isCancellationRequested(claimed.id),
    isShuttingDown,
  };

  const startedAt = Date.now();
  let outcome: JobOutcome;

  try {
    outcome = await handler.run(ctx);
  } catch (err) {
    const category = classifyThrown(err);
    const fate = await markFailed(claimed.id, workerId, err, category);
    if (fate === 'dead') await notifyGaveUp(handler, ctx, err, workerId);
    stats.failed++;
    log.error('worker.job.threw', {
      workerId,
      jobId: claimed.id,
      kind: claimed.kind,
      orgId: claimed.orgId,
      category,
      fate,
      durationMs: Date.now() - startedAt,
      error: redact(err),
    });
    return;
  }

  switch (outcome.status) {
    case 'succeeded':
      await markSucceeded(claimed.id, workerId);
      stats.succeeded++;
      log.info('worker.job.succeeded', {
        workerId, jobId: claimed.id, kind: claimed.kind, orgId: claimed.orgId,
        durationMs: Date.now() - startedAt, detail: outcome.detail,
      });
      return;

    case 'cancelled':
      await markCancelled(claimed.id, workerId);
      stats.cancelled++;
      log.info('worker.job.cancelled', {
        workerId, jobId: claimed.id, kind: claimed.kind, orgId: claimed.orgId, detail: outcome.detail,
      });
      return;

    case 'suspended':
      // Preempted rather than failed. Back to the queue with no failure
      // recorded, so the next worker resumes exactly where this one stopped.
      await releaseForShutdown(claimed.id, workerId);
      stats.suspended++;
      log.warn('worker.job.suspended', {
        workerId, jobId: claimed.id, kind: claimed.kind, orgId: claimed.orgId, detail: outcome.detail,
      });
      return;

    case 'failed': {
      const fate = await markFailed(claimed.id, workerId, outcome.error, outcome.category);
      if (fate === 'dead') await notifyGaveUp(handler, ctx, outcome.error, workerId);
      stats.failed++;
      log.error('worker.job.failed', {
        workerId, jobId: claimed.id, kind: claimed.kind, orgId: claimed.orgId,
        category: outcome.category, fate, durationMs: Date.now() - startedAt,
        error: redact(outcome.error),
      });
      return;
    }
  }
}

/**
 * Tell a handler the queue has stopped retrying, so it can close out whatever
 * it owns.
 *
 * Deliberately swallowing: the job row is already terminal by this point, and a
 * throw here must not be mistaken for the job still being live.
 */
async function notifyGaveUp(
  handler: { kind: string; onGaveUp?: (ctx: JobContext, error: unknown) => Promise<void> },
  ctx: JobContext,
  error: unknown,
  workerId: string,
): Promise<void> {
  if (!handler.onGaveUp) return;
  try {
    await handler.onGaveUp(ctx, error);
  } catch (err) {
    log.error('worker.gaveup.hook.failed', {
      workerId, jobId: ctx.jobId, kind: handler.kind, error: redact(err),
    });
  }
}

/**
 * Process entry point.
 *
 * Separated from `startWorker` so importing this module in a test does not
 * start a loop or install signal handlers.
 */
export async function main(): Promise<void> {
  const worker = startWorker();

  let stopping = false;
  const shutdown = (signal: string) => {
    if (stopping) {
      // A second signal means someone wants it gone now. Honour that, but say
      // so — an operator should never wonder whether work was dropped.
      log.warn('worker.shutdown.forced', { signal, workerId: worker.workerId });
      process.exit(1);
    }
    stopping = true;
    log.info('worker.shutdown.requested', { signal, workerId: worker.workerId });
    worker.stop();

    setTimeout(() => {
      log.error('worker.shutdown.timeout', {
        workerId: worker.workerId,
        graceMs: SHUTDOWN_GRACE_MS,
      });
      process.exit(1);
    }, SHUTDOWN_GRACE_MS).unref();
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  await worker.done;
  await db.$disconnect();
}

// Only run when executed directly, never when imported.
if (process.argv[1] && /worker[/\\]index\.(ts|js)$/.test(process.argv[1])) {
  main().catch((err) => {
    log.error('worker.fatal', { error: redact(err) });
    process.exit(1);
  });
}
