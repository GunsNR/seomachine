import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * CORS on the public `/api/v1` surface.
 *
 * It used to answer `Access-Control-Allow-Origin: *` on every response, which
 * invites any page on the internet to make cross-origin calls to this API from
 * a visitor's browser. An origin now earns a grant by being a site some project
 * has actually connected, or by being named in configuration.
 */

const siteConnection = { findMany: vi.fn(async () => [] as Array<{ siteUrl: string }>) };
vi.mock('@/lib/db', () => ({ db: { siteConnection } }));

const { corsHeaders, corsPreflight, isAllowedOrigin, toOrigin } = await import('@/lib/api-auth');

const req = (headers: Record<string, string> = {}) =>
  new Request('https://api.test/api/v1/wordpress/visibility', { headers });

// A configured-origin match short-circuits before the lookup, so a queued
// `mockResolvedValueOnce` can survive its own test and shift every later one.
// Reset the queue between tests rather than depending on call ordering.
beforeEach(() => {
  siteConnection.findMany.mockReset();
  siteConnection.findMany.mockResolvedValue([]);
});

describe('toOrigin', () => {
  it('reduces a site URL to scheme://host', () => {
    expect(toOrigin('https://Example.com/wp-json/')).toBe('https://example.com');
    expect(toOrigin('http://site.test:8080/path?q=1')).toBe('http://site.test:8080');
  });

  it('returns empty for something that is not a URL', () => {
    expect(toOrigin('not a url')).toBe('');
    expect(toOrigin('')).toBe('');
  });
});

describe('isAllowedOrigin', () => {
  it('allows the origin of a connected site', async () => {
    siteConnection.findMany.mockResolvedValueOnce([{ siteUrl: 'https://customer.example/wp-json' }]);
    expect(await isAllowedOrigin('https://customer.example', {})).toBe(true);
  });

  it('refuses an origin nobody connected', async () => {
    siteConnection.findMany.mockResolvedValueOnce([{ siteUrl: 'https://customer.example' }]);
    expect(await isAllowedOrigin('https://attacker.example', {})).toBe(false);
  });

  it('allows an explicitly configured origin', async () => {
    siteConnection.findMany.mockResolvedValueOnce([]);
    expect(
      await isAllowedOrigin('https://ops.internal.test', {
        CORS_ALLOWED_ORIGINS: 'https://ops.internal.test, https://other.test',
      }),
    ).toBe(true);
  });

  it('refuses an empty origin', async () => {
    expect(await isAllowedOrigin('', {})).toBe(false);
  });

  it('does not treat a suffix match as an origin match', async () => {
    // `evilcustomer.example` must not inherit `customer.example`'s grant.
    siteConnection.findMany.mockResolvedValueOnce([{ siteUrl: 'https://customer.example' }]);
    expect(await isAllowedOrigin('https://evilcustomer.example', {})).toBe(false);
  });
});

describe('corsHeaders', () => {
  it('never answers with a wildcard', async () => {
    siteConnection.findMany.mockResolvedValueOnce([{ siteUrl: 'https://customer.example' }]);
    const headers = await corsHeaders(req({ origin: 'https://customer.example' }), {});
    expect(headers['Access-Control-Allow-Origin']).toBe('https://customer.example');
    expect(Object.values(headers)).not.toContain('*');
  });

  it('sets Vary: Origin so a cache cannot serve one tenant’s grant to another', async () => {
    siteConnection.findMany.mockResolvedValueOnce([{ siteUrl: 'https://customer.example' }]);
    const headers = await corsHeaders(req({ origin: 'https://customer.example' }), {});
    expect(headers.Vary).toBe('Origin');
  });

  it('withholds the grant from an unrecognised origin', async () => {
    siteConnection.findMany.mockResolvedValueOnce([]);
    const headers = await corsHeaders(req({ origin: 'https://attacker.example' }), {});
    expect(headers['Access-Control-Allow-Origin']).toBeUndefined();
    // Still varies, so the refusal is not cached against a different origin.
    expect(headers.Vary).toBe('Origin');
  });

  it('returns nothing at all for a same-origin request with no Origin header', async () => {
    expect(await corsHeaders(req({}), {})).toEqual({});
  });

  it('never allows credentials', async () => {
    siteConnection.findMany.mockResolvedValueOnce([{ siteUrl: 'https://customer.example' }]);
    const headers = await corsHeaders(req({ origin: 'https://customer.example' }), {});
    expect(headers['Access-Control-Allow-Credentials']).toBe('false');
  });
});

describe('corsPreflight', () => {
  it('answers 204 with the methods and headers for a recognised origin', async () => {
    siteConnection.findMany.mockResolvedValueOnce([{ siteUrl: 'https://customer.example' }]);
    const res = await corsPreflight(req({ origin: 'https://customer.example' }));
    expect(res.status).toBe(204);
    expect(res.headers.get('access-control-allow-origin')).toBe('https://customer.example');
    expect(res.headers.get('access-control-allow-methods')).toContain('POST');
  });

  it('answers 204 without a grant for an unrecognised origin rather than erroring', async () => {
    siteConnection.findMany.mockResolvedValueOnce([]);
    const res = await corsPreflight(req({ origin: 'https://attacker.example' }));
    expect(res.status).toBe(204);
    // The browser blocks the read, which is the correct outcome.
    expect(res.headers.get('access-control-allow-origin')).toBeNull();
  });
});
