import 'server-only';

/**
 * Fixed-window rate limiter.
 *
 * Two stores. `rateLimit` is the in-memory one and stays for hot paths where a
 * per-process speed bump is genuinely enough. `sharedRateLimit` is backed by
 * the database and is what anything resembling a security or billing control
 * must use, because the in-memory limiter multiplies by the instance count:
 * behind four replicas a "10 per minute" limit was really 40.
 *
 * Client identity now comes from `lib/client-ip.ts`, which knows how many
 * proxies to trust. Previously it took the leftmost `X-Forwarded-For` entry,
 * which the caller writes — so the limiter keyed on a value the attacker chose,
 * and rotating it reset the window.
 */

interface Window {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Window>();

/** Drop expired windows so the map cannot grow without bound. */
function sweep(now: number) {
  if (buckets.size < 5000) return;
  for (const [key, window] of buckets) {
    if (window.resetAt <= now) buckets.delete(key);
  }
}

export interface RateLimitResult {
  ok: boolean;
  limit: number;
  remaining: number;
  resetAt: number;
  retryAfterSeconds: number;
}

export function rateLimit(key: string, limit: number, windowMs: number): RateLimitResult {
  const now = Date.now();
  sweep(now);

  const existing = buckets.get(key);
  if (!existing || existing.resetAt <= now) {
    const window = { count: 1, resetAt: now + windowMs };
    buckets.set(key, window);
    return { ok: true, limit, remaining: limit - 1, resetAt: window.resetAt, retryAfterSeconds: 0 };
  }

  existing.count++;
  const remaining = Math.max(0, limit - existing.count);

  return {
    ok: existing.count <= limit,
    limit,
    remaining,
    resetAt: existing.resetAt,
    retryAfterSeconds: Math.max(1, Math.ceil((existing.resetAt - now) / 1000)),
  };
}

/**
 * Client identity for a rate-limit bucket.
 *
 * Re-exported from `lib/client-ip.ts` so existing call sites keep working while
 * the trust arithmetic lives in one place.
 */
export { clientKey } from './client-ip';

/** Standard headers so clients can back off intelligently. */
export function rateLimitHeaders(result: RateLimitResult): Record<string, string> {
  const headers: Record<string, string> = {
    'X-RateLimit-Limit': String(result.limit),
    'X-RateLimit-Remaining': String(result.remaining),
    'X-RateLimit-Reset': String(Math.ceil(result.resetAt / 1000)),
  };
  if (!result.ok) headers['Retry-After'] = String(result.retryAfterSeconds);
  return headers;
}


/**
 * Database-backed fixed-window limiter, shared across every instance.
 *
 * Use this wherever the limit is a control rather than a courtesy: login,
 * password reset, signup, public tool endpoints. The extra round-trip is worth
 * it precisely where the in-memory limiter's per-process weakness matters.
 *
 * Fails **open** on a database error. That is a deliberate trade and worth
 * stating plainly: a limiter that fails closed converts a database blip into a
 * total outage of sign-in. The exposure window is the length of the outage, and
 * losing rate limiting for that window is less harmful than losing the product.
 */
export async function sharedRateLimit(
  key: string,
  limit: number,
  windowMs: number,
  now = new Date(),
): Promise<RateLimitResult> {
  const { db } = await import('./db');

  try {
    const existing = await db.rateLimitCounter.findUnique({ where: { key } });

    if (!existing || existing.resetAt.getTime() <= now.getTime()) {
      const resetAt = new Date(now.getTime() + windowMs);
      await db.rateLimitCounter.upsert({
        where: { key },
        create: { key, count: 1, resetAt },
        update: { count: 1, resetAt },
      });
      return {
        ok: true,
        limit,
        remaining: limit - 1,
        resetAt: resetAt.getTime(),
        retryAfterSeconds: 0,
      };
    }

    const updated = await db.rateLimitCounter.update({
      where: { key },
      data: { count: { increment: 1 } },
      select: { count: true, resetAt: true },
    });

    const remaining = Math.max(0, limit - updated.count);
    return {
      ok: updated.count <= limit,
      limit,
      remaining,
      resetAt: updated.resetAt.getTime(),
      retryAfterSeconds: Math.max(1, Math.ceil((updated.resetAt.getTime() - now.getTime()) / 1000)),
    };
  } catch {
    return {
      ok: true,
      limit,
      remaining: limit,
      resetAt: now.getTime() + windowMs,
      retryAfterSeconds: 0,
    };
  }
}

/** Drop expired shared counters. Called from the maintenance sweep. */
export async function pruneRateLimitCounters(now = new Date()): Promise<number> {
  const { db } = await import('./db');
  const result = await db.rateLimitCounter.deleteMany({ where: { resetAt: { lt: now } } });
  return result.count;
}
