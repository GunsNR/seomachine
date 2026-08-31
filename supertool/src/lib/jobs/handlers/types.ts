// Deliberately NOT `server-only`: handlers are executed by the worker, which is
// a plain Node process rather than a request.
import type { JobErrorCategory } from '../queue';

/**
 * The contract between the worker and a unit of work.
 *
 * The worker knows about leases, backoff and shutdown. A handler knows about
 * its own domain. Neither knows anything about the other, and the two things
 * they exchange are this context and this result.
 */

export interface JobContext {
  jobId: string;
  /**
   * Tenant recorded on the job row.
   *
   * A handler must re-derive authorisation from this rather than trusting its
   * payload. The payload was written by a producer that had a session; by the
   * time the job runs, minutes or retries later, that session proves nothing
   * and the org may no longer be entitled to the work.
   */
  orgId: string;
  projectId: string;
  payload: Record<string, unknown>;
  attempts: number;
  maxAttempts: number;

  /**
   * Extend the lease and report whether the job is still ours to run.
   *
   * False means another worker may already have claimed it. The handler must
   * stop; it must not assume its writes are still the only ones landing.
   */
  renewLease: () => Promise<boolean>;

  /** True once someone asked this job to stop. */
  isCancelled: () => Promise<boolean>;

  /** True once the worker has begun shutting down. */
  isShuttingDown: () => boolean;
}

/**
 * How a handler finished.
 *
 * `suspended` is the outcome that a simpler design would omit and then regret:
 * the work neither succeeded nor failed, it was preempted, and the job must go
 * back to the queue without a failure being recorded against it.
 */
export type JobOutcome =
  | { status: 'succeeded'; detail?: string }
  | { status: 'cancelled'; detail?: string }
  | { status: 'suspended'; detail?: string }
  | { status: 'failed'; category: JobErrorCategory; error: unknown };

export interface JobHandler {
  /** Canonical kind string. Must match the registry key. */
  kind: string;
  run: (ctx: JobContext) => Promise<JobOutcome>;

  /**
   * Called once the queue has given up on this job — a permanent failure, or
   * the last attempt of a retryable one.
   *
   * Without this, a domain object the job was mid-way through updating is left
   * in its in-progress state with nothing coming to finish it. A measurement
   * run would sit at `running` until a staleness window eventually relabelled
   * it, which tells the customer "still working" about work that has stopped.
   *
   * Best-effort by contract: it runs after the job row is already terminal, and
   * a throw here is logged rather than allowed to resurrect the job.
   */
  onGaveUp?: (ctx: JobContext, error: unknown) => Promise<void>;
}
