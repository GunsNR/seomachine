import { NextResponse } from 'next/server';
import { timingSafeEqual } from 'node:crypto';
import { liveEngines, ENGINES, MEASURABLE_ENGINES } from '@/lib/ai/engines';
import { billingEnabled } from '@/lib/billing';
import { db } from '@/lib/db';
import { emailProvider } from '@/lib/email';
import { queueStats } from '@/lib/jobs/queue';
import { signupPosture } from '@/lib/pilot';
import { providerConfigured } from '@/lib/seo/providers/keyword-data';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Liveness and readiness probe.
 *
 * Two response shapes, because two different callers need this endpoint and
 * they are owed different amounts of information.
 *
 * **Public (default).** Whether the service can serve traffic, and nothing
 * else. A load balancer needs exactly one bit.
 *
 * **Detailed (`Authorization: Bearer $HEALTH_TOKEN`).** Configuration state,
 * queue depth, engine counts, and the database error text when there is one.
 *
 * Before Phase 2 the detailed shape *was* the public shape. That handed any
 * anonymous caller a map of the deployment: which providers were configured,
 * whether billing was live, whether `AUTH_SECRET` was still the development
 * default, and — most usefully to an attacker — the raw database error string,
 * which routinely carries a hostname, a port and a driver version. None of that
 * is secret in the sense of being a credential, and all of it shortens the
 * distance between "found the host" and "knows what to try".
 */

/** Constant-time compare so the token cannot be recovered a byte at a time. */
function tokenMatches(presented: string, expected: string): boolean {
  const a = Buffer.from(presented);
  const b = Buffer.from(expected);
  if (a.length !== b.length || a.length === 0) return false;
  return timingSafeEqual(a, b);
}

function isDetailAuthorized(req: Request): boolean {
  const expected = process.env.HEALTH_TOKEN ?? '';
  // No token configured means the detailed view is simply unavailable, rather
  // than open. An unset secret must never mean "allow everyone".
  if (!expected) return false;

  const presented = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '').trim() ?? '';
  if (!presented) return false;

  return tokenMatches(presented, expected);
}

export async function GET(req: Request) {
  const startedAt = Date.now();

  let database: 'ok' | 'unreachable' = 'unreachable';
  let databaseError: string | undefined;

  try {
    await db.$queryRaw`SELECT 1`;
    database = 'ok';
  } catch (err) {
    databaseError = err instanceof Error ? err.message : 'Unknown database error';
  }

  const healthy = database === 'ok';
  const status = healthy ? 200 : 503;
  const headers = { 'Cache-Control': 'no-store' };

  if (!isDetailAuthorized(req)) {
    // Deliberately minimal. Enough for a probe, useless for reconnaissance.
    return NextResponse.json(
      { status: healthy ? 'ok' : 'degraded', timestamp: new Date().toISOString() },
      { status, headers },
    );
  }

  // Queue depth is genuinely useful at 3am and genuinely sensitive: a public
  // backlog figure tells an attacker exactly when the system is under strain.
  let queue: Awaited<ReturnType<typeof queueStats>> | { error: string };
  try {
    queue = await queueStats();
  } catch {
    queue = { error: 'Queue statistics unavailable.' };
  }

  const live = liveEngines();

  return NextResponse.json(
    {
      status: healthy ? 'ok' : 'degraded',
      version: process.env.npm_package_version ?? '1.0.0',
      uptimeSeconds: Math.round(process.uptime()),
      latencyMs: Date.now() - startedAt,
      checks: {
        database,
        ...(databaseError ? { databaseError } : {}),
        queue,
        // An unconnected surface is a supported state, not a failure: it is
        // skipped and recorded as unavailable rather than simulated.
        answerEngines: {
          known: ENGINES.length,
          measurable: MEASURABLE_ENGINES.length,
          live: live.length,
          notConnected: MEASURABLE_ENGINES.length - live.length,
          unavailable: ENGINES.length - MEASURABLE_ENGINES.length,
        },
        authSecret: process.env.AUTH_SECRET ? 'configured' : 'using-development-default',
        trustedProxyCount: Number.parseInt(process.env.TRUSTED_PROXY_COUNT ?? '0', 10) || 0,
        // Reported as information, not failure: each of these has a supported
        // unconfigured mode, and a self-hosted install may want none of them.
        billing: billingEnabled() ? 'stripe' : 'disabled-self-hosted',
        // Every refused signup returns one indistinguishable message, so a
        // broken allowlist is invisible from outside on purpose. This is where
        // the operator finds out. `misconfigured-allowlist` means PILOT_MODE is
        // on and every signup is being refused, including invited ones. Reports
        // the shape of the configuration, never the addresses in it.
        signup: signupPosture(),
        email: emailProvider(),
        keywordData: providerConfigured() ? 'provider' : 'modelled',
        scheduledRuns: process.env.CRON_SECRET ? 'enabled' : 'disabled',
      },
      timestamp: new Date().toISOString(),
    },
    { status, headers },
  );
}
