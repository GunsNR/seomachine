import { db } from '../db';

/**
 * Named mutual-exclusion leases.
 *
 * Distinct from a job lease. A job lease guards one unit of work; this guards a
 * recurring *activity* — the scheduled-run sweep, the lease reaper — which must
 * not run twice concurrently even though each invocation enqueues many jobs.
 *
 * Before Phase 2 the cron endpoint had no lock at all: two overlapping cron
 * deliveries, or one slow run overlapping the next tick, both swept the same
 * projects and enqueued the same work twice.
 *
 * Every lock carries an expiry rather than a held/free flag. A holder that
 * crashes cannot block the activity forever — the lease simply lapses. This is
 * the same reasoning as the job lease, and the same reason a boolean would be
 * the wrong shape.
 */

export interface LockHandle {
  key: string;
  holder: string;
  expiresAt: Date;
}

/**
 * Take the lock, or return null if someone else holds a live one.
 *
 * The upsert is the concurrency primitive: two callers racing produce one
 * insert and one conflict, and the conflict path re-reads to decide whether the
 * existing holder's lease has lapsed.
 */
export async function acquireLock(
  key: string,
  holder: string,
  ttlMs: number,
  now = new Date(),
): Promise<LockHandle | null> {
  const expiresAt = new Date(now.getTime() + ttlMs);

  const existing = await db.jobLock.findUnique({ where: { key } });

  if (!existing) {
    try {
      await db.jobLock.create({ data: { key, holder, acquiredAt: now, expiresAt } });
      return { key, holder, expiresAt };
    } catch {
      // Lost the insert race; fall through and treat it as contended.
      return null;
    }
  }

  if (existing.expiresAt > now) return null; // Live lease held by someone else.

  // The lease lapsed. Take it over, but only if it is still the same lapsed row
  // we just read — otherwise another worker beat us to the takeover.
  const result = await db.jobLock.updateMany({
    where: { key, expiresAt: existing.expiresAt, holder: existing.holder },
    data: { holder, acquiredAt: now, expiresAt },
  });

  return result.count === 1 ? { key, holder, expiresAt } : null;
}

/** Extend a lease this holder still owns. False means it was already lost. */
export async function renewLock(
  key: string,
  holder: string,
  ttlMs: number,
  now = new Date(),
): Promise<boolean> {
  const result = await db.jobLock.updateMany({
    where: { key, holder, expiresAt: { gt: now } },
    data: { expiresAt: new Date(now.getTime() + ttlMs) },
  });
  return result.count === 1;
}

/** Release a lock. Only the holder may release, so a late worker cannot free someone else's. */
export async function releaseLock(key: string, holder: string): Promise<boolean> {
  const result = await db.jobLock.deleteMany({ where: { key, holder } });
  return result.count === 1;
}

/**
 * Run `fn` while holding `key`, or skip if the lock is contended.
 *
 * Returns `{ ran: false }` rather than throwing when contended: a skipped tick
 * is the correct, uneventful outcome for a recurring sweep, not an error worth
 * paging anyone about.
 */
export async function withLock<T>(
  key: string,
  holder: string,
  ttlMs: number,
  fn: () => Promise<T>,
): Promise<{ ran: true; result: T } | { ran: false }> {
  const handle = await acquireLock(key, holder, ttlMs);
  if (!handle) return { ran: false };

  try {
    return { ran: true, result: await fn() };
  } finally {
    await releaseLock(key, holder).catch(() => {
      // A failed release is survivable: the lease expires on its own.
    });
  }
}
