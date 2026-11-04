import type { Prisma } from "@prisma/client";
import { systemDb } from "../db";
import { redact } from "../crypto";

/**
 * Durable Postgres-backed job queue. A worker takes a lease with
 * FOR UPDATE SKIP LOCKED, so two workers cannot run the same job; a lease that
 * expires (worker crash) makes the job claimable again. Handlers must be
 * idempotent — the queue guarantees at-least-once execution, and the business
 * effect is kept at-most-once by idempotency keys on the rows they write.
 */

export type JobRow = { id: string; workspaceId: string; kind: string; payload: Prisma.JsonValue; attempts: number; maxAttempts: number };

export async function enqueue(
  kind: string,
  workspaceId: string,
  payload: Prisma.InputJsonValue,
  opts: { runAfter?: Date; idempotencyKey?: string; maxAttempts?: number } = {},
): Promise<string> {
  if (opts.idempotencyKey) {
    const existing = await systemDb.job.findUnique({ where: { idempotencyKey: opts.idempotencyKey } });
    if (existing) return existing.id;
  }
  try {
    const j = await systemDb.job.create({
      data: { kind, workspaceId, payload, runAfter: opts.runAfter ?? new Date(), idempotencyKey: opts.idempotencyKey, maxAttempts: opts.maxAttempts ?? 5 },
    });
    return j.id;
  } catch (e) {
    if (opts.idempotencyKey && (e as { code?: string }).code === "P2002") {
      const existing = await systemDb.job.findUnique({ where: { idempotencyKey: opts.idempotencyKey } });
      if (existing) return existing.id;
    }
    throw e;
  }
}

/** Lease must exceed the slowest bounded handler (a 25-page live crawl at 8s/page ≈ 3.5 min). */
export const LEASE_MS = 5 * 60_000;

export async function claim(workerId: string, leaseMs = LEASE_MS, now = new Date()): Promise<JobRow | null> {
  const lease = new Date(now.getTime() + leaseMs);
  const rows = await systemDb.$queryRaw<JobRow[]>`
    UPDATE "Job" SET status = 'running', "lockedBy" = ${workerId}, "leaseExpiresAt" = ${lease}, attempts = attempts + 1
    WHERE id = (
      SELECT id FROM "Job"
      WHERE (status = 'queued' AND "runAfter" <= ${now})
         OR (status = 'running' AND "leaseExpiresAt" < ${now})
      ORDER BY "runAfter" ASC, "createdAt" ASC
      FOR UPDATE SKIP LOCKED
      LIMIT 1
    )
    RETURNING id, "workspaceId", kind, payload, attempts, "maxAttempts"`;
  return rows[0] ?? null;
}

export async function complete(jobId: string, workerId: string): Promise<void> {
  await systemDb.job.updateMany({ where: { id: jobId, lockedBy: workerId }, data: { status: "succeeded", finishedAt: new Date(), lockedBy: null, leaseExpiresAt: null } });
}

/** Retry with exponential backoff (30s · 2^n, capped at 1h); permanent errors go straight to dead. */
export async function fail(job: JobRow, workerId: string, error: unknown, opts: { permanent?: boolean } = {}): Promise<void> {
  const exhausted = opts.permanent || job.attempts >= job.maxAttempts;
  const delay = Math.min(30_000 * 2 ** Math.max(0, job.attempts - 1), 3_600_000);
  await systemDb.job.updateMany({
    where: { id: job.id, lockedBy: workerId },
    data: {
      status: exhausted ? "dead" : "queued",
      runAfter: new Date(Date.now() + delay),
      lastError: redact(error instanceof Error ? error.message : String(error)),
      lockedBy: null,
      leaseExpiresAt: null,
      finishedAt: exhausted ? new Date() : null,
    },
  });
}

export class PermanentJobError extends Error {}

export type Handler = (job: JobRow) => Promise<void>;

/** Process due jobs until none remain or `max` is reached. Used by the worker loop and by tests. */
export async function runDueJobs(handlers: Record<string, Handler>, opts: { workerId?: string; max?: number; now?: Date } = {}): Promise<number> {
  const workerId = opts.workerId ?? `inline-${process.pid}`;
  let n = 0;
  while (n < (opts.max ?? 100)) {
    const job = await claim(workerId, LEASE_MS, opts.now ?? new Date());
    if (!job) break;
    n++;
    const h = handlers[job.kind];
    try {
      if (!h) throw new PermanentJobError(`No handler for job kind "${job.kind}"`);
      await h(job);
      await complete(job.id, workerId);
    } catch (e) {
      await fail(job, workerId, e, { permanent: e instanceof PermanentJobError });
    }
  }
  return n;
}
