import { NextResponse } from 'next/server';
import { liveEngines, ENGINES } from '@/lib/ai/engines';
import { billingEnabled } from '@/lib/billing';
import { db } from '@/lib/db';
import { emailProvider } from '@/lib/email';
import { providerConfigured } from '@/lib/seo/providers/keyword-data';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Liveness and readiness probe.
 *
 * Returns 200 only when the database actually answers a query — a process
 * that is up but cannot reach its database is not ready to serve traffic.
 */
export async function GET() {
  const startedAt = Date.now();

  let database: 'ok' | 'unreachable' = 'unreachable';
  let databaseError: string | undefined;

  try {
    await db.$queryRaw`SELECT 1`;
    database = 'ok';
  } catch (err) {
    databaseError = err instanceof Error ? err.message : 'Unknown database error';
  }

  const live = liveEngines();
  const healthy = database === 'ok';

  return NextResponse.json(
    {
      status: healthy ? 'ok' : 'degraded',
      version: process.env.npm_package_version ?? '1.0.0',
      uptimeSeconds: Math.round(process.uptime()),
      latencyMs: Date.now() - startedAt,
      checks: {
        database,
        ...(databaseError ? { databaseError } : {}),
        // Simulated engines are a supported mode, not a failure, so this is
        // reported as information rather than folded into the status.
        answerEngines: { total: ENGINES.length, live: live.length, simulated: ENGINES.length - live.length },
        authSecret: process.env.AUTH_SECRET ? 'configured' : 'using-development-default',
        // Reported as information, not failure: each of these has a supported
        // unconfigured mode, and a self-hosted install may want none of them.
        billing: billingEnabled() ? 'stripe' : 'disabled-self-hosted',
        email: emailProvider(),
        keywordData: providerConfigured() ? 'provider' : 'modelled',
        scheduledRuns: process.env.CRON_SECRET ? 'enabled' : 'disabled',
      },
      timestamp: new Date().toISOString(),
    },
    {
      status: healthy ? 200 : 503,
      headers: { 'Cache-Control': 'no-store' },
    },
  );
}
