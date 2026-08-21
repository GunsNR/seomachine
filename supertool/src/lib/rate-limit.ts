import 'server-only';

/**
 * Fixed-window rate limiter.
 *
 * Deliberately in-memory: it needs no infrastructure, which keeps the product
 * deployable as a single container. The trade-off is that limits are
 * per-instance — behind a multi-instance load balancer the effective limit is
 * (limit x instances). For the public tool endpoints this is a speed bump
 * against casual abuse, not a billing control; swap the store for Redis if you
 * need a global guarantee.
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
 * Best-effort client identity.
 *
 * Proxy headers are spoofable, so this is not a security boundary — it is
 * enough to stop one impatient browser hammering an expensive endpoint.
 */
export function clientKey(req: Request, scope: string): string {
  const forwarded = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim();
  const ip = forwarded || req.headers.get('x-real-ip') || 'unknown';
  return `${scope}:${ip}`;
}

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
