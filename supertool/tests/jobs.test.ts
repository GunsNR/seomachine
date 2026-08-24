import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

/**
 * The durable job system, against real PostgreSQL.
 *
 * Every property worth testing here is a property of concurrency and of the
 * schema, not of the calling code: whether two workers can claim the same job,
 * whether a uniqueness constraint actually rejects a duplicate, whether a lease
 * that lapsed is genuinely re-claimable. A mocked client would agree with all
 * of them regardless of whether they hold.
 */

import { createTestDatabase, type TestDatabase } from './helpers/test-database';

let database: TestDatabase;

type QueueMod = typeof import('@/lib/jobs/queue');
type LockMod = typeof import('@/lib/jobs/lock');
type DbMod = typeof import('@/lib/db');

let queue: QueueMod;
let lock: LockMod;
let db: DbMod['db'];

beforeAll(async () => {
  database = await createTestDatabase('jobs');

  queue = await import('@/lib/jobs/queue');
  lock = await import('@/lib/jobs/lock');
  db = (await import('@/lib/db')).db;
});

afterAll(async () => {
  await db?.$disconnect();
  await database?.drop();
});

beforeEach(async () => {
  await db.job.deleteMany({});
  await db.jobLock.deleteMany({});
});

const ORG = 'org_test';

describe('enqueue', () => {
  it('creates a queued job', async () => {
    const { id, deduped } = await queue.enqueue({ kind: 'measurement-run', orgId: ORG });
    expect(deduped).toBe(false);

    const row = await db.job.findUnique({ where: { id } });
    expect(row?.status).toBe('queued');
    expect(row?.attempts).toBe(0);
  });

  it('deduplicates on an idempotency key rather than creating a second job', async () => {
    // The user double-clicking "run" must not pay for two runs.
    const key = queue.idempotencyKeyFor('project_1', '2026-08-24');
    const first = await queue.enqueue({ kind: 'measurement-run', orgId: ORG, idempotencyKey: key });
    const second = await queue.enqueue({ kind: 'measurement-run', orgId: ORG, idempotencyKey: key });

    expect(second.deduped).toBe(true);
    expect(second.id).toBe(first.id);
    expect(await db.job.count()).toBe(1);
  });

  it('is genuinely constrained by the database, not just by the read-before-write', async () => {
    const key = queue.idempotencyKeyFor('project_2');
    await queue.enqueue({ kind: 'x', orgId: ORG, idempotencyKey: key });

    // Bypassing enqueue entirely: the constraint itself must reject this.
    await expect(
      db.job.create({ data: { kind: 'x', orgId: ORG, idempotencyKey: key } }),
    ).rejects.toThrow();
  });

  it('allows many jobs with no idempotency key', async () => {
    await queue.enqueue({ kind: 'x', orgId: ORG });
    await queue.enqueue({ kind: 'x', orgId: ORG });
    expect(await db.job.count()).toBe(2);
  });
});

describe('claiming', () => {
  it('gives a job to exactly one of two concurrent workers', async () => {
    await queue.enqueue({ kind: 'solo', orgId: ORG });

    const [a, b] = await Promise.all([
      queue.claimNext('worker-a', ['solo']),
      queue.claimNext('worker-b', ['solo']),
    ]);

    const winners = [a, b].filter(Boolean);
    expect(winners).toHaveLength(1);
  });

  it('does not return a job whose runAfter is in the future', async () => {
    await queue.enqueue({
      kind: 'later',
      orgId: ORG,
      runAfter: new Date(Date.now() + 60_000),
    });
    expect(await queue.claimNext('w', ['later'])).toBeNull();
  });

  it('respects priority, then age', async () => {
    await queue.enqueue({ kind: 'p', orgId: ORG, priority: 200, payload: { tag: 'low' } });
    await queue.enqueue({ kind: 'p', orgId: ORG, priority: 10, payload: { tag: 'high' } });

    const claimed = await queue.claimNext('w', ['p']);
    expect(claimed?.payload.tag).toBe('high');
  });

  it('increments the attempt counter on claim', async () => {
    await queue.enqueue({ kind: 'a', orgId: ORG });
    const claimed = await queue.claimNext('w', ['a']);
    expect(claimed?.attempts).toBe(1);
  });

  it('never claims a job that was asked to cancel', async () => {
    const { id } = await queue.enqueue({ kind: 'c', orgId: ORG });
    await db.job.update({ where: { id }, data: { cancelRequestedAt: new Date() } });
    expect(await queue.claimNext('w', ['c'])).toBeNull();
  });

  it('filters by kind so a worker only takes work it understands', async () => {
    await queue.enqueue({ kind: 'audit', orgId: ORG });
    expect(await queue.claimNext('w', ['measurement-run'])).toBeNull();
    expect(await queue.claimNext('w', ['audit'])).not.toBeNull();
  });
});

describe('lease expiry is the crash-recovery path', () => {
  it('re-claims a running job whose lease lapsed', async () => {
    const { id } = await queue.enqueue({ kind: 'r', orgId: ORG });
    await queue.claimNext('dead-worker', ['r']);

    // Simulate the worker dying: the lease is left behind, already expired.
    await db.job.update({
      where: { id },
      data: { leaseExpiresAt: new Date(Date.now() - 1000) },
    });

    const reclaimed = await queue.claimNext('live-worker', ['r']);
    expect(reclaimed?.id).toBe(id);
    // Second attempt, so a permanently-crashing job still exhausts its budget.
    expect(reclaimed?.attempts).toBe(2);
  });

  it('will not re-claim a job whose lease is still live', async () => {
    await queue.enqueue({ kind: 'live', orgId: ORG });
    await queue.claimNext('worker-a', ['live']);
    expect(await queue.claimNext('worker-b', ['live'])).toBeNull();
  });

  it('renews only for the worker that holds the lease', async () => {
    const { id } = await queue.enqueue({ kind: 'ren', orgId: ORG });
    await queue.claimNext('worker-a', ['ren']);

    expect(await queue.renewLease(id, 'worker-a')).toBe(true);
    // A worker that lost its lease must discover that and stop.
    expect(await queue.renewLease(id, 'worker-b')).toBe(false);
  });

  it('reaps lapsed leases back to queued', async () => {
    const { id } = await queue.enqueue({ kind: 'reap', orgId: ORG });
    await queue.claimNext('gone', ['reap']);
    await db.job.update({ where: { id }, data: { leaseExpiresAt: new Date(Date.now() - 1) } });

    expect(await queue.reapExpiredLeases()).toBe(1);
    const row = await db.job.findUnique({ where: { id } });
    expect(row?.status).toBe('queued');
    expect(row?.errorCategory).toBe('lease_lost');
  });
});

describe('failure classification decides retry', () => {
  it('retries a transient failure with backoff', async () => {
    const { id } = await queue.enqueue({ kind: 'f', orgId: ORG, maxAttempts: 3 });
    await queue.claimNext('w', ['f']);

    const outcome = await queue.markFailed(id, 'w', new Error('socket hang up'), 'transient');
    expect(outcome).toBe('retrying');

    const row = await db.job.findUnique({ where: { id } });
    expect(row?.status).toBe('queued');
    expect(row?.runAfter.getTime()).toBeGreaterThanOrEqual(Date.now() - 1000);
  });

  it('does not retry a permanent failure even with attempts left', async () => {
    // Retrying a permanently-broken job five times wastes five slots and
    // delays everything behind it.
    const { id } = await queue.enqueue({ kind: 'perm', orgId: ORG, maxAttempts: 5 });
    await queue.claimNext('w', ['perm']);

    expect(await queue.markFailed(id, 'w', new Error('no such project'), 'permanent')).toBe('dead');
    expect((await db.job.findUnique({ where: { id } }))?.status).toBe('dead');
  });

  it('gives up once the attempt budget is spent', async () => {
    const { id } = await queue.enqueue({ kind: 'budget', orgId: ORG, maxAttempts: 1 });
    await queue.claimNext('w', ['budget']);
    expect(await queue.markFailed(id, 'w', new Error('flaky'), 'transient')).toBe('dead');
  });

  it('distinguishes dead from failed so a queue reads correctly at 3am', async () => {
    const { id } = await queue.enqueue({ kind: 'd', orgId: ORG, maxAttempts: 1 });
    await queue.claimNext('w', ['d']);
    await queue.markFailed(id, 'w', new Error('x'), 'permanent');
    // 'dead' means gave up; 'failed' would mean one attempt failed.
    expect((await db.job.findUnique({ where: { id } }))?.status).toBe('dead');
  });
});

describe('backoff', () => {
  it('grows exponentially and is capped', () => {
    const noJitter = () => 1;
    expect(queue.backoffMs(1, noJitter)).toBe(10_000);
    expect(queue.backoffMs(2, noJitter)).toBe(20_000);
    expect(queue.backoffMs(3, noJitter)).toBe(40_000);
    expect(queue.backoffMs(99, noJitter)).toBe(15 * 60_000);
  });

  it('applies jitter so a provider outage does not produce a synchronised retry storm', () => {
    // Without jitter, fifty jobs failing together retry together, and the
    // retry storm is what keeps the provider down.
    expect(queue.backoffMs(3, () => 0)).toBe(0);
    expect(queue.backoffMs(3, () => 0.5)).toBe(20_000);
    expect(queue.backoffMs(3, () => 1)).toBe(40_000);
  });
});

describe('cancellation', () => {
  it('cancels a queued job immediately', async () => {
    const { id } = await queue.enqueue({ kind: 'q', orgId: ORG });
    expect(await queue.requestCancel(id, ORG)).toBe('cancelled');
    expect((await db.job.findUnique({ where: { id } }))?.status).toBe('cancelled');
  });

  it('only marks a running job, so durable work is not torn up mid-transaction', async () => {
    const { id } = await queue.enqueue({ kind: 'run', orgId: ORG });
    await queue.claimNext('w', ['run']);

    expect(await queue.requestCancel(id, ORG)).toBe('requested');
    const row = await db.job.findUnique({ where: { id } });
    expect(row?.status).toBe('running');
    expect(row?.cancelRequestedAt).not.toBeNull();
    expect(await queue.isCancellationRequested(id)).toBe(true);
  });

  it('refuses to cancel another tenant’s job', async () => {
    const { id } = await queue.enqueue({ kind: 'x', orgId: ORG });
    // Indistinguishable from "does not exist", deliberately.
    expect(await queue.requestCancel(id, 'someone-else')).toBe('not-found');
    expect((await db.job.findUnique({ where: { id } }))?.status).toBe('queued');
  });
});

describe('error text never carries a secret', () => {
  it('redacts provider keys, bearer tokens and query credentials', () => {
    expect(queue.redact(new Error('bad key sk-abcdefghijklmnop'))).not.toContain('abcdefghij');
    expect(queue.redact(new Error('rejected rlst_AbCdEfGhIjKlMnOp'))).toContain('[redacted-key]');
    expect(queue.redact(new Error('Authorization: Bearer abcdef123456'))).toContain('[redacted]');
    expect(queue.redact(new Error('GET /v1?api_key=supersecret&x=1'))).not.toContain('supersecret');
  });

  it('truncates so one enormous provider error cannot bloat the table', () => {
    expect(queue.redact(new Error('x'.repeat(5000))).length).toBeLessThanOrEqual(500);
  });

  it('survives a non-Error throw', () => {
    expect(queue.redact('plain string')).toBe('plain string');
    expect(queue.redact(null)).toBe('Unknown error');
  });
});

describe('named locks', () => {
  it('lets exactly one holder in', async () => {
    expect(await lock.acquireLock('sweep', 'a', 60_000)).not.toBeNull();
    expect(await lock.acquireLock('sweep', 'b', 60_000)).toBeNull();
  });

  it('lets a lapsed lease be taken over, so a crash does not block forever', async () => {
    await lock.acquireLock('sweep', 'dead', 60_000);
    await db.jobLock.update({
      where: { key: 'sweep' },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });

    expect(await lock.acquireLock('sweep', 'live', 60_000)).not.toBeNull();
  });

  it('renews only for the current holder', async () => {
    await lock.acquireLock('sweep', 'a', 60_000);
    expect(await lock.renewLock('sweep', 'a', 60_000)).toBe(true);
    expect(await lock.renewLock('sweep', 'b', 60_000)).toBe(false);
  });

  it('releases only for the current holder, so a late worker cannot free someone else’s', async () => {
    await lock.acquireLock('sweep', 'a', 60_000);
    expect(await lock.releaseLock('sweep', 'b')).toBe(false);
    expect(await lock.releaseLock('sweep', 'a')).toBe(true);
  });

  it('withLock skips rather than throwing when contended', async () => {
    await lock.acquireLock('sweep', 'holder', 60_000);

    let ran = false;
    const result = await lock.withLock('sweep', 'other', 60_000, async () => {
      ran = true;
      return 'done';
    });

    // A skipped tick is the correct, uneventful outcome for a recurring sweep.
    expect(result.ran).toBe(false);
    expect(ran).toBe(false);
  });

  it('withLock releases afterwards even when the body throws', async () => {
    await expect(
      lock.withLock('sweep', 'a', 60_000, async () => {
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');

    // The next caller must not be blocked by the failure.
    expect(await lock.acquireLock('sweep', 'b', 60_000)).not.toBeNull();
  });
});

describe('queue statistics', () => {
  it('counts every status, including the ones at zero', async () => {
    await queue.enqueue({ kind: 'a', orgId: ORG });
    const stats = await queue.queueStats();
    expect(stats.queued).toBe(1);
    expect(stats.dead).toBe(0);
    expect(Object.keys(stats).sort()).toEqual(
      ['cancelled', 'dead', 'failed', 'queued', 'running', 'succeeded'],
    );
  });
});
