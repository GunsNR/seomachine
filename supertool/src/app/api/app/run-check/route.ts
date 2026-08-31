import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getSession } from '@/lib/auth';
import { can } from '@/lib/rbac';
import { db } from '@/lib/db';
import { assertEntitled, SubscriptionRequiredError } from '@/lib/plan';
import { MEASUREMENT_RUN_KIND } from '@/lib/jobs/handlers';
import { requestCancel } from '@/lib/jobs/queue';
import { enqueueMeasurementRun, manualDedupeBucket } from '@/lib/measurement/enqueue';
import { finalizeRun, isInterrupted } from '@/lib/measurement/run';
import { coverageOf } from '@/lib/measurement/stats';
import type { DataMode } from '@/lib/ai/providers';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Start, watch and cancel one measurement run.
 *
 * Until Phase 2 this route *performed* the run inside the request, with
 * `maxDuration = 300`. That was the honest thing to do with no worker, and it
 * had two costs the customer paid: a run longer than the platform's request
 * ceiling was killed halfway with nothing to show, and the browser tab was the
 * only thing keeping the work alive.
 *
 * The route now enqueues and returns. What it owes the caller in exchange is a
 * way to find out what happened, so the three verbs are deliberately one file:
 *
 *   POST   — enqueue (or join the run already in flight), 202
 *   GET    — the truthful state of that job and its run, for polling
 *   DELETE — request cancellation
 */

const Body = z.object({
  projectId: z.string().min(1).max(64),
  /**
   * Repetitions per (prompt, engine) pair. Answer engines are
   * non-deterministic, so one sample is an anecdote; the default stays at 1 to
   * bound cost, and the caller opts into more.
   */
  samplesPerPair: z.number().int().min(1).max(10).optional(),
});

/** Job states after which polling learns nothing new. */
const TERMINAL_JOB = new Set(['succeeded', 'failed', 'cancelled', 'dead']);
/** Run states that will not change again. */
const TERMINAL_RUN = new Set(['completed', 'partial', 'failed', 'cancelled']);

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });
  if (!can(session.role, 'measurement:run')) {
    return NextResponse.json({ error: 'Your role cannot perform this action.' }, { status: 403 });
  }

  let input: z.infer<typeof Body>;
  try {
    input = Body.parse(await req.json());
  } catch {
    return NextResponse.json({ error: 'Provide a projectId.' }, { status: 400 });
  }

  // Scope the lookup to the caller's org so a guessed id cannot reach another
  // tenant's project.
  const project = await db.project.findFirst({
    where: { id: input.projectId, orgId: session.orgId },
    include: { prompts: true },
  });
  if (!project) return NextResponse.json({ error: 'Project not found.' }, { status: 404 });

  // Checked here as well as in the handler. Here so an unentitled customer gets
  // an immediate, explanatory 402 instead of a job that fails minutes later;
  // there because entitlement can lapse in between.
  try {
    await assertEntitled(session.orgId);
  } catch (err) {
    if (err instanceof SubscriptionRequiredError) {
      return NextResponse.json({ error: err.message }, { status: 402 });
    }
    throw err;
  }

  if (!project.prompts.length) {
    return NextResponse.json({ error: 'This project has no prompts to run yet.' }, { status: 422 });
  }

  const mode: DataMode = project.dataMode === 'demo' ? 'demo' : 'live';

  const { jobId, runId, deduped } = await enqueueMeasurementRun({
    orgId: session.orgId,
    projectId: project.id,
    projectName: project.name,
    projectDomain: project.domain,
    prompts: project.prompts.map((p) => ({ id: p.id, text: p.text, cluster: p.cluster })),
    dataMode: mode,
    trigger: 'manual',
    samplesPerPair: input.samplesPerPair ?? 1,
    dedupeBucket: manualDedupeBucket(),
  });

  // 202, not 200. The work has been accepted, not performed, and the response
  // says so rather than implying a result exists. Coverage, observation counts
  // and cost are deliberately absent: none of them exist yet, and returning
  // zeroes would be indistinguishable from a run that measured nothing.
  return NextResponse.json(
    {
      ok: true,
      queued: true,
      jobId,
      runId,
      status: 'queued',
      /** True when this request joined work already in flight rather than starting new work. */
      deduped,
      prompts: project.prompts.length,
    },
    { status: 202 },
  );
}

/**
 * Poll one queued run.
 *
 * Answers from the two rows that actually know: the job (is anything going to
 * happen?) and the run (what has been measured so far?). Neither is inferred
 * from the other.
 */
export async function GET(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });
  if (!can(session.role, 'measurement:read')) {
    return NextResponse.json({ error: 'Your role cannot perform this action.' }, { status: 403 });
  }

  const url = new URL(req.url);
  const jobId = url.searchParams.get('jobId') ?? '';
  const runIdParam = url.searchParams.get('runId') ?? '';
  if (!jobId && !runIdParam) {
    return NextResponse.json({ error: 'Provide a jobId or a runId.' }, { status: 400 });
  }

  // Both lookups are scoped by orgId, so a guessed id from another tenant is
  // indistinguishable from one that does not exist.
  const job = jobId
    ? await db.job.findFirst({
        where: { id: jobId, orgId: session.orgId, kind: MEASUREMENT_RUN_KIND },
        select: {
          id: true, status: true, attempts: true, maxAttempts: true,
          errorCategory: true, lastError: true, payload: true,
          runAfter: true, cancelRequestedAt: true,
        },
      })
    : null;

  if (jobId && !job) return NextResponse.json({ error: 'Run not found.' }, { status: 404 });

  const runId = runIdParam || readRunId(job?.payload ?? '');
  const run = runId
    ? await db.measurementRun.findFirst({
        where: { id: runId, orgId: session.orgId },
        select: {
          id: true, status: true, startedAt: true, finishedAt: true, error: true,
          expectedObservations: true, observedCount: true,
        },
      })
    : null;

  if (!job && !run) return NextResponse.json({ error: 'Run not found.' }, { status: 404 });

  // Counted from the observation rows rather than the run's cached columns,
  // which are only written at finalisation. Mid-run, the cached columns are
  // zero and the rows are the truth.
  const observations = run
    ? await db.observation.findMany({ where: { runId: run.id }, select: { status: true } })
    : [];
  const cover = coverageOf(observations.map((o) => ({ status: o.status })));

  const interrupted = run ? isInterrupted(run.status, run.startedAt) : false;
  const jobDone = job ? TERMINAL_JOB.has(job.status) : true;
  const runDone = run ? TERMINAL_RUN.has(run.status) : false;

  return NextResponse.json({
    jobId: job?.id ?? null,
    runId: run?.id ?? null,
    /**
     * Whether polling can stop. Computed here rather than in the browser so the
     * rule lives in one place and a client cannot poll a finished run forever.
     */
    terminal: jobDone && (runDone || !run),
    job: job
      ? {
          status: job.status,
          attempts: job.attempts,
          maxAttempts: job.maxAttempts,
          cancelRequested: Boolean(job.cancelRequestedAt),
          /**
           * Already redacted at write time by `lib/jobs/queue.ts`. It is an
           * operator-facing sentence, never a stack trace.
           */
          error: job.lastError,
          errorCategory: job.errorCategory,
          nextAttemptAt: job.status === 'queued' && job.attempts > 0 ? job.runAfter : null,
        }
      : null,
    run: run
      ? {
          status: run.status,
          interrupted,
          startedAt: run.startedAt,
          finishedAt: run.finishedAt,
          expected: run.expectedObservations,
          attempted: cover.attempted,
          observed: cover.observed,
          failed: cover.failed,
          unavailable: cover.unavailable,
          coverage: cover.coverage,
          error: run.error,
        }
      : null,
  });
}

/**
 * Ask a queued or running measurement to stop.
 *
 * A queued job is cancelled outright, so its run is closed out here — nothing
 * else is ever going to touch it. A running job is only marked; it stops at its
 * next checkpoint and the worker finalises it, which is what keeps the
 * observations already written from being torn up mid-flight.
 */
export async function DELETE(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });
  if (!can(session.role, 'measurement:run')) {
    return NextResponse.json({ error: 'Your role cannot perform this action.' }, { status: 403 });
  }

  const jobId = new URL(req.url).searchParams.get('jobId') ?? '';
  if (!jobId) return NextResponse.json({ error: 'Provide a jobId.' }, { status: 400 });

  const job = await db.job.findFirst({
    where: { id: jobId, orgId: session.orgId, kind: MEASUREMENT_RUN_KIND },
    select: { id: true, payload: true },
  });
  if (!job) return NextResponse.json({ error: 'Run not found.' }, { status: 404 });

  const outcome = await requestCancel(job.id, session.orgId);
  if (outcome === 'not-found') {
    return NextResponse.json({ error: 'This run has already finished.' }, { status: 409 });
  }

  if (outcome === 'cancelled') {
    const runId = readRunId(job.payload);
    if (runId) {
      const run = await db.measurementRun.findFirst({
        where: { id: runId, orgId: session.orgId, status: { in: ['queued', 'running'] } },
        select: { id: true },
      });
      if (run) await finalizeRun(run.id, '', 'cancelled');
    }
  }

  return NextResponse.json({ ok: true, jobId: job.id, outcome });
}

function readRunId(raw: string): string {
  try {
    const parsed = JSON.parse(raw) as { runId?: unknown };
    return typeof parsed.runId === 'string' ? parsed.runId : '';
  } catch {
    return '';
  }
}
