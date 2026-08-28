import 'server-only';
import { Agent as HttpAgent, request as httpRequest, type IncomingMessage } from 'node:http';
import { Agent as HttpsAgent, request as httpsRequest } from 'node:https';
import type { Readable } from 'node:stream';
import { createBrotliDecompress, createGunzip, createInflate } from 'node:zlib';
import { parseIpAddress } from './ip-address';

/**
 * The socket-pinned transport.
 *
 * `fetch` takes a hostname and resolves it itself. That single fact is the
 * whole DNS-rebinding hole: however carefully a guard resolves and validates a
 * name beforehand, `fetch` throws that work away and asks DNS again, and an
 * attacker who controls the authoritative server answers the second question
 * differently from the first. The validated address never reaches the socket.
 *
 * Node's `fetch` cannot be told which address to use — the `dispatcher` option
 * that would allow it needs an `undici` dependency the project does not carry.
 * So the transport is `node:http`/`node:https`, where a `lookup` function can
 * be supplied per request. Ours ignores the hostname it is handed and returns
 * the one address the guard already approved. There is no second lookup to
 * poison, because there is no second lookup.
 *
 * What is deliberately *not* changed is the hostname. `options.host` stays the
 * name, so TLS SNI, certificate validation and the `Host` header all see the
 * name the user asked for; only the address the TCP connection is opened to is
 * substituted. Pinning that also broke certificate validation would trade one
 * vulnerability for another.
 */

export interface PinnedRequestSpec {
  url: URL;
  method: string;
  headers: Record<string, string>;
  body?: string | Uint8Array;
  /** The validated address, canonical form. The socket connects here. */
  address: string;
  family: 4 | 6;
  /** Budget for this hop, including connection, TLS and body. */
  timeoutMs: number;
  /** Cap on the response body, compressed and decompressed alike. */
  maxBytes: number;
}

export type PinnedTransport = (spec: PinnedRequestSpec) => Promise<Response>;

export class PinnedRequestError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PinnedRequestError';
  }
}

/**
 * A resolver that resolves nothing.
 *
 * `net.connect` calls this where it would otherwise call `getaddrinfo`. It
 * discards the hostname argument on purpose: the answer is fixed before the
 * socket exists.
 */
function pinnedLookup(address: string, family: 4 | 6) {
  return (
    _hostname: string,
    options: unknown,
    callback: (...args: unknown[]) => void,
  ): void => {
    const wantsAll = typeof options === 'object' && options !== null && 'all' in options
      ? Boolean((options as { all?: boolean }).all)
      : false;

    if (wantsAll) callback(null, [{ address, family }]);
    else callback(null, address, family);
  };
}

/** Node reports an IPv4 peer on a dual-stack socket as `::ffff:a.b.c.d`. */
function sameAddress(a: string, b: string): boolean {
  const left = parseIpAddress(a);
  const right = parseIpAddress(b);
  if (!left || !right) return false;
  if (left.canonical === right.canonical) return true;

  const unmap = (bytes: number[]): string | null => {
    const mapped = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0xff, 0xff];
    if (bytes.length !== 16 || !mapped.every((byte, i) => bytes[i] === byte)) return null;
    return bytes.slice(12).join('.');
  };

  return (unmap(left.bytes) ?? left.canonical) === (unmap(right.bytes) ?? right.canonical);
}

function decompressor(encoding: string): Readable | null {
  switch (encoding.trim().toLowerCase()) {
    case 'gzip':
    case 'x-gzip':
      return createGunzip();
    case 'deflate':
      return createInflate();
    case 'br':
      return createBrotliDecompress();
    default:
      return null;
  }
}

/**
 * Read the body under two independent caps.
 *
 * The decoded cap alone is not enough: a few compressed kilobytes can decode
 * to gigabytes, and the process runs out of memory before any limit on the
 * decoded size is consulted. So the encoded stream is capped too.
 */
function readCapped(res: IncomingMessage, maxBytes: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const decoder = decompressor(res.headers['content-encoding'] ?? '');
    const chunks: Buffer[] = [];
    let decoded = 0;
    let encoded = 0;

    const fail = (message: string) => {
      res.destroy();
      decoder?.destroy();
      reject(new PinnedRequestError(message));
    };

    res.on('data', (chunk: Buffer) => {
      encoded += chunk.length;
      if (encoded > maxBytes) fail('The response was larger than we will read.');
    });

    const source: Readable = decoder ? res.pipe(decoder as never) : res;

    source.on('data', (chunk: Buffer) => {
      decoded += chunk.length;
      if (decoded > maxBytes) {
        fail('The response was larger than we will read.');
        return;
      }
      chunks.push(chunk);
    });
    source.on('end', () => resolve(Buffer.concat(chunks)));
    source.on('error', () => fail('The response could not be read.'));
    if (decoder) res.on('error', () => fail('The response could not be read.'));
  });
}

/** Statuses that must not carry a body, per the fetch specification. */
const NULL_BODY_STATUS = new Set([101, 103, 204, 205, 304]);

function toResponse(res: IncomingMessage, body: Buffer, url: string): Response {
  const headers = new Headers();
  for (const [name, value] of Object.entries(res.headers)) {
    if (value === undefined) continue;
    // A malformed header from a remote server must not take the request down.
    try {
      if (Array.isArray(value)) for (const item of value) headers.append(name, item);
      else headers.set(name, value);
    } catch {
      continue;
    }
  }

  const status = res.statusCode ?? 502;
  const response = new Response(NULL_BODY_STATUS.has(status) ? null : new Uint8Array(body), {
    status,
    statusText: res.statusMessage || '',
    headers,
  });

  // `Response` has no public constructor argument for the final URL, and
  // callers read `res.url` to report where a crawl actually landed.
  Object.defineProperty(response, 'url', { value: url, configurable: true });
  return response;
}

export const pinnedTransport: PinnedTransport = (spec) =>
  new Promise<Response>((resolve, reject) => {
    const secure = spec.url.protocol === 'https:';
    const lookup = pinnedLookup(spec.address, spec.family);
    const port = spec.url.port ? Number(spec.url.port) : secure ? 443 : 80;
    const hostIsAddress = parseIpAddress(spec.url.hostname) !== null;

    const AgentClass = secure ? HttpsAgent : HttpAgent;
    // A fresh agent per request: a pooled connection is a connection opened
    // against some earlier request's pinned address.
    const agent = new AgentClass({ keepAlive: false, maxSockets: 1, lookup } as never);

    const req = (secure ? httpsRequest : httpRequest)({
      // The name, not the address — this is what TLS and the Host header see.
      host: spec.url.hostname,
      port,
      path: `${spec.url.pathname}${spec.url.search}`,
      method: spec.method,
      headers: { host: spec.url.host, ...spec.headers },
      agent,
      lookup,
      // SNI must carry a name; sending an IP literal as SNI is invalid.
      ...(secure && !hostIsAddress ? { servername: spec.url.hostname } : {}),
    } as never);

    let settled = false;
    const finish = (fn: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      agent.destroy();
      fn();
    };

    const timer = setTimeout(() => {
      req.destroy();
      finish(() => reject(new PinnedRequestError('The request timed out.')));
    }, spec.timeoutMs);

    req.on('socket', (socket) => {
      const verify = () => {
        const peer = socket.remoteAddress;
        // Belt and braces: if the socket is not on the approved address, the
        // pin failed and the only safe move is to hang up before sending.
        if (peer && !sameAddress(peer, spec.address)) {
          req.destroy();
          finish(() => reject(new PinnedRequestError('The connection was not made to the approved address.')));
        }
      };
      // A plain socket announces 'connect'; a TLS socket may only announce
      // 'secureConnect'. `finish` makes a second call harmless.
      socket.once('connect', verify);
      socket.once('secureConnect', verify);
      if (!socket.connecting) verify();
    });

    req.on('response', (res) => {
      readCapped(res, spec.maxBytes).then(
        (body) => finish(() => resolve(toResponse(res, body, spec.url.toString()))),
        (err: unknown) =>
          finish(() =>
            reject(
              err instanceof PinnedRequestError
                ? err
                : new PinnedRequestError('The response could not be read.'),
            ),
          ),
      );
    });

    req.on('error', (err: NodeJS.ErrnoException) => {
      // Fail closed and say nothing about the address: a distinguishable
      // "connection refused" is a port scan.
      const message =
        err.code === 'ECONNREFUSED' || err.code === 'EHOSTUNREACH' || err.code === 'ENETUNREACH'
          ? 'We could not connect to that host.'
          : err.code === 'CERT_HAS_EXPIRED' ||
              err.code === 'ERR_TLS_CERT_ALTNAME_INVALID' ||
              err.code === 'UNABLE_TO_VERIFY_LEAF_SIGNATURE' ||
              err.code === 'DEPTH_ZERO_SELF_SIGNED_CERT' ||
              err.code === 'SELF_SIGNED_CERT_IN_CHAIN'
            ? 'That host presented an invalid TLS certificate.'
            : 'fetch failed';
      finish(() => reject(new PinnedRequestError(message)));
    });

    if (spec.body !== undefined) req.end(spec.body);
    else req.end();
  });
