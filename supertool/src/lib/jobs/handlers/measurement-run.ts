// Deliberately NOT `server-only`: run by the worker process, not a request.
import { z } from 'zod';
import type { DataMode } from '../../ai/providers';
import { db } from '../../db';
import { SubscriptionRequiredError, assertEntitled } from '../../plan';
import { RunSuspended, executeRun, finalizeRun, type CheckpointDirective } from '../../measurement/run';
import { log } from '../../observability';
import { redact } from '../queue';
import type { JobContext, JobHandler, JobOutcome } from './types';

/**
 * Execute one measurement run that a producer already created and queued.
 *
 * The run row exists before this handler is ever reached — the producer writes
 * it so the customer sees a `queued` run the instant they click, and so a job
 * that never gets picked up still leaves evidence that they asked. This handler
 * therefore resumes a known run rather than starting an unknown one, which is
 * also what makes a retry safe: the same runId every time, and the observation
 * uniqueness constraint doing the rest.
 */

/**
 * Payload schema.
 *
 * Note what is absent: no credentials, no session, no API key, no resolved
 * provider configuration. A job row is storage, and constitutional invariant 10
 * says a secret never reaches storage. Everything privileged is re-derived at
 * execution time from `orgId`.
 */
const Payload = z.object({
  runId: z.string().min(1).max(64),
  projectId: z.string().min(1).max(64),
  samplesPerPair: z.number().int().min(1).max(10).default(1),
  trigger: z.enum(['manual', 'scheduled', 'backfill']).default('manual'),
});

export type MeasurementRunPayload = z.infer<typeof Payload>;

export const MEASUREMENT_RUN_KIND = 'measurement.run';

/**
 * How often the lease is extended relative to its length.
 *
 * Renewing at every checkpoint would be simplest and would also mean a run of
 * 300 prompts issues 300 pointless writes. Renewing only when the lease is
 * within a third of expiry keeps the write rate proportional to elapsed time
 * rather than to prompt count, while leaving ample margin before it lapses.
 */
const RENEW_WITHIN_MS = 90_000;

export const measurementRunHandler: JobHandler = {
  kind: MEASUREMENT_RUN_KIND,

  async run(ctx: JobContext): Promise<JobOutcome> {
    const parsed = Payload.safeParse(ctx.payload);
    if (!parsed.success) {
      // A malformed payload will be exactly as malformed on the fifth attempt.
      return {
        status: 'failed',
        category: 'permanent',
        error: new Error(`Invalid ${MEASUREMENT_RUN_KIND} payload: ${parsed.error.issues[0]?.message ?? 'unknown field'}`),
      };
    }
    const payload = parsed.data;

    // Ownership is re-checked here, against the org on the job row, not against
    // anything the payload claims. A project that moved tenant, or a payload
    // that was tampered with in the database, cannot reach another tenant's data.
    const project = await db.project.findFirst({
      where: { id: payload.projectId, orgId: ctx.orgId },
      include: { competitors: true, prompts: true },
    });
    if (!project) {
      return {
        status: 'failed',
        category: 'permanent',
        error: new Error('Project not found for this organisation.'),
      };
    }

    // The run must belong to the same tenant and the same project. Both are
    // checked because either alone would let a crafted payload attach one
    // tenant's observations to another tenant's run.
    const run = await db.measurementRun.findFirst({
      where: { id: payload.runId, orgId: ctx.orgId, projectId: project.id },
      select: { id: true, status: true, dataMode: true, samplesPerPair: true, localeTag: true, regionCode: true },
    });
    if (!run) {
      return {
        status: 'failed',
        category: 'permanent',
        error: new Error('Measurement run not found for this organisation.'),
      };
    }

    // A run already closed out by a previous attempt is not re-executed. This
    // is the second line of defence behind observation uniqueness: it stops a
    // duplicate delivery from re-billing an already-finished run.
    if (['completed', 'partial', 'failed', 'cancelled'].includes(run.status)) {
      return { status: 'succeeded', detail: `Run already ${run.status}.` };
    }

    if (!project.prompts.length) {
      return {
        status: 'failed',
        category: 'permanent',
        error: new Error('This project has no prompts to run.'),
      };
    }

    // Entitlement is re-checked at execution time, not only at enqueue time. A
    // subscription can lapse between the click and the run, and a queue that
    // ignores that is a queue that performs unpaid work.
    try {
      await assertEntitled(ctx.orgId);
    } catch (err) {
      if (err instanceof SubscriptionRequiredError) {
        return { status: 'failed', category: 'permanent', error: err };
      }
      throw err;
    }

    // Cancelled before the first provider call. Close the run out now rather
    // than leaving it `queued` forever.
    if (await ctx.isCancelled()) {
      await finalizeRun(payload.runId, '', 'cancelled');
      return { status: 'cancelled', detail: 'Cancelled before execution began.' };
    }

    const mode: DataMode = run.dataMode === 'demo' ? 'demo' : 'live';
    let leaseExpiresAt = Date.now() + RENEW_WITHIN_MS;

    const result = await executeRun(
      payload.runId,
      {
        orgId: ctx.orgId,
        projectId: project.id,
        projectName: project.name,
        projectDomain: project.domain,
        prompts: project.prompts.map((p) => ({ id: p.id, text: p.text, cluster: p.cluster })),
        competitors: project.competitors.map((c) => ({ name: c.label, domain: c.domain })),
        dataMode: mode,
        trigger: payload.trigger,
        samplesPerPair: run.samplesPerPair || payload.samplesPerPair,
        localeTag: run.localeTag,
        regionCode: run.regionCode,
      },
      {
        onCheckpoint: async (): Promise<CheckpointDirective> => {
          // Order matters. Cancellation is checked first so a cancel issued
          // during a lease gap still wins, and shutdown is checked before the
          // renewal so a draining worker does not extend a lease it is about
          // to drop.
          if (await ctx.isCancelled()) return 'cancel';
          if (ctx.isShuttingDown()) return 'stop';

          if (Date.now() >= leaseExpiresAt) {
            if (!(await ctx.renewLease())) {
              // Someone else may already be running this run. Stop writing.
              throw new RunSuspended('Lease lost while the run was in progress.');
            }
            leaseExpiresAt = Date.now() + RENEW_WITHIN_MS;
          }

          return 'continue';
        },
      },
    );

    if (result.suspended) {
      return {
        status: 'suspended',
        detail: `Stopped after ${result.attempted} of the run's observations; it will resume.`,
      };
    }

    if (result.status === 'cancelled') {
      return { status: 'cancelled', detail: `Cancelled after ${result.observed} observations.` };
    }

    log.info('measurement.run.finished', {
      jobId: ctx.jobId,
      orgId: ctx.orgId,
      runId: result.runId,
      status: result.status,
      attempted: result.attempted,
      observed: result.observed,
      skippedExisting: result.skippedExisting,
    });

    // A run that observed nothing is a real failure, but not a retryable one in
    // the queue's sense. `executeRun` builds its skip set from every observation
    // row that exists, regardless of that row's status, so a failed observation
    // is already recorded and a retry would skip it rather than re-ask it. The
    // retry would therefore be a guaranteed no-op that burns an attempt and
    // delays everything behind it. The run row's own `failed` status is the
    // honest record; the job itself is done. See docs/measurement-spec.md §8.
    return { status: 'succeeded', detail: `Run ${result.status}.` };
  },

  /**
   * Close the run out once the queue has stopped trying.
   *
   * A run whose job is dead is not still running, and leaving it labelled
   * `running` would have the product tell a customer their measurement is in
   * progress when nothing is going to advance it. `finalizeRun` recomputes from
   * whatever observations actually landed, so a run that got halfway becomes an
   * honest `partial` and one that never started becomes `failed`.
   */
  async onGaveUp(ctx: JobContext, error: unknown): Promise<void> {
    const parsed = Payload.safeParse(ctx.payload);
    if (!parsed.success) return; // Nothing identifiable to close out.

    const run = await db.measurementRun.findFirst({
      where: { id: parsed.data.runId, orgId: ctx.orgId, status: { in: ['queued', 'running'] } },
      select: { id: true },
    });
    if (!run) return;

    // `redact` rather than the raw message: this string is written to a row the
    // customer's dashboard renders, and a provider error can carry the
    // credential it rejected.
    await finalizeRun(run.id, redact(error) || 'The measurement job stopped after repeated failures.');

    log.warn('measurement.run.abandoned', { jobId: ctx.jobId, orgId: ctx.orgId, runId: run.id });
  },
};
