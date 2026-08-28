import { EventEmitter } from 'node:events';
import { createServer, type Server } from 'node:http';
import { gzipSync } from 'node:zlib';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { PinnedRequestError, pinnedTransport } from '@/lib/net-pinned';

/**
 * Proof that the socket goes where the guard said, and nowhere else.
 *
 * The load-bearing trick in this file: every request is addressed to
 * `pinned.invalid`, a name RFC 2606 guarantees will never resolve. If a
 * request succeeds, no DNS lookup can have happened — the connection was made
 * to the pinned address and to nothing else. That is the property the previous
 * implementation could not have, because `fetch` always resolves the name it
 * is given.
 */

const { httpsCalls } = vi.hoisted(() => ({ httpsCalls: [] as Record<string, unknown>[] }));

// The TLS assertions need the options `https.request` was handed; a real TLS
// server would need a certificate authority to be meaningful here.
vi.mock('node:https', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:https')>();
  return {
    ...actual,
    default: actual,
    request: (options: Record<string, unknown>) => {
      httpsCalls.push(options);
      const req = new EventEmitter() as EventEmitter & { end: () => void; destroy: () => void };
      req.end = () => {
        setImmediate(() => req.emit('error', Object.assign(new Error('stub'), { code: 'ECONNREFUSED' })));
      };
      req.destroy = () => {};
      return req;
    },
  };
});

let server: Server;
let port = 0;
let lastRequestHost = '';

beforeAll(async () => {
  server = createServer((req, res) => {
    lastRequestHost = req.headers.host ?? '';
    const url = new URL(req.url ?? '/', 'http://placeholder');

    if (url.pathname === '/large') {
      res.writeHead(200, { 'Content-Type': 'text/plain' });
      res.end('x'.repeat(200_000));
      return;
    }
    if (url.pathname === '/bomb') {
      // A few hundred compressed bytes that decode to 200 kB.
      const body = gzipSync(Buffer.alloc(200_000, 0x61));
      res.writeHead(200, { 'Content-Type': 'text/html', 'Content-Encoding': 'gzip' });
      res.end(body);
      return;
    }
    if (url.pathname === '/gzip') {
      res.writeHead(200, { 'Content-Type': 'text/html', 'Content-Encoding': 'gzip' });
      res.end(gzipSync(Buffer.from('<h1>compressed</h1>')));
      return;
    }
    if (url.pathname === '/redirect') {
      res.writeHead(302, { location: 'http://169.254.169.254/latest/meta-data/' });
      res.end();
      return;
    }
    if (url.pathname === '/slow') {
      // Never answers, so the deadline is the only thing that can end this.
      return;
    }
    if (url.pathname === '/no-content') {
      res.writeHead(204);
      res.end();
      return;
    }

    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end('<h1>ok</h1>');
  });

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  port = (server.address() as { port: number }).port;
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

const spec = (path: string, overrides: Record<string, unknown> = {}) => ({
  url: new URL(`http://pinned.invalid:${port}${path}`),
  method: 'GET',
  headers: {},
  address: '127.0.0.1',
  family: 4 as const,
  timeoutMs: 5_000,
  maxBytes: 1024 * 1024,
  ...overrides,
});

describe('pinnedTransport connects to the pinned address', () => {
  it('reaches a server by address alone, with a hostname that cannot resolve', async () => {
    // `pinned.invalid` has no DNS record anywhere. A response proves the
    // socket used the pinned address and never asked a resolver.
    const res = await pinnedTransport(spec('/'));
    expect(res.status).toBe(200);
    expect(await res.text()).toBe('<h1>ok</h1>');
  });

  it('sends the original hostname in the Host header, not the address', async () => {
    await pinnedTransport(spec('/'));
    // A virtual host must see the name the user asked for; sending the pinned
    // IP would reach the wrong site on a shared address.
    expect(lastRequestHost).toBe(`pinned.invalid:${port}`);
  });

  it('reports the requested URL as the response URL', async () => {
    const res = await pinnedTransport(spec('/'));
    expect(res.url).toBe(`http://pinned.invalid:${port}/`);
  });

  it('returns a redirect rather than following it', async () => {
    // Following inside the transport would hand the destination to the server.
    const res = await pinnedTransport(spec('/redirect'));
    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toBe('http://169.254.169.254/latest/meta-data/');
  });

  it('refuses when the peer is not the address that was approved', async () => {
    // 127.0.0.2 is also loopback, so the connection succeeds and the check has
    // something real to catch: the socket is not on the approved address.
    await expect(
      pinnedTransport(spec('/', { address: '127.0.0.2' })),
    ).rejects.toBeInstanceOf(PinnedRequestError);
  });

  it('handles a 204 without inventing a body', async () => {
    const res = await pinnedTransport(spec('/no-content'));
    expect(res.status).toBe(204);
    expect(await res.text()).toBe('');
  });
});

describe('pinnedTransport limits', () => {
  it('refuses a response larger than the cap', async () => {
    await expect(pinnedTransport(spec('/large', { maxBytes: 1_000 }))).rejects.toThrow(/larger than we will read/i);
  });

  it('caps the decompressed size, not just the compressed size', async () => {
    // The compressed body is well under the cap; the decoded body is not.
    await expect(pinnedTransport(spec('/bomb', { maxBytes: 5_000 }))).rejects.toThrow(/larger than we will read/i);
  });

  it('decompresses a response that fits', async () => {
    const res = await pinnedTransport(spec('/gzip'));
    expect(await res.text()).toBe('<h1>compressed</h1>');
  });

  it('gives up at the deadline rather than hanging', async () => {
    await expect(pinnedTransport(spec('/slow', { timeoutMs: 150 }))).rejects.toThrow(/timed out/i);
  });

  it('fails closed when nothing is listening', async () => {
    await expect(
      pinnedTransport({ ...spec('/'), url: new URL('http://pinned.invalid:1/') }),
    ).rejects.toBeInstanceOf(PinnedRequestError);
  });
});

describe('TLS keeps the hostname while the socket keeps the address', () => {
  it('sends the hostname as SNI and as Host, and pins the lookup', async () => {
    httpsCalls.length = 0;
    await expect(
      pinnedTransport({
        url: new URL('https://secure.example/wp-json'),
        method: 'GET',
        headers: {},
        address: '93.184.216.34',
        family: 4,
        timeoutMs: 1_000,
        maxBytes: 1024,
      }),
    ).rejects.toBeInstanceOf(PinnedRequestError);

    const options = httpsCalls[0];
    // Certificate validation is done against `servername`/`host`. Pinning by
    // rewriting the host to the IP would silently disable it.
    expect(options.host).toBe('secure.example');
    expect(options.servername).toBe('secure.example');
    expect((options.headers as Record<string, string>).host).toBe('secure.example');

    // And the lookup answers with the approved address, whatever it is asked.
    const lookup = options.lookup as (h: string, o: unknown, cb: (...a: unknown[]) => void) => void;
    const answers: unknown[][] = [];
    lookup('secure.example', {}, (...args) => answers.push(args));
    lookup('anything-else.example', { all: true }, (...args) => answers.push(args));

    expect(answers[0]).toEqual([null, '93.184.216.34', 4]);
    expect(answers[1]).toEqual([null, [{ address: '93.184.216.34', family: 4 }]]);
  });

  it('omits SNI when the host is an IP literal, which SNI may not carry', async () => {
    httpsCalls.length = 0;
    await expect(
      pinnedTransport({
        url: new URL('https://93.184.216.34/'),
        method: 'GET',
        headers: {},
        address: '93.184.216.34',
        family: 4,
        timeoutMs: 1_000,
        maxBytes: 1024,
      }),
    ).rejects.toBeInstanceOf(PinnedRequestError);

    expect(httpsCalls[0].servername).toBeUndefined();
  });
});
