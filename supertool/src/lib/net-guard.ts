/**
 * SSRF guard for user-supplied URLs.
 *
 * Any endpoint that fetches an address a user typed can be turned into a probe
 * against the server's own network — cloud metadata endpoints being the
 * classic target. Hosts in private, loopback or link-local space are refused.
 *
 * A self-hosted WordPress on a private network is a legitimate thing to own,
 * but our servers cannot reach a customer's LAN anyway, so refusing these
 * costs no real functionality and closes the hole.
 */

export interface HostCheck {
  allowed: boolean;
  reason?: string;
}

export function checkPublicHost(hostname: string): HostCheck {
  const host = hostname.trim().toLowerCase().replace(/^\[|\]$/g, '');

  if (!host) return { allowed: false, reason: 'No hostname supplied.' };

  if (
    host === 'localhost' ||
    host.endsWith('.localhost') ||
    host.endsWith('.local') ||
    host.endsWith('.internal') ||
    host.endsWith('.home.arpa')
  ) {
    return { allowed: false, reason: 'Local hostnames are not reachable from our servers.' };
  }

  const v4 = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (v4) {
    const octets = v4.slice(1).map(Number);
    if (octets.some((o) => o > 255)) return { allowed: false, reason: 'Not a valid IP address.' };
    const [a, b] = octets;

    if (a === 0) return { allowed: false, reason: 'That address range is not routable.' };
    if (a === 127) return { allowed: false, reason: 'Loopback addresses are not allowed.' };
    if (a === 10) return { allowed: false, reason: 'Private addresses are not reachable from our servers.' };
    if (a === 172 && b >= 16 && b <= 31) return { allowed: false, reason: 'Private addresses are not reachable from our servers.' };
    if (a === 192 && b === 168) return { allowed: false, reason: 'Private addresses are not reachable from our servers.' };
    // 169.254.0.0/16 covers the cloud metadata endpoint at 169.254.169.254.
    if (a === 169 && b === 254) return { allowed: false, reason: 'Link-local addresses are not allowed.' };
    if (a === 100 && b >= 64 && b <= 127) return { allowed: false, reason: 'Carrier-grade NAT addresses are not allowed.' };
    if (a >= 224) return { allowed: false, reason: 'Multicast and reserved addresses are not allowed.' };

    return { allowed: true };
  }

  if (host.includes(':')) {
    if (host === '::' || host === '::1') return { allowed: false, reason: 'Loopback addresses are not allowed.' };
    // Unique-local (fc00::/7) and link-local (fe80::/10).
    if (/^f[cd]/.test(host)) return { allowed: false, reason: 'Private addresses are not reachable from our servers.' };
    if (/^fe[89ab]/.test(host)) return { allowed: false, reason: 'Link-local addresses are not allowed.' };
    // IPv4-mapped IPv6, e.g. ::ffff:127.0.0.1
    const mapped = host.match(/::ffff:(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/);
    if (mapped) return checkPublicHost(mapped[1]);
    return { allowed: true };
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
