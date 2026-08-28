import { readFileSync, globSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { BlockedRequestError, checkResolvedHost, resolveAndPin, safeFetch } from '@/lib/net-fetch';
import type { PinnedRequestSpec } from '@/lib/net-pinned';

/**
 * SSRF defence beyond the literal hostname.
 *
 * `net-guard.ts` checks the string a user typed. That catches `127.0.0.1` and
 * `169.254.169.254` and nothing else, because a hostname is not an address.
 * Three holes are closed here:
 *
 *   1. A public name whose A record points into private space.
 *   2. A public URL that answers 302 to a private one — a client left to
 *      follow redirects itself lands somewhere the guard never checked.
 *   3. A name that resolves to a public address when the guard asks and a
 *      private one when the HTTP client asks. Closing that means the address
 *      the guard approved is the address the socket is opened to, so these
 *      tests assert on what the transport is *handed*, not merely on what the
 *      guard decided.
 */

const SRC = resolve(__dirname, '../src');

/** A resolver stub, so these tests never touch real DNS. */
const resolving = (map: Record<string, string[]>) => async (host: string) => {
  const addresses = map[host];
  if (!addresses) throw new Error(`no record for ${host}`);
  return addresses.map((address) => ({ address }));
};

/** A transport stub that records what it was told to connect to. */
function recordingTransport(reply: (spec: PinnedRequestSpec) => Response | Promise<Response>) {
  const calls: PinnedRequestSpec[] = [];
  const transport = vi.fn(async (spec: PinnedRequestSpec) => {
    calls.push(spec);
    return reply(spec);
  });
  return { transport, calls };
}

const ok = () => new Response('ok', { status: 200 });

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

  it('refuses an IPv6 record that decodes to a blocked IPv4 address', async () => {
    // The mapped form is what a resolver and a URL parser actually produce.
    const result = await checkResolvedHost(
      'mapped.example.com',
      resolving({ 'mapped.example.com': ['::ffff:a9fe:a9fe'] }),
    );
    expect(result.allowed).toBe(false);
  });

  it('fails closed on a record it cannot parse', async () => {
    const result = await checkResolvedHost(
      'garbled.example.com',
      resolving({ 'garbled.example.com': ['not-an-address'] }),
    );
    expect(result.allowed).toBe(false);
  });
});

describe('resolveAndPin', () => {
  it('returns the validated address, so the caller has something to pin to', async () => {
    const result = await resolveAndPin(
      'example.com',
      resolving({ 'example.com': ['93.184.216.34'] }),
    );
    expect(result.allowed).toBe(true);
    expect(result.target).toMatchObject({
      hostname: 'example.com',
      address: '93.184.216.34',
      family: 4,
    });
  });

  it('pins an IP literal in canonical form, not as the user spelled it', async () => {
    // `0x08.0x08.0x08.0x08` is 8.8.8.8, and only one of those is a form the
    // socket layer will accept.
    const result = await resolveAndPin('0x08.0x08.0x08.0x08', resolving({}));
    expect(result.target?.address).toBe('8.8.8.8');
  });

  it('resolves exactly once', async () => {
    // Every extra resolution is another chance for the answer to change.
    const resolver = vi.fn(resolving({ 'example.com': ['93.184.216.34'] }));
    await resolveAndPin('example.com', resolver);
    expect(resolver).toHaveBeenCalledTimes(1);
  });
});

describe('safeFetch pins the socket to the address it validated', () => {
  it('hands the transport the validated address and the original hostname', async () => {
    const { transport, calls } = recordingTransport(ok);

    await safeFetch(
      'https://example.com/wp-json',
      { transport },
      resolving({ 'example.com': ['93.184.216.34'] }),
    );

    // The address is what the socket connects to; the hostname is what TLS and
    // the Host header see. Both, not one or the other.
    expect(calls[0].address).toBe('93.184.216.34');
    expect(calls[0].url.hostname).toBe('example.com');
  });

  it('closes DNS rebinding: the second answer is never asked for', async () => {
    // A rebinding resolver: public the first time it is asked, the metadata
    // service every time after. The old code validated the first answer and
    // then let `fetch` ask again, getting the second.
    let call = 0;
    const rebinding = async () => {
      call += 1;
      return [{ address: call === 1 ? '93.184.216.34' : '169.254.169.254' }];
    };

    const { transport, calls } = recordingTransport(ok);
    await safeFetch('https://rebind.example/', { transport }, rebinding);

    // One resolution for the hop, and the socket gets the address that was
    // checked — not whatever a second lookup would have returned.
    expect(call).toBe(1);
    expect(calls[0].address).toBe('93.184.216.34');
  });

  it('re-checks each hop and refuses a redirect into private space', async () => {
    const { transport } = recordingTransport(
      () => new Response(null, { status: 302, headers: { location: 'http://169.254.169.254/latest/' } }),
    );

    await expect(
      safeFetch('https://example.com/start', { transport }, resolving({ 'example.com': ['93.184.216.34'] })),
    ).rejects.toBeInstanceOf(BlockedRequestError);

    // The first hop was fetched; the second was refused before any connection.
    expect(transport).toHaveBeenCalledTimes(1);
  });

  it('resolves and pins the redirect target separately', async () => {
    const { transport, calls } = recordingTransport((spec) =>
      spec.url.hostname === 'example.com'
        ? new Response(null, { status: 302, headers: { location: 'https://other.example/next' } })
        : ok(),
    );

    await safeFetch(
      'https://example.com/',
      { transport },
      resolving({ 'example.com': ['93.184.216.34'], 'other.example': ['93.184.216.35'] }),
    );

    // Each hop is pinned to its own validated address. A redirect is a new
    // destination, not a continuation of an approved one.
    expect(calls.map((c) => c.address)).toEqual(['93.184.216.34', '93.184.216.35']);
  });

  it('refuses a redirect to a name that resolves into private space', async () => {
    const { transport } = recordingTransport((spec) =>
      spec.url.hostname === 'example.com'
        ? new Response(null, { status: 302, headers: { location: 'https://inner.example/' } })
        : ok(),
    );

    await expect(
      safeFetch(
        'https://example.com/',
        { transport },
        resolving({ 'example.com': ['93.184.216.34'], 'inner.example': ['10.0.0.7'] }),
      ),
    ).rejects.toThrow(/resolves to an address/i);
  });

  it('stops after the redirect budget rather than looping', async () => {
    const { transport } = recordingTransport(
      () => new Response(null, { status: 302, headers: { location: 'https://example.com/next' } }),
    );

    await expect(
      safeFetch(
        'https://example.com/',
        { maxRedirects: 2, transport },
        resolving({ 'example.com': ['93.184.216.34'] }),
      ),
    ).rejects.toThrow(/too many redirects/i);
  });

  it('drops credentials when a redirect crosses origin', async () => {
    const { transport, calls } = recordingTransport((spec) =>
      spec.url.hostname === 'example.com'
        ? new Response(null, { status: 302, headers: { location: 'https://other.example/' } })
        : ok(),
    );

    await safeFetch(
      'https://example.com/',
      { headers: { Authorization: 'Bearer secret-value', 'X-Keep': 'yes' }, transport },
      resolving({ 'example.com': ['93.184.216.34'], 'other.example': ['93.184.216.35'] }),
    );

    expect(calls[0].headers.Authorization).toBe('Bearer secret-value');
    // A host that was never given the credential must not receive it.
    expect(calls[1].headers.Authorization).toBeUndefined();
    expect(calls[1]['X-Keep' as keyof PinnedRequestSpec]).toBeUndefined();
    expect(calls[1].headers['X-Keep']).toBe('yes');
  });

  it('refuses a non-http scheme outright', async () => {
    await expect(safeFetch('file:///etc/passwd')).rejects.toBeInstanceOf(BlockedRequestError);
    await expect(safeFetch('gopher://example.com/')).rejects.toBeInstanceOf(BlockedRequestError);
  });

  it('refuses a URL it cannot parse', async () => {
    await expect(safeFetch('not a url')).rejects.toBeInstanceOf(BlockedRequestError);
  });

  it('refuses an address written in a notation the old guard did not read', async () => {
    // http://0177.0.0.1/ and http://127.1/ are loopback to a resolver.
    for (const url of ['http://0177.0.0.1/', 'http://127.1/', 'http://2130706433/']) {
      await expect(safeFetch(url), url).rejects.toBeInstanceOf(BlockedRequestError);
    }
  });

  it('spends one timeout budget across the whole chain, not one per hop', async () => {
    const { transport } = recordingTransport(async () => {
      await new Promise((r) => setTimeout(r, 60));
      return new Response(null, { status: 302, headers: { location: 'https://example.com/next' } });
    });

    // Five hops at 60ms each would take 300ms if the budget reset per hop.
    await expect(
      safeFetch(
        'https://example.com/',
        { maxRedirects: 5, timeoutMs: 100, transport },
        resolving({ 'example.com': ['93.184.216.34'] }),
      ),
    ).rejects.toThrow(/timed out/i);
  });

  it('passes a byte cap down to the transport', async () => {
    const { transport, calls } = recordingTransport(ok);
    await safeFetch('https://example.com/', { transport }, resolving({ 'example.com': ['93.184.216.34'] }));
    expect(calls[0].maxBytes).toBeGreaterThan(0);
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

  it('still pins the socket even when validation is waived', () => {
    // The hatch disables the address *check*, never the pin: a request whose
    // destination is unknowable is not safer for having skipped a check.
    const source = readFileSync(resolve(SRC, 'lib/net-fetch.ts'), 'utf8');
    expect(source).toMatch(/skipValidation: allowPrivateHosts/);
  });
});
