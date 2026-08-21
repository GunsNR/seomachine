import { beforeEach, describe, expect, it } from 'vitest';
import { activeProvider, fetchKeywordMetrics, providerConfigured } from '@/lib/seo/providers/keyword-data';

beforeEach(() => {
  delete process.env.DATAFORSEO_LOGIN;
  delete process.env.DATAFORSEO_PASSWORD;
});

describe('provider detection', () => {
  it('reports none configured by default', () => {
    expect(activeProvider()).toBeNull();
    expect(providerConfigured()).toBe(false);
  });

  it('needs both halves of the credential', () => {
    process.env.DATAFORSEO_LOGIN = 'user';
    expect(activeProvider()).toBeNull();
    process.env.DATAFORSEO_PASSWORD = 'pass';
    expect(activeProvider()).toBe('dataforseo');
  });
});

describe('fetchKeywordMetrics without a provider', () => {
  it('returns one modelled row per phrase', async () => {
    const rows = await fetchKeywordMetrics(['seo tool', 'ai search visibility']);
    expect(rows).toHaveLength(2);
    for (const row of rows) {
      expect(row.source).toBe('estimated');
      expect(row.volume).toBeGreaterThan(0);
      expect(row.trend).toHaveLength(12);
    }
  });

  it('never claims modelled numbers are measured', async () => {
    const [row] = await fetchKeywordMetrics(['anything']);
    expect(row.source).not.toBe('measured');
    expect(row.provider).toBeUndefined();
  });

  it('deduplicates and normalises case and whitespace', async () => {
    const rows = await fetchKeywordMetrics(['  SEO Tool ', 'seo tool', 'other term']);
    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.phrase)).toEqual(['seo tool', 'other term']);
  });

  it('drops empty input rather than creating blank rows', async () => {
    expect(await fetchKeywordMetrics(['', '   '])).toEqual([]);
    expect(await fetchKeywordMetrics([])).toEqual([]);
  });

  it('classifies intent on every row', async () => {
    const rows = await fetchKeywordMetrics(['buy seo software', 'what is seo']);
    expect(rows[0].intent).toBe('transactional');
    expect(rows[1].intent).toBe('informational');
  });

  it('is deterministic across calls', async () => {
    const a = await fetchKeywordMetrics(['stable phrase']);
    const b = await fetchKeywordMetrics(['stable phrase']);
    expect(a).toEqual(b);
  });
});

describe('fetchKeywordMetrics when the provider fails', () => {
  it('degrades to the model instead of throwing', async () => {
    process.env.DATAFORSEO_LOGIN = 'user';
    process.env.DATAFORSEO_PASSWORD = 'pass';

    const original = globalThis.fetch;
    globalThis.fetch = (() => Promise.reject(new Error('network down'))) as typeof fetch;
    try {
      const rows = await fetchKeywordMetrics(['seo tool']);
      expect(rows).toHaveLength(1);
      expect(rows[0].source).toBe('estimated');
    } finally {
      globalThis.fetch = original;
    }
  });

  it('treats an API-level error body as a failure, not as data', async () => {
    process.env.DATAFORSEO_LOGIN = 'user';
    process.env.DATAFORSEO_PASSWORD = 'pass';

    const original = globalThis.fetch;
    // DataForSEO signals errors with HTTP 200 and a status code in the body.
    globalThis.fetch = (() =>
      Promise.resolve(
        new Response(JSON.stringify({ status_code: 40501, status_message: 'Invalid credentials' }), {
          status: 200, headers: { 'Content-Type': 'application/json' },
        }),
      )) as typeof fetch;
    try {
      const rows = await fetchKeywordMetrics(['seo tool']);
      expect(rows[0].source).toBe('estimated');
    } finally {
      globalThis.fetch = original;
    }
  });

  it('uses measured figures when the provider returns them', async () => {
    process.env.DATAFORSEO_LOGIN = 'user';
    process.env.DATAFORSEO_PASSWORD = 'pass';

    const original = globalThis.fetch;
    globalThis.fetch = (() =>
      Promise.resolve(
        new Response(
          JSON.stringify({
            status_code: 20000,
            tasks: [{
              status_code: 20000,
              result: [{
                keyword: 'seo tool',
                search_volume: 40500,
                cpc: 12.34,
                competition_index: 80,
                monthly_searches: Array.from({ length: 12 }, (_, i) => ({
                  year: 2026, month: i + 1, search_volume: 40000 + i * 100,
                })),
              }],
            }],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      )) as typeof fetch;
    try {
      const [row] = await fetchKeywordMetrics(['seo tool']);
      expect(row.source).toBe('measured');
      expect(row.provider).toBe('dataforseo');
      expect(row.volume).toBe(40500);
      expect(row.cpc).toBe(12.34);
      expect(row.trend).toHaveLength(12);
      expect(row.difficulty).toBeGreaterThan(0);
      expect(row.difficulty).toBeLessThanOrEqual(100);
    } finally {
      globalThis.fetch = original;
    }
  });

  it('models a zero-volume row rather than showing a misleading zero', async () => {
    process.env.DATAFORSEO_LOGIN = 'user';
    process.env.DATAFORSEO_PASSWORD = 'pass';

    const original = globalThis.fetch;
    globalThis.fetch = (() =>
      Promise.resolve(
        new Response(
          JSON.stringify({
            status_code: 20000,
            tasks: [{ status_code: 20000, result: [{ keyword: 'obscure term', search_volume: 0 }] }],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      )) as typeof fetch;
    try {
      const [row] = await fetchKeywordMetrics(['obscure term']);
      expect(row.source).toBe('estimated');
      expect(row.volume).toBeGreaterThan(0);
    } finally {
      globalThis.fetch = original;
    }
  });
});
