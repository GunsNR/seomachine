import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The contract the dashboard actually depends on.
 *
 * The run button used to await the whole measurement inside one POST and read
 * coverage straight off the response. Now it gets an acknowledgement and polls.
 * These tests run the real route handlers against real PostgreSQL and a real
 * worker, because the thing worth proving is that the two halves agree: that
 * what POST hands back is enough to find the run, that GET reports every state
 * truthfully as it changes, and that polling is told when to stop.
 *
 * Only the session is faked. Everything else is the code that ships.
 */

import { createTestDatabase, type TestDatabase } from './helpers/test-database';

let database: TestDatabase;

const session = {
  current: null as null | { id: string; email: string; name: string; orgId: string; sid: string; role: string },
};

vi.mock('@/lib/auth', () => ({
  getSession: async () => session.current,
}));

type Route = typeof import('@/app/api/app/run-check/route');
type WorkerMod = typeof import('@/worker/index');
type HandlersMod = typeof import('@/lib/jobs/handlers');
type QueueMod = typeof import('@/lib/jobs/queue');
type DbMod = typeof import('@/lib/db');

let route: Route;
let worker: WorkerMod;
let handlers: HandlersMod;
let queue: QueueMod;
let db: DbMod['db'];

beforeAll(async () => {
  database = await createTestDatabase('run_check_api');

  route = await import('@/app/api/app/run-check/route');
  worker = await import('@/worker/index');
  handlers = await import('@/lib/jobs/handlers');
  queue = await import('@/lib/jobs/queue');
  db = (await import('@/lib/db')).db;
});

afterAll(async () => {
  await db?.$disconnect();
  await database?.drop();
});

let orgId = '';
let projectId = '';

beforeEach(async () => {
  await db.job.deleteMany({});
  await db.jobLock.deleteMany({});
  await db.observation.deleteMany({});
  await db.measurementRun.deleteMany({});
  await db.aiPrompt.deleteMany({});
  await db.project.deleteMany({});
  await db.organization.deleteMany({});

  const org = await db.organization.create({ data: { name: 'Acme Org', dataMode: 'demo' } });
  const project = await db.project.create({
    data: { orgId: org.id, name: 'Acme', domain: 'acme.example', dataMode: 'demo' },
  });
  await db.aiPrompt.create({ data: { projectId: project.id, text: 'Best SEO tool?' } });
  await db.aiPrompt.create({ data: { projectId: project.id, text: 'Best rank tracker?' } });

  orgId = org.id;
  projectId = project.id;
  signIn('owner');
});

function signIn(role: string, org = orgId) {
  session.current = { id: 'user_1', email: 'a@b.test', name: 'A', orgId: org, sid: 'sess_1', role };
}

function post(body: unknown) {
  return route.POST(
    new Request('https://app.test/api/app/run-check', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }),
  );
}

function status(query: string) {
  return route.GET(new Request(`https://app.test/api/app/run-check?${query}`));
}

function cancel(jobId: string) {
  return route.DELETE(
    new Request(`https://app.test/api/app/run-check?jobId=${jobId}`, { method: 'DELETE' }),
  );
}

const drain = (workerId: string) =>
  worker.startWorker({
    workerId,
    kinds: handlers.JOB_KINDS,
    exitWhenDrained: true,
    idleMinMs: 1,
    idleMaxMs: 1,
    reapIntervalMs: 3_600_000,
  }).done;

describe('POST — queueing', () => {
  it('accepts the work rather than claiming to have done it', async () => {
    const res = await post({ projectId });
    const body = await res.json();

    // 202: accepted, not performed. The distinction is the whole change.
    expect(res.status).toBe(202);
    expect(body.queued).toBe(true);
    expect(body.status).toBe('queued');
    expect(body.jobId).toBeTruthy();
    expect(body.runId).toBeTruthy();

    // No coverage, no observed count, no cost: none of them exist yet, and a
    // zero would be indistinguishable from a run that measured nothing.
    expect(body).not.toHaveProperty('coverage');
    expect(body).not.toHaveProperty('observed');
  });

  it('returns the same run for a double click instead of billing twice', async () => {
    const first = await (await post({ projectId })).json();
    const second = await (await post({ projectId })).json();

    expect(second.jobId).toBe(first.jobId);
    expect(second.runId).toBe(first.runId);
    expect(second.deduped).toBe(true);
    expect(await db.measurementRun.count()).toBe(1);
  });

  it('refuses a role that cannot run measurements', async () => {
    signIn('viewer');
    expect((await post({ projectId })).status).toBe(403);
    expect(await db.job.count()).toBe(0);
  });

  it('refuses an unauthenticated caller', async () => {
    session.current = null;
    expect((await post({ projectId })).status).toBe(401);
  });

  it('will not queue a run for another tenant’s project', async () => {
    const other = await db.organization.create({ data: { name: 'Other' } });
    signIn('owner', other.id);

    // 404, not 403: whether the project exists is not something to disclose.
    expect((await post({ projectId })).status).toBe(404);
    expect(await db.job.count()).toBe(0);
  });

  it('explains a project with no prompts instead of queueing empty work', async () => {
    await db.aiPrompt.deleteMany({ where: { projectId } });
    const res = await post({ projectId });

    expect(res.status).toBe(422);
    expect(await db.job.count()).toBe(0);
  });
});

describe('GET — the polling contract', () => {
  it('reports queued before a worker has touched it', async () => {
    const { jobId } = await (await post({ projectId })).json();
    const body = await (await status(`jobId=${jobId}`)).json();

    expect(body.job.status).toBe('queued');
    expect(body.run.status).toBe('queued');
    expect(body.run.attempted).toBe(0);
    // Nothing is finished, so polling must continue.
    expect(body.terminal).toBe(false);
  });

  it('reports the finished run and tells the client to stop polling', async () => {
    const { jobId, runId } = await (await post({ projectId })).json();

    await drain('w-api');

    const body = await (await status(`jobId=${jobId}`)).json();

    expect(body.job.status).toBe('succeeded');
    expect(['completed', 'partial']).toContain(body.run.status);
    expect(body.runId).toBe(runId);
    expect(body.run.attempted).toBeGreaterThan(0);
    expect(body.run.observed).toBeGreaterThan(0);
    expect(body.terminal).toBe(true);
  });

  it('counts progress from observations, not from a column written at the end', async () => {
    const { jobId, runId } = await (await post({ projectId })).json();

    // Mid-run: the run row is `running` and its cached totals are still zero,
    // but observations have landed. The status must show what has actually been
    // measured, not the placeholder.
    await db.measurementRun.update({ where: { id: runId }, data: { status: 'running' } });
    const prompt = await db.aiPrompt.findFirst({ where: { projectId } });
    await db.observation.create({
      data: { runId, promptId: prompt!.id, engine: 'chatgpt', sampleIndex: 0, status: 'simulated' },
    });

    const body = await (await status(`jobId=${jobId}`)).json();
    expect(body.run.attempted).toBe(1);
    expect(body.run.observed).toBe(1);
    expect(body.terminal).toBe(false);
  });

  it('surfaces a retry as a retry rather than as ordinary progress', async () => {
    const { jobId } = await (await post({ projectId })).json();
    await db.job.update({
      where: { id: jobId },
      data: {
        attempts: 2,
        status: 'queued',
        runAfter: new Date(Date.now() + 60_000),
        lastError: 'Provider timed out.',
        errorCategory: 'transient',
      },
    });

    const body = await (await status(`jobId=${jobId}`)).json();
    expect(body.job.attempts).toBe(2);
    expect(body.job.errorCategory).toBe('transient');
    expect(body.job.nextAttemptAt).toBeTruthy();
    expect(body.terminal).toBe(false);
  });

  it('never exposes a credential or a stack trace in an error', async () => {
    const { jobId } = await (await post({ projectId })).json();
    await queue.markFailed(
      jobId,
      '',
      new Error('Provider rejected sk-live-abcdefgh12345678\n    at Object.<anonymous>'),
      'permanent',
    );
    // markFailed is scoped to the lock holder, so write the row the way a real
    // failure would have left it.
    await db.job.update({
      where: { id: jobId },
      data: {
        status: 'dead',
        lastError: queue.redact(new Error('Provider rejected sk-live-abcdefgh12345678')),
        errorCategory: 'permanent',
      },
    });

    const body = await (await status(`jobId=${jobId}`)).json();
    expect(body.job.error).not.toContain('sk-live-abcdefgh12345678');
    expect(body.job.error).not.toContain('at Object.');
    expect(body.job.error).toContain('[redacted-key]');
  });

  it('hides another tenant’s run behind the same 404 as one that does not exist', async () => {
    const { jobId } = await (await post({ projectId })).json();

    const other = await db.organization.create({ data: { name: 'Other' } });
    signIn('owner', other.id);

    expect((await status(`jobId=${jobId}`)).status).toBe(404);
    expect((await status('jobId=job_does_not_exist')).status).toBe(404);
  });

  it('asks for an identifier rather than guessing which run is meant', async () => {
    expect((await status('')).status).toBe(400);
  });
});

describe('DELETE — cancellation', () => {
  it('cancels a queued run and closes the run row out', async () => {
    const { jobId, runId } = await (await post({ projectId })).json();

    const res = await cancel(jobId);
    expect(res.status).toBe(200);
    expect((await res.json()).outcome).toBe('cancelled');

    const body = await (await status(`jobId=${jobId}`)).json();
    expect(body.job.status).toBe('cancelled');
    // `cancelled`, not left queued forever: nothing else was ever going to
    // touch this run.
    expect(body.run.status).toBe('cancelled');
    expect(body.terminal).toBe(true);

    // And no worker picks it up afterwards.
    const stats = await drain('w-cancelled');
    expect(stats.claimed).toBe(0);
  });

  it('marks a running run for cancellation instead of tearing it up mid-write', async () => {
    const { jobId, runId } = await (await post({ projectId })).json();
    await queue.claimNext('w-holder', handlers.JOB_KINDS);

    expect((await (await cancel(jobId)).json()).outcome).toBe('requested');

    const body = await (await status(`jobId=${jobId}`)).json();
    expect(body.job.cancelRequested).toBe(true);
    // Still running until the handler reaches its checkpoint, and the status
    // says exactly that rather than claiming it already stopped.
    expect(body.job.status).toBe('running');
    expect(body.terminal).toBe(false);

    const run = await db.measurementRun.findUnique({ where: { id: runId } });
    expect(run?.status).not.toBe('cancelled');
  });

  it('reports a run that already finished rather than pretending to cancel it', async () => {
    const { jobId } = await (await post({ projectId })).json();
    await drain('w-finished');

    expect((await cancel(jobId)).status).toBe(409);
  });

  it('refuses to cancel another tenant’s run', async () => {
    const { jobId } = await (await post({ projectId })).json();
    const other = await db.organization.create({ data: { name: 'Other' } });
    signIn('owner', other.id);

    expect((await cancel(jobId)).status).toBe(404);

    const job = await db.job.findUnique({ where: { id: jobId } });
    expect(job?.cancelRequestedAt).toBeNull();
  });

  it('refuses a role that cannot run measurements', async () => {
    const { jobId } = await (await post({ projectId })).json();
    signIn('viewer');
    expect((await cancel(jobId)).status).toBe(403);
  });
});

describe('the whole journey', () => {
  it('goes click → queued → running → completed, and only then stops polling', async () => {
    const queuedAt = await (await post({ projectId })).json();
    const seen: string[] = [];

    const snapshot = async () => {
      const body = await (await status(`jobId=${queuedAt.jobId}`)).json();
      seen.push(`${body.job.status}/${body.run.status}`);
      return body;
    };

    expect((await snapshot()).terminal).toBe(false);

    // Mid-flight, as the dashboard would see it between polls.
    await queue.claimNext('w-journey', handlers.JOB_KINDS);
    await db.measurementRun.update({ where: { id: queuedAt.runId }, data: { status: 'running' } });
    expect((await snapshot()).terminal).toBe(false);

    // Hand it back so the real worker finishes it exactly as it would have.
    await queue.releaseForShutdown(queuedAt.jobId, 'w-journey');
    await drain('w-journey-2');

    const final = await snapshot();
    expect(final.terminal).toBe(true);
    expect(['completed', 'partial']).toContain(final.run.status);
    expect(final.run.observed).toBeGreaterThan(0);

    expect(seen).toEqual([
      'queued/queued',
      'running/running',
      expect.stringMatching(/^succeeded\/(completed|partial)$/),
    ]);
  });
});
