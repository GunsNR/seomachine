import 'server-only';
import { lookup } from 'node:dns/promises';
import { parseIpAddress } from './ip-address';
import { checkPublicHost, checkPublicUrl, type HostCheck } from './net-guard';
import { pinnedTransport, PinnedRequestError, type PinnedTransport } from './net-pinned';

/**
 * SSRF-safe fetching.
 *
 * `net-guard.ts` checks the *literal* hostname. That stops the obvious attacks
 * — `http://127.0.0.1/`, `http://169.254.169.254/` — and nothing else, because
 * a hostname is not an address. Three holes had to be closed on top of it:
 *
 *   1. **DNS.** `evil.example.com` is a perfectly ordinary public hostname that
 *      passes every string check, and its A record can be `127.0.0.1`. The
 *      literal check cannot see that; only resolution can.
 *
 *   2. **Redirects.** A URL that passes every check can answer `302` to
 *      `http://169.254.169.254/`. Following redirects inside the HTTP client
 *      hands control of the final destination to the remote server.
 *
 *   3. **Rebinding.** Resolving and *then* handing the hostname to a client
 *      that resolves it again is a time-of-check/time-of-use bug: an attacker
 *      serving a zero-TTL record answers the second lookup with the address
 *      the first one was careful not to return. The check and the connection
 *      have to agree, and the only way to make them agree is to connect to the
 *      address that was checked.
 *
 * So: resolve once through a controlled resolver, validate every address it
 * returns, pin the socket to the address that passed, and repeat the whole
 * sequence for each redirect hop. See `net-pinned.ts` for the pinning itself.
 */

export interface ResolvedRecord {
  address: string;
  family?: number;
}

export type Resolver = (host: string) => Promise<ResolvedRecord[]>;

export interface ResolvedCheck extends HostCheck {
  addresses?: string[];
}

export interface PinnedTarget {
  /** The name, preserved for TLS validation and the Host header. */
  hostname: string;
  /** The single validated address the socket will be opened to. */
  address: string;
  family: 4 | 6;
  addresses: string[];
}

export class BlockedRequestError extends Error {
  constructor(
    message: string,
    public readonly url: string,
  ) {
    super(message);
    this.name = 'BlockedRequestError';
  }
}

async function defaultResolver(host: string): Promise<ResolvedRecord[]> {
  const result = await lookup(host, { all: true, verbatim: true });
  return result.map((r) => ({ address: r.address, family: r.family }));
}

/**
 * Resolve a hostname, check every address it maps to, and choose one to pin.
 *
 * *Every* address, not the first: a name with both a public and a private A
 * record is not safe merely because the public one sorted first. Anything
 * ambiguous — no records, an unparseable record, a resolver error — is refused
 * rather than guessed at.
 */
export async function resolveAndPin(
  hostname: string,
  resolver: Resolver = defaultResolver,
  options: { skipValidation?: boolean } = {},
): Promise<ResolvedCheck & { target?: PinnedTarget }> {
  if (!options.skipValidation) {
    const literal = checkPublicHost(hostname);
    if (!literal.allowed) return literal;
  }

  // An IP literal has nothing to resolve; it is already the address, and the
  // canonical form is what the socket must be given.
  const literalIp = parseIpAddress(hostname);
  if (literalIp) {
    return {
      allowed: true,
      addresses: [literalIp.canonical],
      target: {
        hostname,
        address: literalIp.canonical,
        family: literalIp.version,
        addresses: [literalIp.canonical],
      },
    };
  }

  let records: ResolvedRecord[];
  try {
    records = await resolver(hostname);
  } catch {
    return { allowed: false, reason: 'That hostname could not be resolved.' };
  }

  if (!records.length) {
    return { allowed: false, reason: 'That hostname could not be resolved.' };
  }

  const addresses = records.map((r) => r.address);
  const parsed = records.map((r) => parseIpAddress(r.address));

  // A record we cannot parse is a record we cannot check. Fail closed.
  if (parsed.some((p) => p === null)) {
    return { allowed: false, reason: 'That hostname could not be resolved.', addresses };
  }

  if (!options.skipValidation) {
    for (const ip of parsed) {
      const check = checkPublicHost(ip!.canonical);
      if (!check.allowed) {
        // The reason names the category, never the address: echoing the
        // resolved IP back would turn this guard into the network scanner it
        // exists to prevent.
        return {
          allowed: false,
          reason: 'That hostname resolves to an address we do not fetch from.',
          addresses,
        };
      }
    }
  }

  const chosen = parsed[0]!;
  return {
    allowed: true,
    addresses,
    target: {
      hostname,
      address: chosen.canonical,
      family: chosen.version,
      addresses,
    },
  };
}

/**
 * Resolve a hostname and check every address it maps to.
 *
 * Kept as the narrow, address-only form of `resolveAndPin` for callers that
 * want the verdict without opening anything.
 */
export async function checkResolvedHost(
  hostname: string,
  resolver: Resolver = defaultResolver,
): Promise<ResolvedCheck> {
  const { allowed, reason, addresses } = await resolveAndPin(hostname, resolver);
  return { allowed, reason, addresses };
}

export interface SafeFetchOptions {
  method?: string;
  headers?: HeadersInit;
  body?: string | Uint8Array;
  /** Hops to follow. Each one is resolved, validated and pinned again. */
  maxRedirects?: number;
  /** Total budget for the whole chain, not per hop. */
  timeoutMs?: number;
  /** Cap on each response body, compressed and decompressed alike. */
  maxBytes?: number;
  /**
   * Disable the private-address guard.
   *
   * Exists for one reason: integration tests run a fixture HTTP server on
   * 127.0.0.1, and the guard would correctly refuse it. It is an explicit,
   * greppable opt-in rather than an environment sniff, and
   * `tests/net-fetch.test.ts` asserts that no production call site passes it.
   * Never set this from a route handler.
   *
   * Note that it disables *validation* only. The socket is still pinned to the
   * resolved address, because the pin is what makes the destination knowable.
   */
  allowPrivateHosts?: boolean;
  /** Injectable for tests. Production always uses the pinned transport. */
  transport?: PinnedTransport;
}

const REDIRECT_STATUS = new Set([301, 302, 303, 307, 308]);
const CREDENTIAL_HEADERS = ['authorization', 'cookie', 'x-supertool-key'];

function normalizeHeaders(headers: HeadersInit | undefined): Record<string, string> {
  if (!headers) return {};
  const entries =
    headers instanceof Headers
      ? [...headers.entries()]
      : Array.isArray(headers)
        ? headers
        : Object.entries(headers);

  const out: Record<string, string> = {};
  for (const [key, value] of entries) out[key] = value;
  return out;
}

function stripCredentials(headers: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers)) {
    if (CREDENTIAL_HEADERS.includes(key.toLowerCase())) continue;
    out[key] = value;
  }
  return out;
}

/**
 * `fetch`, with the destination resolved, validated and pinned at every hop.
 *
 * Redirects are followed here rather than by the HTTP client, precisely so the
 * guard runs again on each `Location`. A client that follows redirects itself
 * would hand the choice of final destination to the remote server.
 */
export async function safeFetch(
  url: string,
  options: SafeFetchOptions = {},
  resolver?: Resolver,
): Promise<Response> {
  const {
    maxRedirects = 3,
    timeoutMs = 15_000,
    maxBytes = 5 * 1024 * 1024,
    allowPrivateHosts = false,
    transport = pinnedTransport,
    method = 'GET',
    body,
  } = options;

  let headers = normalizeHeaders(options.headers);
  let current = url;
  const deadline = Date.now() + timeoutMs;

  for (let hop = 0; hop <= maxRedirects; hop++) {
    let parsedUrl: URL;
    try {
      parsedUrl = new URL(current);
    } catch {
      throw new BlockedRequestError('That does not look like a valid URL.', current);
    }

    if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
      throw new BlockedRequestError('Only http and https URLs are supported.', current);
    }

    if (!allowPrivateHosts) {
      const literal = checkPublicUrl(current);
      if (!literal.allowed) {
        throw new BlockedRequestError(literal.reason ?? 'That URL is not allowed.', current);
      }
    }

    const resolved = await resolveAndPin(parsedUrl.hostname, resolver, {
      skipValidation: allowPrivateHosts,
    });
    if (!resolved.allowed || !resolved.target) {
      throw new BlockedRequestError(resolved.reason ?? 'That host is not allowed.', current);
    }

    const remaining = deadline - Date.now();
    if (remaining <= 0) throw new BlockedRequestError('The request timed out.', current);

    let response: Response;
    try {
      response = await transport({
        url: parsedUrl,
        method,
        headers,
        body,
        address: resolved.target.address,
        family: resolved.target.family,
        timeoutMs: remaining,
        maxBytes,
      });
    } catch (err) {
      if (err instanceof PinnedRequestError) throw new BlockedRequestError(err.message, current);
      throw err;
    }

    if (!REDIRECT_STATUS.has(response.status)) return response;

    const location = response.headers.get('location');
    if (!location) return response;

    let next: URL;
    try {
      next = new URL(location, current);
    } catch {
      throw new BlockedRequestError('That redirect did not name a valid URL.', current);
    }

    // A cross-origin redirect must not carry the original Authorization header
    // to a host that was never given the credential.
    if (next.origin !== parsedUrl.origin) headers = stripCredentials(headers);

    current = next.toString();
  }

  throw new BlockedRequestError('Too many redirects.', url);
}
