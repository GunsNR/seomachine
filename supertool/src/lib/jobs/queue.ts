// Deliberately NOT `server-only`: the worker entry point runs as a plain Node
// process, not inside a request. It imports the Prisma client, which cannot
// execute in a browser regardless.
import { createHash } from 'node:crypto';
import { db } from '../db';

/**
 * Durable job queue.
 *
 * Phase 1 ran measurement in-process. That was honest about its limits — a
 * crash left a `partial` run rather than a lie — but it still lost work, and
 * nothing retried. Phase 2 makes the work itself durable.
 *
 * Three properties matter, and all three are about failure:
 *
 *   1. **Claiming is atomic.** A worker does not read a row and then write it;
 *      it conditionally updates on the row still being unclaimed, and only
 *      proceeds if that update matched. Two workers polling the same instant
 *      cannot both win.
 *
 *   2. **Leases expire.** A worker that dies holding a job does not strand it.
 *      The lease lapses and the job becomes claimable again. This is why the
 *      lock is a timestamp rather than a boolean — a boolean cannot expire.
 *
 *   3. **Retry is bounded and classified.** A permanent failure (bad input,
 *      revoked credential) is not retried five times; it goes straight to
 *      `dead`. Only failures that could plausibly succeed later back off and
 *      retry.
 *
 * No external queue infrastructure. This is one table and a poll loop, which
 * is the correct amount of machinery for the current load and adds no operational
 * dependency. If throughput ever justifies Redis or SQS, the interface here is
 * what gets reimplemented.
 */

export type JobStatus = 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled' | 'dead';

/**
 * Why a job failed, which decides whether it is retried.
 *
 * The distinction is the whole point: retrying a permanently-broken job five
 * times wastes five slots and delays everything behind it, while not retrying a
 * transient network blip throws away work that would have succeeded.
 */
export type JobErrorCategory =
  | 'transient'
  | 'rate_limited'
  | 'permanent'
  | 'cancelled'
  | 'lease_lost'
  | 'unknown';

/** Categories worth another attempt. Everything else is terminal. */
const RETRYABLE: ReadonlySet<JobErrorCategory> = new Set(['transient', 'rate_limited', 'unknown']);

export function isRetryable(category: JobErrorCategory): boolean {
  return RETRYABLE.has(category);
}

/** How long a worker may hold a job before the lease is considered lapsed. */
export const LEASE_MS = 5 * 60_000;

/** Base backoff. Doubles per attempt, capped, with jitter applied on top. */
const BACKOFF_BASE_MS = 10_000;
const BACKOFF_CAP_MS = 15 * 60_000;

/**
 * Delay before attempt `n` (1-based).
 *
 * Exponential with full jitter. The jitter is not decoration: without it, a
 * provider outage that fails fifty jobs at once produces fifty retries at the
 * same instant, and the retry storm is what keeps the provider down.
 */
export function backoffMs(attempt: number, random = Math.random): number {
  const exponential = Math.min(BACKOFF_CAP_MS, BACKOFF_BASE_MS * 2 ** Math.max(0, attempt - 1));
  return Math.floor(random() * exponential);
}

export interface EnqueueInput {
  kind: string;
  orgId: string;
  projectId?: string;
  payload?: Record<string, unknown>;
  /** Lower runs first. */
  priority?: number;
  maxAttempts?: number;
  /** Do not run before this instant. */
  runAfter?: Date;
  /**
   * Dedupe key. Enqueueing twice with the same key returns the first job
   * rather than creating a second — the difference between a user
   * double-clicking "run" and paying for two runs.
   */
  idempotencyKey?: string;
}

/** Stable idempotency key from any set of parts. */
export function idempotencyKeyFor(...parts: string[]): string {
  return createHash('sha256').update(parts.join('|')).digest('hex').slice(0, 32);
}

/**
 * Enqueue a job, or return the existing one with the same idempotency key.
 *
 * The uniqueness constraint is what makes this safe under concurrency: two
 * simultaneous enqueues race, one loses on the constraint, and the loser reads
 * back the winner's row rather than failing.
 */
export async function enqueue(input: EnqueueInput): Promise<{ id: string; deduped: boolean }> {
  const data = {
    kind: input.kind,
    orgId: input.orgId,
    projectId: input.projectId ?? '',
    payload: JSON.stringify(input.payload ?? {}),
    priority: input.priority ?? 100,
    maxAttempts: input.maxAttempts ?? 5,
    runAfter: input.runAfter ?? new Date(),
    idempotencyKey: input.idempotencyKey ?? null,
  };

  if (!data.idempotencyKey) {
    const created = await db.job.create({ data, select: { id: true } });
    return { id: created.id, deduped: false };
  }

  const existing = await db.job.findUnique({
    where: { idempotencyKey: data.idempotencyKey },
    select: { id: true },
  });
  if (existing) return { id: existing.id, deduped: true };

  try {
    const created = await db.job.create({ data, select: { id: true } });
    return { id: created.id, deduped: false };
  } catch {
    // Lost the race. The winner's row is the answer.
    const winner = await db.job.findUnique({
      where: { idempotencyKey: data.idempotencyKey },
      select: { id: true },
    });
    if (winner) return { id: winner.id, deduped: true };
    throw new Error('Failed to enqueue job and no duplicate was found.');
  }
}

export interface ClaimedJob {
  id: string;
  kind: string;
  orgId: string;
  projectId: string;
  payload: Record<string, unknown>;
  attempts: number;
  maxAttempts: number;
  leaseExpiresAt: Date;
}

/**
 * Claim one runnable job for `workerId`.
 *
 * Runnable means: queued (or running with a lapsed lease), due, not cancelled.
 * The claim is an `updateMany` filtered on the row still being unclaimed —
 * Prisma reports how many rows it changed, and a count of zero means another
 * worker got there first, so we move on rather than running someone else's job.
 */
export async function claimNext(workerId: string, kinds?: readonly string[]): Promise<ClaimedJob | null> {
  const now = new Date();

  for (let attempt = 0; attempt < 5; attempt++) {
    const candidate = await db.job.findFirst({
      where: {
        ...(kinds?.length ? { kind: { in: [...kinds] } } : {}),
        runAfter: { lte: now },
        cancelRequestedAt: null,
        OR: [
          { status: 'queued' },
          // A running job whose worker stopped renewing. Recovery path.
          { status: 'running', leaseExpiresAt: { lt: now } },
        ],
      },
      orderBy: [{ priority: 'asc' }, { runAfter: 'asc' }, { createdAt: 'asc' }],
      select: { id: true, status: true, leaseExpiresAt: true },
    });

    if (!candidate) return null;

    const leaseExpiresAt = new Date(Date.now() + LEASE_MS);

    // Conditional claim. The where clause repeats the state we selected on, so
    // if anything changed in between, zero rows match and we retry.
    const result = await db.job.updateMany({
      where: {
        id: candidate.id,
        cancelRequestedAt: null,
        ...(candidate.status === 'queued'
          ? { status: 'queued' }
          : { status: 'running', leaseExpiresAt: { lt: now } }),
      },
      data: {
        status: 'running',
        lockedBy: workerId,
        lockedAt: new Date(),
        leaseExpiresAt,
        startedAt: new Date(),
        attempts: { increment: 1 },
      },
    });

    if (result.count === 0) continue; // Lost the race; try the next candidate.

    const job = await db.job.findUnique({ where: { id: candidate.id } });
    if (!job) continue;

    return {
      id: job.id,
      kind: job.kind,
      orgId: job.orgId,
      projectId: job.projectId,
      payload: safeParse(job.payload),
      attempts: job.attempts,
      maxAttempts: job.maxAttempts,
      leaseExpiresAt,
    };
  }

  return null;
}

function safeParse(raw: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

/**
 * Extend the lease on a job this worker still holds.
 *
 * Returns false when the lease was already lost — the worker must then stop,
 * because something else may already be running the job.
 */
export async function renewLease(jobId: string, workerId: string): Promise<boolean> {
  const result = await db.job.updateMany({
    where: { id: jobId, lockedBy: workerId, status: 'running' },
    data: { leaseExpiresAt: new Date(Date.now() + LEASE_MS) },
  });
  return result.count === 1;
}

/** True when someone asked this job to stop. Checked at each checkpoint. */
export async function isCancellationRequested(jobId: string): Promise<boolean> {
  const job = await db.job.findUnique({
    where: { id: jobId },
    select: { cancelRequestedAt: true },
  });
  return Boolean(job?.cancelRequestedAt);
}

/**
 * Request cancellation.
 *
 * A queued job is cancelled immediately. A running job is only *marked* — it
 * stops at its next checkpoint, so whatever it has already durably written
 * stays written rather than being torn up mid-transaction.
 */
export async function requestCancel(jobId: string, orgId: string): Promise<'cancelled' | 'requested' | 'not-found'> {
  const job = await db.job.findFirst({
    where: { id: jobId, orgId },
    select: { id: true, status: true },
  });
  if (!job) return 'not-found';

  if (job.status === 'queued') {
    await db.job.update({
      where: { id: job.id },
      data: { status: 'cancelled', cancelRequestedAt: new Date(), finishedAt: new Date() },
    });
    return 'cancelled';
  }

  if (job.status === 'running') {
    await db.job.update({ where: { id: job.id }, data: { cancelRequestedAt: new Date() } });
    return 'requested';
  }

  return 'not-found';
}

export async function markSucceeded(jobId: string, workerId: string): Promise<void> {
  await db.job.updateMany({
    where: { id: jobId, lockedBy: workerId },
    data: {
      status: 'succeeded',
      finishedAt: new Date(),
      lockedBy: null,
      leaseExpiresAt: null,
      lastError: '',
      errorCategory: '',
    },
  });
}

export async function markCancelled(jobId: string, workerId: string): Promise<void> {
  await db.job.updateMany({
    where: { id: jobId, lockedBy: workerId },
    data: {
      status: 'cancelled',
      finishedAt: new Date(),
      lockedBy: null,
      leaseExpiresAt: null,
      errorCategory: 'cancelled',
    },
  });
}

/**
 * Record a failure and decide the job's fate.
 *
 * Retryable and attempts left → back to `queued` with backoff.
 * Otherwise → `dead`, which is a terminal state a human can inspect. `dead` is
 * deliberately distinct from `failed`: it means "gave up", not "one attempt
 * failed", and the difference matters when reading a queue at 3am.
 */
export async function markFailed(
  jobId: string,
  workerId: string,
  error: unknown,
  category: JobErrorCategory = 'unknown',
  random = Math.random,
): Promise<'retrying' | 'dead'> {
  const job = await db.job.findUnique({
    where: { id: jobId },
    select: { attempts: true, maxAttempts: true },
  });

  const attempts = job?.attempts ?? 1;
  const maxAttempts = job?.maxAttempts ?? 1;
  const willRetry = isRetryable(category) && attempts < maxAttempts;

  await db.job.updateMany({
    where: { id: jobId, lockedBy: workerId },
    data: willRetry
      ? {
          status: 'queued',
          lockedBy: null,
          lockedAt: null,
          leaseExpiresAt: null,
          runAfter: new Date(Date.now() + backoffMs(attempts, random)),
          lastError: redact(error),
          errorCategory: category,
        }
      : {
          status: 'dead',
          finishedAt: new Date(),
          lockedBy: null,
          leaseExpiresAt: null,
          lastError: redact(error),
          errorCategory: category,
        },
  });

  return willRetry ? 'retrying' : 'dead';
}

/**
 * Error text safe to persist.
 *
 * A provider error can carry the credential that was rejected. Gate 0
 * established that secrets never reach storage, logs, display or export, and a
 * job row is storage like any other.
 */
export function redact(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error ?? 'Unknown error');
  return raw
    .replace(/\b(sk|rlst|pk|xai|pplx)[-_][A-Za-z0-9_-]{8,}/g, '[redacted-key]')
    .replace(/\bBearer\s+[A-Za-z0-9._-]{8,}/gi, 'Bearer [redacted]')
    .replace(/([?&](?:key|api[_-]?key|token|access_token|password)=)[^&\s]+/gi, '$1[redacted]')
    .slice(0, 500);
}

/** Queue depth by status, for the health endpoint and the runbook. */
export async function queueStats(): Promise<Record<JobStatus, number>> {
  const rows = await db.job.groupBy({ by: ['status'], _count: { _all: true } });
  const out: Record<JobStatus, number> = {
    queued: 0, running: 0, succeeded: 0, failed: 0, cancelled: 0, dead: 0,
  };
  for (const r of rows) {
    if (r.status in out) out[r.status as JobStatus] = r._count._all;
  }
  return out;
}

/**
 * Reclaim jobs whose lease lapsed.
 *
 * Not strictly required — `claimNext` already treats a lapsed lease as
 * claimable — but running it on a schedule makes the recovery visible in the
 * job table rather than implicit, which is what an operator needs at 3am.
 */
export async function reapExpiredLeases(now = new Date()): Promise<number> {
  const result = await db.job.updateMany({
    where: { status: 'running', leaseExpiresAt: { lt: now } },
    data: {
      status: 'queued',
      lockedBy: null,
      lockedAt: null,
      leaseExpiresAt: null,
      lastError: 'Worker lease expired; job returned to the queue.',
      errorCategory: 'lease_lost',
    },
  });
  return result.count;
}
