/**
 * SSRF guard for user-supplied URLs.
 *
 * Any endpoint that fetches an address a user typed can be turned into a probe
 * against the server's own network — cloud metadata endpoints being the
 * classic target. Hosts in private, loopback, link-local, multicast or
 * reserved space are refused, in either address family.
 *
 * A self-hosted WordPress on a private network is a legitimate thing to own,
 * but our servers cannot reach a customer's LAN anyway, so refusing these
 * costs no real functionality and closes the hole.
 *
 * This module checks the *literal* host. It is the first of three gates, and
 * on its own it is not sufficient — a hostname is not an address. `net-fetch.ts`
 * adds resolution and `net-pinned.ts` adds the pinned socket.
 */

import { classifyIp, normalizeHostText, parseIpAddress } from './ip-address';

export interface HostCheck {
  allowed: boolean;
  reason?: string;
  /**
   * Set when the host was an IP literal: the address in canonical form.
   *
   * Callers must connect to *this*, not to the text the user supplied.
   * `0177.0.0.1` and `127.0.0.1` are one address, and only one of them is a
   * form the rest of the stack recognises.
   */
  canonicalAddress?: string;
}

/**
 * Suffixes that never name a host on the public internet. `.local` is mDNS,
 * `.home.arpa` is RFC 8375, and `.internal` is what every cloud provider
 * points at its own metadata and service endpoints.
 */
const LOCAL_SUFFIXES = ['.localhost', '.local', '.internal', '.home.arpa', '.lan', '.localdomain'];

/**
 * Does this look like an attempt at an IP address?
 *
 * Anything with a colon, or made only of numeric labels in any base. No public
 * TLD is all-numeric, so nothing legitimate is caught here.
 */
function looksLikeAddress(host: string): boolean {
  if (host.includes(':')) return true;
  return /^(0[xX][0-9a-fA-F]+|[0-9]+)(\.(0[xX][0-9a-fA-F]+|[0-9]+))*$/.test(host);
}

export function checkPublicHost(hostname: string): HostCheck {
  const host = normalizeHostText(hostname);

  if (!host) return { allowed: false, reason: 'No hostname supplied.' };

  // An address in any notation is classified as an address, never as a name.
  // `127.1` and `0x7f000001` both resolve to loopback, and a check that only
  // recognises dotted quads would pass them through as hostnames.
  const ip = parseIpAddress(host);
  if (ip) {
    const verdict = classifyIp(ip);
    return verdict.allowed
      ? { allowed: true, canonicalAddress: ip.canonical }
      : { allowed: false, reason: verdict.reason };
  }

  // A host that is *trying* to be an address and failing is refused rather
  // than demoted to a hostname: `999.1.1.1` is not a domain anybody owns, and
  // treating a malformed address as a name is how a guard gets talked past.
  if (looksLikeAddress(host)) {
    return { allowed: false, reason: 'Not a valid IP address.' };
  }

  if (host === 'localhost' || LOCAL_SUFFIXES.some((suffix) => host.endsWith(suffix))) {
    return { allowed: false, reason: 'Local hostnames are not reachable from our servers.' };
  }

  // A bare name with no dot cannot be a public domain.
  if (!host.includes('.')) {
    return { allowed: false, reason: 'Enter a fully-qualified public hostname.' };
  }

  return { allowed: true };
}

/** Convenience wrapper that parses a URL and checks its host. */
export function checkPublicUrl(url: string): HostCheck & { parsed?: URL } {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return { allowed: false, reason: 'That does not look like a valid URL.' };
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return { allowed: false, reason: 'Only http and https URLs are supported.' };
  }

  const check = checkPublicHost(parsed.hostname);
  return { ...check, parsed };
}
