import { NextResponse } from 'next/server';
import { timingSafeEqual, randomUUID } from 'node:crypto';
import type { DataMode } from '@/lib/ai/providers';
import { db } from '@/lib/db';
import { getPlan } from '@/lib/plan';
import { withLock } from '@/lib/jobs/lock';
import { enqueueMeasurementRun, scheduledDedupeBucket } from '@/lib/measurement/enqueue';
import { log } from '@/lib/observability';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Scheduled visibility runs.
 *
 * Point a scheduler at this once an hour (Vercel Cron, GitHub Actions, or a
 * plain crontab curl). It works out which projects are actually due based on
 * their plan's frequency and when they last ran, so an hourly trigger does not
 * mean hourly checks.
 *
 * This endpoint no longer *runs* anything. It decides what is due and enqueues
 * it, which changes what the endpoint can be trusted with: it used to hold a
 * request open for up to five minutes per project and could only ever handle a
 * handful before the platform killed it. Enqueueing is a few writes, so the
 * batch limit is now about fairness rather than about surviving a timeout.
 *
 * Two mechanisms stop a duplicate delivery becoming duplicate work, and they
 * cover different failures:
 *
 *   - A named lock, so two overlapping deliveries do not both sweep. Before
 *     Phase 2 there was none, despite `lib/jobs/lock.ts` existing for exactly
 *     this. A skipped tick is the correct outcome, not an error.
 *   - A per-period idempotency key, so even a sweep that does run twice — a
 *     lapsed lock, a retry after a network error ate the response — maps to the
 *     same job rather than a second one.
 *
 * Protected by CRON_SECRET. Without that set the endpoint refuses to run
 * rather than defaulting open — an unauthenticated caller could otherwise
 * burn a customer's provider quota.
 */
function authorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;

  const presented =
    req.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ??
    req.headers.get('x-cron-secret') ??
    '';

  const a = Buffer.from(presented);
  const b = Buffer.from(secret);
  return a.length === b.length && a.length > 0 && timingSafeEqual(a, b);
}

const DAY_MS = 86_400_000;

/** Long enough that a slow sweep keeps its lock; short enough that a crash frees it. */
const SWEEP_LOCK_MS = 2 * 60_000;

export async function GET(req: Request) {
  return run(req);
}

export async function POST(req: Request) {
  return run(req);
}

async function run(req: Request) {
  if (!authorized(req)) {
    return NextResponse.json(
      {
        error: process.env.CRON_SECRET
          ? 'Invalid cron secret.'
          : 'CRON_SECRET is not configured, so scheduled runs are disabled.',
      },
      { status: 401 },
    );
  }

  const url = new URL(req.url);
  const force = url.searchParams.get('force') === 'true';
  // Bound the work per invocation so one call cannot enqueue unboundedly.
  const maxProjects = Math.min(50, Math.max(1, Number(url.searchParams.get('limit') ?? 25)));

  const holder = `cron-${randomUUID()}`;
  const swept = await withLock('cron:run-checks', holder, SWEEP_LOCK_MS, () =>
    sweep(force, maxProjects),
  );

  if (!swept.ran) {
    // Another delivery is mid-sweep. Not an error: the work is being done.
    log.info('cron.run-checks.skipped', { reason: 'sweep already in progress' });
    return NextResponse.json({
      ok: true,
      ranAt: new Date().toISOString(),
      skipped: true,
      reason: 'Another sweep is already in progress.',
      results: [],
    });
  }

  return NextResponse.json({ ok: true, ranAt: new Date().toISOString(), skipped: false, ...swept.result });
}

interface SweepRow {
  project: string;
  jobId?: string;
  runId?: string;
  status: string;
  reason?: string;
}

async function sweep(force: boolean, maxProjects: number) {
  const projects = await db.project.findMany({
    include: {
      org: true,
      prompts: true,
      // Due-ness is decided from the last measurement RUN, not from legacy
      // per-check timestamps. A run that is merely queued still counts, which
      // is what stops a sweep from re-enqueueing work the worker has not
      // reached yet.
      runs: { orderBy: { startedAt: 'desc' }, take: 1, select: { startedAt: true } },
    },
  });

  const now = Date.now();
  const results: SweepRow[] = [];
  let processed = 0;

  for (const project of projects) {
    if (processed >= maxProjects) {
      results.push({ project: project.name, status: 'deferred', reason: 'Batch limit reached' });
      continue;
    }

    if (!project.prompts.length) {
      results.push({ project: project.name, status: 'skipped', reason: 'No prompts configured' });
      continue;
    }

    const plan = getPlan(project.org.plan);
    const intervalMs = plan.frequency === 'daily' ? DAY_MS : 7 * DAY_MS;

    const lastRun = project.runs[0]?.startedAt.getTime() ?? 0;

    if (!force && lastRun && now - lastRun < intervalMs) {
      const hours = Math.ceil((intervalMs - (now - lastRun)) / 3_600_000);
      results.push({ project: project.name, status: 'not-due', reason: `Due in ~${hours}h` });
      continue;
    }

    processed++;

    const mode: DataMode = project.dataMode === 'demo' ? 'demo' : 'live';

    try {
      // Entitlement is deliberately NOT checked here. The handler re-checks it
      // at execution time, which is the only check that can be current, and
      // duplicating it here would only change which of the two rejects first.
      const { jobId, runId, deduped } = await enqueueMeasurementRun({
        orgId: project.orgId,
        projectId: project.id,
        projectName: project.name,
        projectDomain: project.domain,
        prompts: project.prompts.map((p) => ({ id: p.id, text: p.text, cluster: p.cluster })),
        dataMode: mode,
        trigger: 'scheduled',
        // Forced sweeps bypass due-ness, so they must also bypass the period
        // bucket — otherwise the second force of the same day would silently
        // join the first instead of running.
        dedupeBucket: force
          ? `scheduled:forced:${now}`
          : scheduledDedupeBucket(intervalMs, now),
      });

      results.push({
        project: project.name,
        jobId,
        runId,
        status: deduped ? 'already-queued' : 'queued',
      });
    } catch (err) {
      // One project failing must not abort the rest of the batch.
      log.error('cron.run-checks.enqueue-failed', {
        projectId: project.id,
        orgId: project.orgId,
        error: err instanceof Error ? err.message : 'Unknown error',
      });
      results.push({
        project: project.name,
        status: 'failed',
        reason: 'Could not be queued. See the worker logs.',
      });
    }
  }

  return {
    projectsConsidered: projects.length,
    projectsQueued: results.filter((r) => r.status === 'queued').length,
    projectsAlreadyQueued: results.filter((r) => r.status === 'already-queued').length,
    results,
  };
}
