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
 *
 * Three further things a redirect must not be allowed to do, closed after the
 * pin landed:
 *
 *   - **Carry credentials onward.** Already handled for `Authorization`,
 *     `Cookie` and the API key; `Proxy-Authorization` is one of these too.
 *
 *   - **Replay the request.** A 307 or 308 preserves the method and the body
 *     by definition, and so does a 302 answering anything but a POST. Across
 *     an origin boundary that hands the new host a request its owner never
 *     sent — an article body, say, to whoever controls the redirect. Refused.
 *
 *   - **Outlive the budget.** Resolution now runs inside the caller's
 *     remaining time rather than before the clock is read, so a name server
 *     that never answers fails the request instead of hanging it.
 */

export interface ResolvedRecord {
  address: string;
  family?: number;
}

export type Resolver = (host: string) => Promise<ResolvedRecord[]>;

export interface ResolvedCheck extends HostCheck {
  addresses?: string[];
}

/** Thrown internally when a resolver outlives the budget it was given. */
class ResolverTimeout extends Error {}

/**
 * Wait for a resolver, but not past the deadline.
 *
 * `dns.lookup` cannot be cancelled, so the lookup itself may still be in
 * flight when this rejects. That is fine and it is the point: what matters is
 * that we stop waiting, never learn an address, and therefore never open a
 * socket. A resolver that answers after the deadline answers into a promise
 * nobody is holding.
 */
async function resolveWithin<T>(work: Promise<T>, timeoutMs: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      work,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new ResolverTimeout()), Math.max(1, timeoutMs));
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
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
  options: { skipValidation?: boolean; timeoutMs?: number } = {},
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
    // Resolution runs inside the caller's remaining budget, not outside it. A
    // name server that never answers used to hang the request past its own
    // timeout, because the clock was only consulted once resolution returned.
    records =
      options.timeoutMs === undefined
        ? await resolver(hostname)
        : await resolveWithin(resolver(hostname), options.timeoutMs);
  } catch (err) {
    return {
      allowed: false,
      reason:
        err instanceof ResolverTimeout
          ? 'That hostname took too long to resolve.'
          : 'That hostname could not be resolved.',
    };
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

/**
 * Headers that authenticate the caller. A host reached only because another
 * host redirected us was never given these and must not receive them.
 * `proxy-authorization` belongs here for the same reason the others do.
 */
const CREDENTIAL_HEADERS = ['authorization', 'proxy-authorization', 'cookie', 'x-supertool-key'];

/**
 * Headers that describe a body. When the body is dropped they describe
 * nothing, and a stale `content-length` makes the next request hang waiting
 * for bytes that will never be written.
 */
const BODY_HEADERS = [
  'content-type',
  'content-length',
  'content-encoding',
  'content-language',
  'content-location',
  'transfer-encoding',
];

/** Methods that carry no intent to modify the target. */
function isSafeMethod(method: string): boolean {
  const upper = method.toUpperCase();
  return upper === 'GET' || upper === 'HEAD';
}

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

function stripHeaders(headers: Record<string, string>, names: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers)) {
    if (names.includes(key.toLowerCase())) continue;
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
  // Method and body are rewritten as redirects are followed, so they cannot
  // stay the caller's constants.
  let currentMethod = method;
  let currentBody: string | Uint8Array | undefined = body;
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

    const beforeResolving = deadline - Date.now();
    if (beforeResolving <= 0) throw new BlockedRequestError('The request timed out.', current);

    const resolved = await resolveAndPin(parsedUrl.hostname, resolver, {
      skipValidation: allowPrivateHosts,
      timeoutMs: beforeResolving,
    });
    if (!resolved.allowed || !resolved.target) {
      throw new BlockedRequestError(resolved.reason ?? 'That host is not allowed.', current);
    }

    // Resolution spent part of the budget; the connection gets what is left.
    const remaining = deadline - Date.now();
    if (remaining <= 0) throw new BlockedRequestError('The request timed out.', current);

    let response: Response;
    try {
      response = await transport({
        url: parsedUrl,
        method: currentMethod,
        headers,
        body: currentBody,
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

    const crossOrigin = next.origin !== parsedUrl.origin;

    // Method and body rewriting, per RFC 9110 §15.4. A redirect is not a
    // replay: a 303, and a 302 answering a POST, both mean "go look over
    // there", not "send that again".
    let nextMethod = currentMethod;
    let dropBody = false;

    if (response.status === 303 && !isSafeMethod(currentMethod)) {
      nextMethod = 'GET';
      dropBody = true;
    } else if ((response.status === 301 || response.status === 302) && currentMethod.toUpperCase() === 'POST') {
      nextMethod = 'GET';
      dropBody = true;
    }

    // 307 and 308 preserve the method and the body by definition, and so does
    // a 301 or 302 answering anything other than a POST. Across an origin
    // boundary that is a request the new host never asked for, carrying data
    // its owner never sent us — an article body, say, on its way to whoever
    // controls the redirect. Refuse rather than replay.
    if (crossOrigin && (!isSafeMethod(nextMethod) || (!dropBody && currentBody !== undefined))) {
      throw new BlockedRequestError(
        'That redirect would have repeated this request, and its body, against a different origin.',
        current,
      );
    }

    // A cross-origin redirect must not carry credentials to a host that was
    // never given them.
    if (crossOrigin) headers = stripHeaders(headers, CREDENTIAL_HEADERS);

    if (dropBody) {
      currentBody = undefined;
      // The body is gone, so the headers describing it are lies. A leftover
      // content-length is worse than a lie: the next request waits forever
      // for bytes nobody will write.
      headers = stripHeaders(headers, BODY_HEADERS);
    }

    currentMethod = nextMethod;
    current = next.toString();
  }

  throw new BlockedRequestError('Too many redirects.', url);
}
