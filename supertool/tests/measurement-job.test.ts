import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

/**
 * The measurement.run job flow, end to end, against real PostgreSQL.
 *
 * Every property here is a property of concurrency, of a uniqueness constraint,
 * or of what survives a process dying — and none of those can be demonstrated
 * against a mock. A fake client would agree that two workers cannot claim the
 * same job whether or not the conditional update actually works.
 *
 * The runs use demo-mode engines, so no provider is contacted and no credential
 * is required: the orchestration is what is under test, not the providers.
 */

import { createTestDatabase, type TestDatabase } from './helpers/test-database';

let database: TestDatabase;

type QueueMod = typeof import('@/lib/jobs/queue');
type EnqueueMod = typeof import('@/lib/measurement/enqueue');
type HandlersMod = typeof import('@/lib/jobs/handlers');
type WorkerMod = typeof import('@/worker/index');
type CronMod = typeof import('@/app/api/cron/run-checks/route');
type DbMod = typeof import('@/lib/db');

let queue: QueueMod;
let producer: EnqueueMod;
let handlers: HandlersMod;
let worker: WorkerMod;
let cron: CronMod;
let db: DbMod['db'];

beforeAll(async () => {
  database = await createTestDatabase('measurement_job');

  queue = await import('@/lib/jobs/queue');
  producer = await import('@/lib/measurement/enqueue');
  handlers = await import('@/lib/jobs/handlers');
  worker = await import('@/worker/index');
  cron = await import('@/app/api/cron/run-checks/route');
  db = (await import('@/lib/db')).db;
});

afterAll(async () => {
  await db?.$disconnect();
  await database?.drop();
});

beforeEach(async () => {
  await db.job.deleteMany({});
  await db.jobLock.deleteMany({});
  await db.observation.deleteMany({});
  await db.measurementRun.deleteMany({});
  await db.aiPrompt.deleteMany({});
  await db.project.deleteMany({});
  await db.organization.deleteMany({});
});

interface Tenant {
  orgId: string;
  projectId: string;
  projectName: string;
  projectDomain: string;
  prompts: Array<{ id: string; text: string; cluster: string }>;
}

async function seedTenant(name = 'Acme', promptCount = 2): Promise<Tenant> {
  const org = await db.organization.create({ data: { name: `${name} Org`, dataMode: 'demo' } });
  const project = await db.project.create({
    data: {
      orgId: org.id,
      name,
      domain: `${name.toLowerCase()}.example`,
      dataMode: 'demo',
    },
  });

  const prompts = [];
  for (let i = 0; i < promptCount; i++) {
    const p = await db.aiPrompt.create({
      data: { projectId: project.id, text: `Best ${name} tool number ${i}?` },
    });
    prompts.push({ id: p.id, text: p.text, cluster: p.cluster });
  }

  return {
    orgId: org.id,
    projectId: project.id,
    projectName: project.name,
    projectDomain: project.domain,
    prompts,
  };
}

/** The producer call a route or the cron sweep would make. */
function enqueueFor(tenant: Tenant, bucket: string, trigger: 'manual' | 'scheduled' = 'manual') {
  return producer.enqueueMeasurementRun({
    orgId: tenant.orgId,
    projectId: tenant.projectId,
    projectName: tenant.projectName,
    projectDomain: tenant.projectDomain,
    prompts: tenant.prompts,
    dataMode: 'demo',
    trigger,
    dedupeBucket: bucket,
  });
}

/** Run the real worker loop until the queue is empty. */
function drain(workerId: string, kinds?: readonly string[], options = {}) {
  return worker.startWorker({
    workerId,
    kinds: kinds ?? handlers.JOB_KINDS,
    exitWhenDrained: true,
    idleMinMs: 1,
    idleMaxMs: 1,
    // Long enough that the reaper does not fire mid-test and reclaim a lease a
    // test deliberately set up.
    reapIntervalMs: 3_600_000,
    ...options,
  }).done;
}

describe('producers', () => {
  it('creates a queued run and a queued job rather than measuring inline', async () => {
    const tenant = await seedTenant();
    const { jobId, runId, deduped } = await enqueueFor(tenant, 'bucket-1');

    expect(deduped).toBe(false);

    const job = await db.job.findUnique({ where: { id: jobId } });
    expect(job?.status).toBe('queued');
    expect(job?.kind).toBe(handlers.MEASUREMENT_RUN_KIND);
    expect(job?.orgId).toBe(tenant.orgId);

    // The run exists before any provider could have been contacted, so the
    // customer sees that they asked even if no worker ever picks it up.
    const run = await db.measurementRun.findUnique({ where: { id: runId } });
    expect(run?.status).toBe('queued');
    expect(await db.observation.count({ where: { runId } })).toBe(0);
  });

  it('never places a credential or a session in the payload', async () => {
    const tenant = await seedTenant();
    const { jobId } = await enqueueFor(tenant, 'bucket-secrets');

    const job = await db.job.findUnique({ where: { id: jobId } });
    const payload = JSON.parse(job!.payload) as Record<string, unknown>;

    // Constitutional invariant 10: a secret never reaches storage, and a job
    // row is storage like any other.
    expect(Object.keys(payload).sort()).toEqual(['projectId', 'runId', 'samplesPerPair', 'trigger']);
  });

  it('collapses a duplicate request into the same job and the same run', async () => {
    const tenant = await seedTenant();

    const first = await enqueueFor(tenant, 'same-bucket');
    const second = await enqueueFor(tenant, 'same-bucket');

    expect(second.jobId).toBe(first.jobId);
    expect(second.runId).toBe(first.runId);
    expect(second.deduped).toBe(true);

    // The point of the whole exercise: one click's worth of work, not two.
    expect(await db.job.count()).toBe(1);
    expect(await db.measurementRun.count()).toBe(1);
  });

  it('collapses simultaneous duplicate requests, which no read-then-write could', async () => {
    const tenant = await seedTenant();

    const results = await Promise.all([
      enqueueFor(tenant, 'race-bucket'),
      enqueueFor(tenant, 'race-bucket'),
      enqueueFor(tenant, 'race-bucket'),
    ]);

    const jobIds = new Set(results.map((r) => r.jobId));
    const runIds = new Set(results.map((r) => r.runId));

    expect(jobIds.size).toBe(1);
    expect(runIds.size).toBe(1);
    expect(await db.job.count()).toBe(1);

    // The losers of the race must not leave an orphan run that would show as
    // permanently queued in the dashboard.
    expect(await db.measurementRun.count()).toBe(1);
  });

  it('joins a run already in flight even when the dedupe bucket has moved on', async () => {
    const tenant = await seedTenant();
    const first = await enqueueFor(tenant, 'minute-1');

    // A user clicking again a minute later, while the first run is still queued.
    const second = await enqueueFor(tenant, 'minute-2');

    expect(second.jobId).toBe(first.jobId);
    expect(second.deduped).toBe(true);
    expect(await db.measurementRun.count()).toBe(1);
  });

  it('starts genuinely new work once the previous run has finished', async () => {
    const tenant = await seedTenant();
    const first = await enqueueFor(tenant, 'minute-1');
    await drain('w-sequential');

    const second = await enqueueFor(tenant, 'minute-2');

    expect(second.jobId).not.toBe(first.jobId);
    expect(second.runId).not.toBe(first.runId);
  });
});

describe('the worker', () => {
  it('carries a job from queued through to a finished run', async () => {
    const tenant = await seedTenant();
    const { jobId, runId } = await enqueueFor(tenant, 'happy-path');

    const stats = await drain('w-happy');

    expect(stats.claimed).toBe(1);
    expect(stats.succeeded).toBe(1);

    const job = await db.job.findUnique({ where: { id: jobId } });
    expect(job?.status).toBe('succeeded');
    expect(job?.lockedBy).toBeNull();

    const run = await db.measurementRun.findUnique({ where: { id: runId } });
    expect(['completed', 'partial']).toContain(run?.status);
    expect(run?.finishedAt).not.toBeNull();

    // Observations actually landed, and the run's cached totals agree with them.
    const observations = await db.observation.count({ where: { runId } });
    expect(observations).toBeGreaterThan(0);
    expect(run!.observedCount + run!.failedCount + run!.unavailableCount).toBe(observations);
  });

  it('sends a job of an unknown kind straight to dead rather than retrying it', async () => {
    const tenant = await seedTenant();
    const { id } = await queue.enqueue({
      kind: 'measurement.not-a-real-kind',
      orgId: tenant.orgId,
      projectId: tenant.projectId,
    });

    await drain('w-unknown', ['measurement.not-a-real-kind']);

    const job = await db.job.findUnique({ where: { id } });
    expect(job?.status).toBe('dead');
    expect(job?.errorCategory).toBe('permanent');
    expect(job?.attempts).toBe(1);
  });

  it('lets two workers make progress without either running the other one job', async () => {
    const a = await seedTenant('Alpha');
    const b = await seedTenant('Beta');
    const first = await enqueueFor(a, 'two-workers');
    const second = await enqueueFor(b, 'two-workers');

    const [statsA, statsB] = await Promise.all([drain('w-a'), drain('w-b')]);

    // Both jobs ran, exactly once each. Which worker got which is a race and is
    // deliberately not asserted; that no job ran twice is the property.
    expect(statsA.claimed + statsB.claimed).toBe(2);

    for (const id of [first.jobId, second.jobId]) {
      const job = await db.job.findUnique({ where: { id } });
      expect(job?.status).toBe('succeeded');
      expect(job?.attempts).toBe(1);
    }
  });
});

describe('worker loss', () => {
  it('recovers a job whose worker died holding it', async () => {
    const tenant = await seedTenant();
    const { jobId, runId } = await enqueueFor(tenant, 'lost-worker');

    // A worker claims the job and then vanishes without ever completing it.
    const claimed = await queue.claimNext('w-doomed', handlers.JOB_KINDS);
    expect(claimed?.id).toBe(jobId);

    await db.job.update({
      where: { id: jobId },
      data: { leaseExpiresAt: new Date(Date.now() - 1_000) },
    });

    const stats = await drain('w-rescuer');
    expect(stats.claimed).toBe(1);

    const job = await db.job.findUnique({ where: { id: jobId } });
    expect(job?.status).toBe('succeeded');
    // Two attempts: the one that died, and the one that finished.
    expect(job?.attempts).toBe(2);

    const run = await db.measurementRun.findUnique({ where: { id: runId } });
    expect(['completed', 'partial']).toContain(run?.status);
  });

  it('reaps a lapsed lease into a visible queued row rather than a silent re-run', async () => {
    const tenant = await seedTenant();
    const { jobId } = await enqueueFor(tenant, 'reaper');

    await queue.claimNext('w-doomed', handlers.JOB_KINDS);
    await db.job.update({
      where: { id: jobId },
      data: { leaseExpiresAt: new Date(Date.now() - 1_000) },
    });

    expect(await queue.reapExpiredLeases()).toBe(1);

    const job = await db.job.findUnique({ where: { id: jobId } });
    expect(job?.status).toBe('queued');
    expect(job?.lockedBy).toBeNull();
    // An operator reading the table at 3am can see what happened to it.
    expect(job?.errorCategory).toBe('lease_lost');
  });

  it('does not let a worker whose lease was taken over damage the job', async () => {
    const tenant = await seedTenant();
    const { jobId } = await enqueueFor(tenant, 'stale-writer');

    await queue.claimNext('w-first', handlers.JOB_KINDS);
    await db.job.update({
      where: { id: jobId },
      data: { leaseExpiresAt: new Date(Date.now() - 1_000) },
    });
    await queue.claimNext('w-second', handlers.JOB_KINDS);

    // The first worker wakes up and tries to finish the job it no longer holds.
    expect(await queue.renewLease(jobId, 'w-first')).toBe(false);
    await queue.markSucceeded(jobId, 'w-first');
    await queue.markFailed(jobId, 'w-first', new Error('stale'), 'permanent');

    const job = await db.job.findUnique({ where: { id: jobId } });
    expect(job?.status).toBe('running');
    expect(job?.lockedBy).toBe('w-second');
  });
});

describe('retry', () => {
  it('resumes a run without duplicating an observation it already recorded', async () => {
    const tenant = await seedTenant('Acme', 3);
    const { jobId, runId } = await enqueueFor(tenant, 'retry');

    await drain('w-first-pass');
    const afterFirst = await db.observation.count({ where: { runId } });
    expect(afterFirst).toBeGreaterThan(0);

    const fingerprint = async () =>
      (
        await db.observation.findMany({
          where: { runId },
          select: { promptId: true, engine: true, sampleIndex: true, observedAt: true },
          orderBy: [{ promptId: 'asc' }, { engine: 'asc' }, { sampleIndex: 'asc' }],
        })
      ).map((o) => `${o.promptId}|${o.engine}|${o.sampleIndex}|${o.observedAt.toISOString()}`);

    const before = await fingerprint();

    // Force the whole job to run again from the top, as a lease recovery would.
    await db.job.update({
      where: { id: jobId },
      data: { status: 'queued', lockedBy: null, leaseExpiresAt: null, runAfter: new Date() },
    });
    await db.measurementRun.update({ where: { id: runId }, data: { status: 'running' } });

    await drain('w-second-pass');

    // Not one extra row, and not one row rewritten: the same observations, with
    // the same timestamps. A duplicated observation is a duplicated charge.
    expect(await db.observation.count({ where: { runId } })).toBe(afterFirst);
    expect(await fingerprint()).toEqual(before);

    const run = await db.measurementRun.findUnique({ where: { id: runId } });
    expect(run!.observedCount + run!.failedCount + run!.unavailableCount).toBe(afterFirst);
  });

  it('fills only the gaps when a previous attempt got partway', async () => {
    const tenant = await seedTenant('Acme', 3);
    const { jobId, runId } = await enqueueFor(tenant, 'gap-fill');

    await drain('w-full');
    const complete = await db.observation.count({ where: { runId } });

    // Delete some observations to simulate an attempt that stopped halfway.
    const survivors = await db.observation.findMany({
      where: { runId },
      select: { id: true },
      take: 2,
    });
    await db.observation.deleteMany({
      where: { runId, id: { notIn: survivors.map((s) => s.id) } },
    });

    await db.job.update({
      where: { id: jobId },
      data: { status: 'queued', lockedBy: null, leaseExpiresAt: null },
    });
    await db.measurementRun.update({ where: { id: runId }, data: { status: 'running' } });

    await drain('w-gapfill');

    expect(await db.observation.count({ where: { runId } })).toBe(complete);
  });

  it('does not re-execute a run a previous attempt already finalised', async () => {
    const tenant = await seedTenant();
    const { jobId, runId } = await enqueueFor(tenant, 'already-done');

    await drain('w-once');
    const observations = await db.observation.count({ where: { runId } });
    const finishedAt = (await db.measurementRun.findUnique({ where: { id: runId } }))!.finishedAt;

    await db.job.update({
      where: { id: jobId },
      data: { status: 'queued', lockedBy: null, leaseExpiresAt: null },
    });
    await drain('w-again');

    expect(await db.observation.count({ where: { runId } })).toBe(observations);
    const run = await db.measurementRun.findUnique({ where: { id: runId } });
    // Not re-finalised, so the recorded completion time is still the real one.
    expect(run?.finishedAt?.toISOString()).toBe(finishedAt?.toISOString());
  });
});

describe('cancellation', () => {
  it('cancels a queued job outright', async () => {
    const tenant = await seedTenant();
    const { jobId } = await enqueueFor(tenant, 'cancel-queued');

    expect(await queue.requestCancel(jobId, tenant.orgId)).toBe('cancelled');

    const job = await db.job.findUnique({ where: { id: jobId } });
    expect(job?.status).toBe('cancelled');

    // And a worker must not then run it anyway.
    const stats = await drain('w-after-cancel');
    expect(stats.claimed).toBe(0);
  });

  it('stops a claimed job at its next checkpoint and keeps what it measured', async () => {
    const tenant = await seedTenant('Acme', 3);
    const { jobId, runId } = await enqueueFor(tenant, 'cancel-running');

    // Cancellation arrives after the job was claimed, which is the case the
    // checkpoint exists for: the handler is already inside `executeRun`.
    const claimed = await queue.claimNext('w-cancel', handlers.JOB_KINDS);
    expect(claimed?.id).toBe(jobId);
    expect(await queue.requestCancel(jobId, tenant.orgId)).toBe('requested');

    const handler = handlers.getHandler(handlers.MEASUREMENT_RUN_KIND)!;
    const outcome = await handler.run({
      jobId,
      orgId: claimed!.orgId,
      projectId: claimed!.projectId,
      payload: claimed!.payload,
      attempts: claimed!.attempts,
      maxAttempts: claimed!.maxAttempts,
      renewLease: () => queue.renewLease(jobId, 'w-cancel'),
      isCancelled: () => queue.isCancellationRequested(jobId),
      isShuttingDown: () => false,
    });

    expect(outcome.status).toBe('cancelled');

    const run = await db.measurementRun.findUnique({ where: { id: runId } });
    // `cancelled`, not `partial`: a human stopped it, and the status says which.
    expect(run?.status).toBe('cancelled');
    expect(run?.finishedAt).not.toBeNull();
  });

  it('refuses to cancel another tenant’s job', async () => {
    const mine = await seedTenant('Mine');
    const theirs = await seedTenant('Theirs');
    const { jobId } = await enqueueFor(theirs, 'cross-tenant-cancel');

    expect(await queue.requestCancel(jobId, mine.orgId)).toBe('not-found');

    const job = await db.job.findUnique({ where: { id: jobId } });
    expect(job?.status).toBe('queued');
    expect(job?.cancelRequestedAt).toBeNull();
  });
});

describe('failure classification', () => {
  /** A handler that fails on demand, so the loop's branches can be driven exactly. */
  function stubHandler(outcomes: Array<() => Promise<import('@/lib/jobs/handlers').JobOutcome>>) {
    let call = 0;
    return {
      kind: 'test.stub',
      run: async () => outcomes[Math.min(call++, outcomes.length - 1)](),
    };
  }

  async function queueStub(orgId: string) {
    return queue.enqueue({ kind: 'test.stub', orgId, maxAttempts: 3 });
  }

  it('retries a transient failure with backoff instead of giving up', async () => {
    const tenant = await seedTenant();
    const { id } = await queueStub(tenant.orgId);

    const handler = stubHandler([
      async () => ({ status: 'failed', category: 'transient', error: new Error('provider timed out') }),
    ]);

    await worker.startWorker({
      workerId: 'w-transient',
      kinds: ['test.stub'],
      maxIterations: 1,
      idleMinMs: 1,
      reapIntervalMs: 3_600_000,
      resolveHandler: () => handler,
    }).done;

    const job = await db.job.findUnique({ where: { id } });
    expect(job?.status).toBe('queued');
    expect(job?.errorCategory).toBe('transient');
    // Backoff moved it into the future, so it is not immediately re-claimable.
    expect(job!.runAfter.getTime()).toBeGreaterThanOrEqual(Date.now() - 1_000);
  });

  it('sends a permanent failure straight to dead without spending its attempts', async () => {
    const tenant = await seedTenant();
    const { id } = await queueStub(tenant.orgId);

    const handler = stubHandler([
      async () => ({ status: 'failed', category: 'permanent', error: new Error('project not found') }),
    ]);

    await worker.startWorker({
      workerId: 'w-permanent',
      kinds: ['test.stub'],
      maxIterations: 1,
      idleMinMs: 1,
      reapIntervalMs: 3_600_000,
      resolveHandler: () => handler,
    }).done;

    const job = await db.job.findUnique({ where: { id } });
    expect(job?.status).toBe('dead');
    expect(job?.attempts).toBe(1);
    expect(job?.errorCategory).toBe('permanent');
  });

  it('gives up once a retryable failure exhausts its attempts', async () => {
    const tenant = await seedTenant();
    const { id } = await queueStub(tenant.orgId);

    const handler = stubHandler([
      async () => ({ status: 'failed', category: 'transient', error: new Error('still down') }),
    ]);

    for (let attempt = 0; attempt < 3; attempt++) {
      // Clear the backoff so the test does not have to wait it out.
      await db.job.updateMany({ where: { id }, data: { runAfter: new Date() } });
      await worker.startWorker({
        workerId: `w-exhaust-${attempt}`,
        kinds: ['test.stub'],
        maxIterations: 1,
        idleMinMs: 1,
        reapIntervalMs: 3_600_000,
        resolveHandler: () => handler,
      }).done;
    }

    const job = await db.job.findUnique({ where: { id } });
    expect(job?.status).toBe('dead');
    expect(job?.attempts).toBe(3);
  });

  it('classifies an error a handler threw rather than returned', async () => {
    expect(worker.classifyThrown(new Error('Project not found for this organisation.'))).toBe('permanent');
    expect(worker.classifyThrown(new Error('socket hang up'))).toBe('transient');
    expect(worker.classifyThrown(new Error('429 rate limit exceeded'))).toBe('rate_limited');
    // Conservative by default: an unrecognised error is worth another attempt,
    // because wrongly giving up loses a customer's run.
    expect(worker.classifyThrown(new Error('something odd'))).toBe('unknown');
    expect(queue.isRetryable(worker.classifyThrown(new Error('something odd')))).toBe(true);
  });

  it('never writes a credential into the job row', async () => {
    const tenant = await seedTenant();
    const { id } = await queueStub(tenant.orgId);

    const handler = stubHandler([
      async () => ({
        status: 'failed',
        category: 'permanent',
        error: new Error('Provider rejected key sk-live-abcdefgh12345678 with 401'),
      }),
    ]);

    await worker.startWorker({
      workerId: 'w-secret',
      kinds: ['test.stub'],
      maxIterations: 1,
      idleMinMs: 1,
      reapIntervalMs: 3_600_000,
      resolveHandler: () => handler,
    }).done;

    const job = await db.job.findUnique({ where: { id } });
    expect(job?.lastError).not.toContain('sk-live-abcdefgh12345678');
    expect(job?.lastError).toContain('[redacted-key]');
  });

  it('closes the run out when the queue gives up, rather than leaving it running', async () => {
    const tenant = await seedTenant();
    const { runId } = await enqueueFor(tenant, 'gave-up');

    // The job is dead; the run must not keep telling the customer it is working.
    await db.measurementRun.update({ where: { id: runId }, data: { status: 'running' } });

    const handler = handlers.getHandler(handlers.MEASUREMENT_RUN_KIND)!;
    await handler.onGaveUp!(
      {
        jobId: 'job_x',
        orgId: tenant.orgId,
        projectId: tenant.projectId,
        payload: { runId, projectId: tenant.projectId, samplesPerPair: 1, trigger: 'manual' },
        attempts: 5,
        maxAttempts: 5,
        renewLease: async () => false,
        isCancelled: async () => false,
        isShuttingDown: () => false,
      },
      new Error('Provider unreachable with token Bearer abcdefgh12345678'),
    );

    const run = await db.measurementRun.findUnique({ where: { id: runId } });
    expect(['failed', 'partial']).toContain(run?.status);
    expect(run?.finishedAt).not.toBeNull();
    // The message reaches a dashboard, so it is redacted like any other.
    expect(run?.error).not.toContain('abcdefgh12345678');
  });
});

describe('graceful shutdown', () => {
  it('stops the run at a checkpoint and leaves it resumable rather than finished', async () => {
    const tenant = await seedTenant('Acme', 4);
    const { jobId, runId } = await enqueueFor(tenant, 'shutdown');

    const claimed = await queue.claimNext('w-draining', handlers.JOB_KINDS);
    const handler = handlers.getHandler(handlers.MEASUREMENT_RUN_KIND)!;

    // Shutdown is requested after the first checkpoint has already passed, so
    // the run is genuinely mid-flight rather than never started.
    let checkpoints = 0;
    const outcome = await handler.run({
      jobId,
      orgId: claimed!.orgId,
      projectId: claimed!.projectId,
      payload: claimed!.payload,
      attempts: claimed!.attempts,
      maxAttempts: claimed!.maxAttempts,
      renewLease: () => queue.renewLease(jobId, 'w-draining'),
      isCancelled: async () => false,
      isShuttingDown: () => ++checkpoints > 1,
    });

    expect(outcome.status).toBe('suspended');

    const run = await db.measurementRun.findUnique({ where: { id: runId } });
    // Still `running`, deliberately. A terminal status here would report a
    // deploy as a finished measurement.
    expect(run?.status).toBe('running');
    expect(run?.finishedAt).toBeNull();

    // What it did measure before stopping is durable.
    const partial = await db.observation.count({ where: { runId } });
    expect(partial).toBeGreaterThan(0);

    // The worker hands the job back rather than dropping it.
    expect(await queue.releaseForShutdown(jobId, 'w-draining')).toBe(true);
    const job = await db.job.findUnique({ where: { id: jobId } });
    expect(job?.status).toBe('queued');
    expect(job?.lockedBy).toBeNull();
    // The attempt is not refunded: a crash-looping deploy must still be able to
    // exhaust a job rather than handing it back forever.
    expect(job?.attempts).toBe(1);
    expect(job?.lastError).toContain('shut down');

    // And the next worker finishes it without redoing what was already done.
    await drain('w-resumer');
    const finished = await db.measurementRun.findUnique({ where: { id: runId } });
    expect(['completed', 'partial']).toContain(finished?.status);
    expect(await db.observation.count({ where: { runId } })).toBeGreaterThanOrEqual(partial);
  });

  it('finishes the job in hand and claims no more once shutdown is requested', async () => {
    const tenant = await seedTenant();
    const first = await queue.enqueue({ kind: 'test.stub', orgId: tenant.orgId });
    const second = await queue.enqueue({ kind: 'test.stub', orgId: tenant.orgId });

    // The signal arrives while the worker is inside a job, which is the case
    // that matters: a deploy does not wait for a convenient moment.
    let handle: import('@/worker/index').WorkerHandle;
    const handler = {
      kind: 'test.stub',
      run: async () => {
        handle.stop();
        return { status: 'succeeded' } as const;
      },
    };

    handle = worker.startWorker({
      workerId: 'w-draining-loop',
      kinds: ['test.stub'],
      idleMinMs: 1,
      reapIntervalMs: 3_600_000,
      resolveHandler: () => handler,
    });
    const stats = await handle.done;

    // Exactly one: the one it was already committed to.
    expect(stats.claimed).toBe(1);
    expect(stats.succeeded).toBe(1);

    const statuses = await Promise.all(
      [first.id, second.id].map(async (id) => (await db.job.findUnique({ where: { id } }))?.status),
    );
    // One finished, one untouched and still waiting for another worker.
    expect(statuses.filter((s) => s === 'succeeded')).toHaveLength(1);
    expect(statuses.filter((s) => s === 'queued')).toHaveLength(1);
  });
});

describe('tenant isolation', () => {
  it('refuses to run a job whose payload points at another tenant’s project', async () => {
    const mine = await seedTenant('Mine');
    const theirs = await seedTenant('Theirs');
    const stolen = await enqueueFor(theirs, 'isolation');

    // A job row owned by one org, carrying another org's project and run.
    const { id } = await queue.enqueue({
      kind: handlers.MEASUREMENT_RUN_KIND,
      orgId: mine.orgId,
      projectId: theirs.projectId,
      payload: {
        runId: stolen.runId,
        projectId: theirs.projectId,
        samplesPerPair: 1,
        trigger: 'manual',
      },
    });

    // Claim it directly so the victim's own queued job is not the one that runs.
    await db.job.update({ where: { id: stolen.jobId }, data: { runAfter: new Date(Date.now() + 60_000) } });

    await drain('w-isolation');

    const job = await db.job.findUnique({ where: { id } });
    expect(job?.status).toBe('dead');
    expect(job?.errorCategory).toBe('permanent');

    // Nothing was written against the other tenant's run.
    expect(await db.observation.count({ where: { runId: stolen.runId } })).toBe(0);
    const victimRun = await db.measurementRun.findUnique({ where: { id: stolen.runId } });
    expect(victimRun?.status).toBe('queued');
  });

  it('keeps each tenant’s observations attached to its own run', async () => {
    const a = await seedTenant('Alpha');
    const b = await seedTenant('Beta');
    const runA = await enqueueFor(a, 'iso-a');
    const runB = await enqueueFor(b, 'iso-b');

    await drain('w-both');

    const observationsA = await db.observation.findMany({ where: { runId: runA.runId } });
    const observationsB = await db.observation.findMany({ where: { runId: runB.runId } });

    expect(observationsA.length).toBeGreaterThan(0);
    expect(observationsB.length).toBeGreaterThan(0);

    const promptsA = new Set(a.prompts.map((p) => p.id));
    const promptsB = new Set(b.prompts.map((p) => p.id));
    expect(observationsA.every((o) => promptsA.has(o.promptId))).toBe(true);
    expect(observationsB.every((o) => promptsB.has(o.promptId))).toBe(true);

    const storedA = await db.measurementRun.findUnique({ where: { id: runA.runId } });
    expect(storedA?.orgId).toBe(a.orgId);
  });

  it('rejects a malformed payload permanently rather than guessing', async () => {
    const tenant = await seedTenant();
    const { id } = await queue.enqueue({
      kind: handlers.MEASUREMENT_RUN_KIND,
      orgId: tenant.orgId,
      projectId: tenant.projectId,
      payload: { projectId: tenant.projectId },
    });

    await drain('w-malformed');

    const job = await db.job.findUnique({ where: { id } });
    expect(job?.status).toBe('dead');
    expect(job?.errorCategory).toBe('permanent');
    expect(job?.attempts).toBe(1);
  });
});

describe('the scheduled sweep', () => {
  const SECRET = 'cron-secret-for-tests';

  function tick(query = '') {
    return cron.POST(
      new Request(`https://app.test/api/cron/run-checks${query}`, {
        method: 'POST',
        headers: { authorization: `Bearer ${SECRET}` },
      }),
    );
  }

  beforeEach(() => {
    process.env.CRON_SECRET = SECRET;
  });

  it('refuses an unauthenticated caller rather than burning provider quota', async () => {
    const res = await cron.POST(
      new Request('https://app.test/api/cron/run-checks', { method: 'POST' }),
    );
    expect(res.status).toBe(401);
    expect(await db.job.count()).toBe(0);
  });

  it('enqueues due work instead of running it inside the request', async () => {
    await seedTenant('Scheduled');

    const body = await (await tick()).json();
    expect(body.ok).toBe(true);
    expect(body.projectsQueued).toBe(1);

    const job = await db.job.findFirst();
    expect(job?.status).toBe('queued');
    expect(JSON.parse(job!.payload).trigger).toBe('scheduled');

    // Nothing was measured by the request itself.
    expect(await db.observation.count()).toBe(0);
  });

  it('does not enqueue a second job when delivered twice in the same period', async () => {
    await seedTenant('Scheduled');

    await tick();
    const second = await (await tick()).json();

    // Either the sweep is skipped or the enqueue dedupes — both are correct,
    // and neither may produce a second run.
    expect(second.projectsQueued ?? 0).toBe(0);
    expect(await db.job.count()).toBe(1);
    expect(await db.measurementRun.count()).toBe(1);
  });

  it('lets only one of two overlapping deliveries sweep', async () => {
    await seedTenant('Scheduled');

    const [a, b] = await Promise.all([tick(), tick()]);
    const bodies = await Promise.all([a.json(), b.json()]);

    // The lock exists precisely so two cron deliveries cannot both sweep. Both
    // responses are 200: a skipped tick is the correct outcome, not an error.
    expect(a.status).toBe(200);
    expect(b.status).toBe(200);
    expect(await db.job.count()).toBe(1);
    expect(await db.measurementRun.count()).toBe(1);
    expect(bodies.filter((x) => x.skipped === true).length).toBeLessThanOrEqual(1);
  });

  it('leaves a project alone until its plan says it is due', async () => {
    const tenant = await seedTenant('Scheduled');
    await enqueueFor(tenant, 'already-ran', 'scheduled');
    await drain('w-cron-first');

    const body = await (await tick()).json();
    const row = body.results.find((r: { project: string }) => r.project === 'Scheduled');
    expect(row.status).toBe('not-due');
    expect(await db.measurementRun.count()).toBe(1);
  });

  it('skips a project with no prompts rather than queueing empty work', async () => {
    const tenant = await seedTenant('Empty');
    await db.aiPrompt.deleteMany({ where: { projectId: tenant.projectId } });

    const body = await (await tick()).json();
    const row = body.results.find((r: { project: string }) => r.project === 'Empty');
    expect(row.status).toBe('skipped');
    expect(await db.job.count()).toBe(0);
  });

  it('releases its lock so the next delivery is not locked out', async () => {
    await seedTenant('Scheduled');
    await tick();
    expect(await db.jobLock.findUnique({ where: { key: 'cron:run-checks' } })).toBeNull();
  });
});
