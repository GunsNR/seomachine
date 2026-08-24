import { readFileSync } from 'node:fs';
import { globSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BlockedRequestError, checkResolvedHost, safeFetch } from '@/lib/net-fetch';

/**
 * SSRF defence beyond the literal hostname.
 *
 * `net-guard.ts` checks the string a user typed. That catches `127.0.0.1` and
 * `169.254.169.254` and nothing else, because a hostname is not an address.
 * Two holes survived Gate 0 and are closed here:
 *
 *   1. A public name whose A record points into private space.
 *   2. A public URL that answers 302 to a private one — `fetch` follows
 *      redirects by default, so the guard ran once and the request landed
 *      somewhere it had never checked.
 */

const SRC = resolve(__dirname, '../src');

/** A resolver stub, so these tests never touch real DNS. */
const resolving = (map: Record<string, string[]>) => async (host: string) => {
  const addresses = map[host];
  if (!addresses) throw new Error(`no record for ${host}`);
  return addresses.map((address) => ({ address }));
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('checkResolvedHost', () => {
  it('refuses a public name that resolves into private space', async () => {
    // The whole attack in one line: the string is unimpeachable, the address is not.
    const result = await checkResolvedHost(
      'evil.example.com',
      resolving({ 'evil.example.com': ['127.0.0.1'] }),
    );
    expect(result.allowed).toBe(false);
    expect(result.reason).toMatch(/resolves to an address/i);
  });

  it('refuses the cloud metadata address behind a public name', async () => {
    const result = await checkResolvedHost(
      'metadata.example.com',
      resolving({ 'metadata.example.com': ['169.254.169.254'] }),
    );
    expect(result.allowed).toBe(false);
  });

  it('refuses when ANY address is private, not just the first', async () => {
    // A name with one public and one private record is not safe merely because
    // the public one happened to sort first.
    const result = await checkResolvedHost(
      'mixed.example.com',
      resolving({ 'mixed.example.com': ['93.184.216.34', '10.0.0.5'] }),
    );
    expect(result.allowed).toBe(false);
  });

  it('never echoes the resolved address back to the caller', async () => {
    // Echoing it would turn this guard into the network scanner it prevents.
    const result = await checkResolvedHost(
      'evil.example.com',
      resolving({ 'evil.example.com': ['10.1.2.3'] }),
    );
    expect(result.reason).not.toContain('10.1.2.3');
  });

  it('allows an ordinary public name', async () => {
    const result = await checkResolvedHost(
      'example.com',
      resolving({ 'example.com': ['93.184.216.34'] }),
    );
    expect(result.allowed).toBe(true);
  });

  it('refuses a name that does not resolve at all', async () => {
    const result = await checkResolvedHost('nope.example.com', resolving({}));
    expect(result.allowed).toBe(false);
  });

  it('still applies the literal check before resolving', async () => {
    // No resolver call should be needed to refuse a loopback literal.
    const resolver = vi.fn();
    const result = await checkResolvedHost('127.0.0.1', resolver);
    expect(result.allowed).toBe(false);
    expect(resolver).not.toHaveBeenCalled();
  });
});

describe('safeFetch redirect handling', () => {
  it('re-checks each hop and refuses a redirect into private space', async () => {
    const fetchMock = vi.fn(async () =>
      new Response(null, { status: 302, headers: { location: 'http://169.254.169.254/latest/' } }),
    );
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      safeFetch('https://example.com/start', {}, resolving({ 'example.com': ['93.184.216.34'] })),
    ).rejects.toBeInstanceOf(BlockedRequestError);

    // The first hop was fetched; the second was refused before any request.
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('never asks fetch to follow redirects itself', async () => {
    const fetchMock = vi.fn(async () => new Response('ok', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    await safeFetch('https://example.com/', {}, resolving({ 'example.com': ['93.184.216.34'] }));

    // 'follow' would hand the final destination to the remote server.
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(init).toMatchObject({ redirect: 'manual' });
  });

  it('stops after the redirect budget rather than looping', async () => {
    const fetchMock = vi.fn(async () =>
      new Response(null, { status: 302, headers: { location: 'https://example.com/next' } }),
    );
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      safeFetch(
        'https://example.com/',
        { maxRedirects: 2 },
        resolving({ 'example.com': ['93.184.216.34'] }),
      ),
    ).rejects.toThrow(/too many redirects/i);
  });

  it('drops credentials when a redirect crosses origin', async () => {
    const calls: Array<Record<string, string>> = [];
    const fetchMock = vi.fn(async (_url: string, init: RequestInit) => {
      calls.push({ ...(init.headers as Record<string, string>) });
      return calls.length === 1
        ? new Response(null, { status: 302, headers: { location: 'https://other.example/' } })
        : new Response('ok', { status: 200 });
    });
    vi.stubGlobal('fetch', fetchMock);

    await safeFetch(
      'https://example.com/',
      { headers: { Authorization: 'Bearer secret-value', 'X-Keep': 'yes' } },
      resolving({ 'example.com': ['93.184.216.34'], 'other.example': ['93.184.216.35'] }),
    );

    expect(calls[0].Authorization).toBe('Bearer secret-value');
    // A host that was never given the credential must not receive it.
    expect(calls[1].Authorization).toBeUndefined();
    expect(calls[1]['X-Keep']).toBe('yes');
  });

  it('refuses a non-http scheme outright', async () => {
    await expect(safeFetch('file:///etc/passwd')).rejects.toBeInstanceOf(BlockedRequestError);
    await expect(safeFetch('gopher://example.com/')).rejects.toBeInstanceOf(BlockedRequestError);
  });
});

describe('the private-host escape hatch stays out of production code', () => {
  it('is never set by a route handler', () => {
    const routes = globSync('app/api/**/route.ts', { cwd: SRC });
    expect(routes.length).toBeGreaterThan(10);

    const offenders = routes.filter((f) =>
      readFileSync(resolve(SRC, f), 'utf8').includes('allowPrivateHosts'),
    );

    expect(
      offenders,
      `allowPrivateHosts must never appear in a route handler: ${offenders.join(', ')}`,
    ).toEqual([]);
  });

  it('defaults to false wherever it is accepted', () => {
    for (const file of ['lib/net-fetch.ts', 'lib/seo/crawler.ts', 'lib/wordpress.ts']) {
      const source = readFileSync(resolve(SRC, file), 'utf8');
      if (!source.includes('allowPrivateHosts')) continue;
      // Either an explicit `= false` default or a `?? false` coalesce.
      expect(source, file).toMatch(/allowPrivateHosts\s*(=\s*false|\?\?\s*false)|allowPrivateHosts:\s*[a-zA-Z.]+\s*\?\?\s*false/);
    }
  });
});
