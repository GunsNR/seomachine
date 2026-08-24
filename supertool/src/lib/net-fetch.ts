import 'server-only';
import { lookup } from 'node:dns/promises';
import { checkPublicHost, checkPublicUrl, type HostCheck } from './net-guard';

/**
 * SSRF-safe fetching.
 *
 * `net-guard.ts` checks the *literal* hostname. That stops the obvious attacks
 * — `http://127.0.0.1/`, `http://169.254.169.254/` — and nothing else, because
 * a hostname is not an address. Two holes remained after Gate 0:
 *
 *   1. **DNS.** `evil.example.com` is a perfectly ordinary public hostname that
 *      passes every string check, and its A record can be `127.0.0.1`. The
 *      literal check cannot see that; only resolution can.
 *
 *   2. **Redirects.** A URL that passes every check can answer `302` to
 *      `http://169.254.169.254/`. `fetch` follows redirects by default, so the
 *      guard ran once on a safe URL and the request ended up somewhere else.
 *
 * This module closes both: resolve every hostname and check every returned
 * address, then follow redirects manually so each hop is checked the same way.
 *
 * **What it does not close.** Between the check and the connection, the name
 * can be re-resolved to a different address — classic DNS rebinding. Fully
 * closing that needs the socket pinned to the address that was validated, which
 * means a custom agent per request. That is recorded in the runbook as a known
 * residual risk rather than quietly ignored; the redirect and resolution checks
 * remove the practical attacks, and the remaining window is narrow and racy.
 */

export interface ResolvedCheck extends HostCheck {
  addresses?: string[];
}

/**
 * Resolve a hostname and check every address it maps to.
 *
 * *Every* address, not the first: a name with both a public and a private A
 * record is not safe merely because the public one sorted first.
 */
export async function checkResolvedHost(
  hostname: string,
  resolver: (host: string) => Promise<Array<{ address: string }>> = defaultResolver,
): Promise<ResolvedCheck> {
  const literal = checkPublicHost(hostname);
  if (!literal.allowed) return literal;

  // An IP literal has nothing to resolve; the literal check already covered it.
  if (isIpLiteral(hostname)) return { allowed: true, addresses: [hostname] };

  let records: Array<{ address: string }>;
  try {
    records = await resolver(hostname);
  } catch {
    return { allowed: false, reason: 'That hostname could not be resolved.' };
  }

  if (!records.length) {
    return { allowed: false, reason: 'That hostname could not be resolved.' };
  }

  const addresses = records.map((r) => r.address);

  for (const address of addresses) {
    const check = checkPublicHost(address);
    if (!check.allowed) {
      // The reason names the category, never the address: echoing the resolved
      // IP back would turn this guard into the network scanner it exists to
      // prevent.
      return {
        allowed: false,
        reason: 'That hostname resolves to an address we do not fetch from.',
        addresses,
      };
    }
  }

  return { allowed: true, addresses };
}

async function defaultResolver(host: string): Promise<Array<{ address: string }>> {
  const result = await lookup(host, { all: true, verbatim: true });
  return result.map((r) => ({ address: r.address }));
}

function isIpLiteral(host: string): boolean {
  const bare = host.replace(/^\[|\]$/g, '');
  return /^\d{1,3}(\.\d{1,3}){3}$/.test(bare) || bare.includes(':');
}

export interface SafeFetchOptions extends Omit<RequestInit, 'redirect'> {
  /** Hops to follow. Each one is re-validated. */
  maxRedirects?: number;
  timeoutMs?: number;
  /**
   * Disable the private-address guard.
   *
   * Exists for one reason: integration tests run a fixture HTTP server on
   * 127.0.0.1, and the guard would correctly refuse it. It is an explicit,
   * greppable opt-in rather than an environment sniff, and
   * `tests/net-fetch.test.ts` asserts that no production call site passes it.
   * Never set this from a route handler.
   */
  allowPrivateHosts?: boolean;
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

/**
 * `fetch`, with the destination validated at every hop.
 *
 * Redirects are followed manually (`redirect: 'manual'`) precisely so the guard
 * runs again on each `Location`. Handing `redirect: 'follow'` to `fetch` would
 * hand control of the final destination to the remote server.
 */
export async function safeFetch(
  url: string,
  options: SafeFetchOptions = {},
  resolver?: (host: string) => Promise<Array<{ address: string }>>,
): Promise<Response> {
  const { maxRedirects = 3, timeoutMs = 15_000, allowPrivateHosts = false, ...init } = options;

  let current = url;

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
      const parsed = checkPublicUrl(current);
      if (!parsed.allowed || !parsed.parsed) {
        throw new BlockedRequestError(parsed.reason ?? 'That URL is not allowed.', current);
      }

      const resolved = await checkResolvedHost(parsed.parsed.hostname, resolver);
      if (!resolved.allowed) {
        throw new BlockedRequestError(resolved.reason ?? 'That host is not allowed.', current);
      }
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    let response: Response;
    try {
      response = await fetch(current, { ...init, redirect: 'manual', signal: controller.signal });
    } finally {
      clearTimeout(timer);
    }

    if (![301, 302, 303, 307, 308].includes(response.status)) return response;

    const location = response.headers.get('location');
    if (!location) return response;

    const next = new URL(location, current).toString();

    // A cross-origin redirect must not carry the original Authorization header
    // to a host that was never given the credential.
    if (new URL(next).origin !== parsedUrl.origin && init.headers) {
      init.headers = stripAuthHeaders(init.headers);
    }

    current = next;
  }

  throw new BlockedRequestError('Too many redirects.', url);
}

function stripAuthHeaders(headers: HeadersInit): Record<string, string> {
  const out: Record<string, string> = {};
  const entries =
    headers instanceof Headers
      ? [...headers.entries()]
      : Array.isArray(headers)
        ? headers
        : Object.entries(headers);

  for (const [key, value] of entries) {
    if (['authorization', 'cookie', 'x-supertool-key'].includes(key.toLowerCase())) continue;
    out[key] = value;
  }
  return out;
}
