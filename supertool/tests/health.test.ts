import { afterEach, describe, expect, it, vi } from 'vitest';

/**
 * The health endpoint's two audiences.
 *
 * Before Phase 2 there was one response shape and it was public. Any anonymous
 * caller got a map of the deployment: which providers were configured, whether
 * billing was live, whether `AUTH_SECRET` was still the development default,
 * and the raw database error string — which routinely carries a hostname, a
 * port and a driver version.
 *
 * None of that is a credential. All of it shortens the distance between "found
 * the host" and "knows what to try".
 */

const db = {
  $queryRaw: vi.fn(async () => [{ '?column?': 1 }]),
  job: { groupBy: vi.fn(async () => [] as Array<{ status: string; _count: { _all: number } }>) },
};
vi.mock('@/lib/db', () => ({ db }));

const { GET } = await import('@/app/api/health/route');

const req = (headers: Record<string, string> = {}) =>
  new Request('https://api.test/api/health', { headers });

afterEach(() => {
  delete process.env.HEALTH_TOKEN;
  db.$queryRaw.mockResolvedValue([{ '?column?': 1 }]);
});

describe('the public shape', () => {
  it('reports 200 and nothing but status when the database answers', async () => {
    const res = await GET(req());
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(Object.keys(body).sort()).toEqual(['status', 'timestamp']);
    expect(body.status).toBe('ok');
  });

  it('reports 503 when the database does not answer', async () => {
    db.$queryRaw.mockRejectedValueOnce(new Error('connect ECONNREFUSED 10.0.0.5:5432'));
    const res = await GET(req());
    expect(res.status).toBe(503);
    expect((await res.json()).status).toBe('degraded');
  });

  it('never leaks the database error text to an anonymous caller', async () => {
    // The old response included this verbatim, hostname and port included.
    db.$queryRaw.mockRejectedValueOnce(new Error('connect ECONNREFUSED 10.0.0.5:5432'));
    const text = await (await GET(req())).text();
    expect(text).not.toContain('10.0.0.5');
    expect(text).not.toContain('ECONNREFUSED');
  });

  it('never leaks configuration state', async () => {
    const text = await (await GET(req())).text();
    for (const leak of ['authSecret', 'billing', 'email', 'keywordData', 'answerEngines', 'queue']) {
      expect(text, leak).not.toContain(leak);
    }
  });

  it('is not cacheable', async () => {
    expect((await GET(req())).headers.get('cache-control')).toBe('no-store');
  });
});

describe('the detailed shape', () => {
  it('stays closed when no token is configured', async () => {
    // An unset secret must never mean "allow everyone".
    const res = await GET(req({ authorization: 'Bearer anything' }));
    expect(Object.keys(await res.json()).sort()).toEqual(['status', 'timestamp']);
  });

  it('opens for the configured token', async () => {
    process.env.HEALTH_TOKEN = 'ops-token-value';
    const body = await (await GET(req({ authorization: 'Bearer ops-token-value' }))).json();
    expect(body.checks).toBeDefined();
    expect(body.checks.answerEngines.known).toBeGreaterThan(0);
  });

  it('refuses a wrong token', async () => {
    process.env.HEALTH_TOKEN = 'ops-token-value';
    const body = await (await GET(req({ authorization: 'Bearer wrong-token-value' }))).json();
    expect(body.checks).toBeUndefined();
  });

  it('refuses a token of a different length without comparing content', async () => {
    process.env.HEALTH_TOKEN = 'ops-token-value';
    const body = await (await GET(req({ authorization: 'Bearer short' }))).json();
    expect(body.checks).toBeUndefined();
  });

  it('includes the database error for an authorized operator', async () => {
    process.env.HEALTH_TOKEN = 'ops-token-value';
    db.$queryRaw.mockRejectedValueOnce(new Error('connect ECONNREFUSED 10.0.0.5:5432'));
    const body = await (await GET(req({ authorization: 'Bearer ops-token-value' }))).json();
    // Useful to the person on call, withheld from everyone else.
    expect(body.checks.databaseError).toContain('ECONNREFUSED');
  });

  it('reports queue depth', async () => {
    process.env.HEALTH_TOKEN = 'ops-token-value';
    db.job.groupBy.mockResolvedValueOnce([{ status: 'dead', _count: { _all: 3 } }]);
    const body = await (await GET(req({ authorization: 'Bearer ops-token-value' }))).json();
    expect(body.checks.queue.dead).toBe(3);
  });

  it('degrades gracefully when queue statistics fail', async () => {
    process.env.HEALTH_TOKEN = 'ops-token-value';
    db.job.groupBy.mockRejectedValueOnce(new Error('relation does not exist'));
    const body = await (await GET(req({ authorization: 'Bearer ops-token-value' }))).json();
    // A broken sub-check must not take down the probe itself.
    expect(body.checks.queue.error).toBeTruthy();
  });
});
