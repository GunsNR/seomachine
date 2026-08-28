/**
 * IP address parsing and classification.
 *
 * The SSRF guard used to recognise exactly one address format: a dotted quad
 * of one-to-three decimal digits. An address is not a format, and every other
 * spelling of `127.0.0.1` walked straight through:
 *
 *   - `127.1`, `0177.0.0.1`, `0x7f.0.0.1`, `2130706433` — `getaddrinfo`
 *     accepts all of these (see `inet_aton(3)`), so they reach the socket as
 *     loopback while reading as an ordinary hostname to a regex.
 *   - `::ffff:7f00:1` — the IPv4-mapped form the WHATWG URL parser actually
 *     produces. `new URL('http://[::ffff:127.0.0.1]/').hostname` returns the
 *     hex spelling, so a check written against the dotted spelling never fired
 *     on a real parsed URL.
 *
 * So this module parses to bytes and classifies bytes. A spelling cannot hide
 * an address from a comparison made on its 4 or 16 octets.
 */

export type IpVersion = 4 | 6;

export interface ParsedIp {
  version: IpVersion;
  /** 4 octets for IPv4, 16 for IPv6. */
  bytes: number[];
  /** Dotted quad, or RFC 5952 lower-case compressed IPv6. */
  canonical: string;
}

export interface IpVerdict {
  allowed: boolean;
  /** Category of the refusal, for the caller's message. Never the address. */
  reason?: string;
}

/** Strip brackets, an IPv6 zone id and a trailing FQDN dot. */
export function normalizeHostText(host: string): string {
  let value = host.trim().toLowerCase();
  if (value.startsWith('[') && value.endsWith(']')) value = value.slice(1, -1);
  // A zone id (`fe80::1%eth0`) names a local interface and is never public,
  // but it must be stripped before parsing so the address underneath is seen.
  const zone = value.indexOf('%');
  if (zone !== -1) value = value.slice(0, zone);
  // `localhost.` and `localhost` are the same name to a resolver.
  while (value.endsWith('.') && value.length > 1) value = value.slice(0, -1);
  return value;
}

/**
 * Parse one part of a loose IPv4 address the way `inet_aton` does: a leading
 * `0x` means hex, a leading `0` means octal, anything else is decimal.
 */
function parseIPv4Part(part: string): number | null {
  if (!part) return null;

  if (/^0[xX][0-9a-fA-F]+$/.test(part)) return Number.parseInt(part.slice(2), 16);
  if (/^0[0-7]+$/.test(part)) return Number.parseInt(part.slice(1), 8);
  if (/^(0|[1-9][0-9]*)$/.test(part)) return Number.parseInt(part, 10);

  return null;
}

/**
 * Parse IPv4 in every notation a resolver accepts, not just the dotted quad.
 *
 * With fewer than four parts the final part absorbs the remaining octets, so
 * `127.1` is `127.0.0.1` and `2130706433` is the same address again.
 */
export function parseIPv4(text: string): ParsedIp | null {
  const parts = text.split('.');
  if (parts.length < 1 || parts.length > 4) return null;

  const values: number[] = [];
  for (const part of parts) {
    const value = parseIPv4Part(part);
    if (value === null || !Number.isSafeInteger(value) || value < 0) return null;
    values.push(value);
  }

  // Every part but the last holds a single octet; the last holds the rest.
  const tailWidth = 4 - (values.length - 1);
  for (let i = 0; i < values.length - 1; i++) {
    if (values[i] > 255) return null;
  }
  const tail = values[values.length - 1];
  if (tail >= 2 ** (8 * tailWidth)) return null;

  const bytes = values.slice(0, -1);
  for (let i = tailWidth - 1; i >= 0; i--) {
    bytes.push((tail >>> (8 * i)) & 0xff);
  }

  return { version: 4, bytes, canonical: bytes.join('.') };
}

/** Parse IPv6, including `::` compression and a trailing embedded IPv4. */
export function parseIPv6(text: string): ParsedIp | null {
  if (!text.includes(':')) return null;

  const doubleColon = text.indexOf('::');
  if (doubleColon !== text.lastIndexOf('::')) return null;

  const head = doubleColon === -1 ? text : text.slice(0, doubleColon);
  const tail = doubleColon === -1 ? '' : text.slice(doubleColon + 2);

  const readGroups = (section: string): number[] | null => {
    if (!section) return [];
    const groups = section.split(':');
    const bytes: number[] = [];

    for (let i = 0; i < groups.length; i++) {
      const group = groups[i];
      const last = i === groups.length - 1;

      // Only the final group may be a dotted IPv4, and only in strict form:
      // a resolver does not accept `::ffff:127.1`.
      if (last && group.includes('.')) {
        if (!/^\d{1,3}(\.\d{1,3}){3}$/.test(group)) return null;
        const embedded = parseIPv4(group);
        if (!embedded) return null;
        bytes.push(...embedded.bytes);
        continue;
      }

      if (!/^[0-9a-fA-F]{1,4}$/.test(group)) return null;
      const value = Number.parseInt(group, 16);
      bytes.push((value >>> 8) & 0xff, value & 0xff);
    }

    return bytes;
  };

  const headBytes = readGroups(head);
  const tailBytes = readGroups(tail);
  if (!headBytes || !tailBytes) return null;

  if (doubleColon === -1) {
    if (headBytes.length !== 16) return null;
    return { version: 6, bytes: headBytes, canonical: canonicalIPv6(headBytes) };
  }

  const gap = 16 - headBytes.length - tailBytes.length;
  // `::` must stand for at least one zero group, or it is a misspelling.
  if (gap < 2) return null;

  const bytes = [...headBytes, ...new Array<number>(gap).fill(0), ...tailBytes];
  return { version: 6, bytes, canonical: canonicalIPv6(bytes) };
}

/** RFC 5952: lower-case, no leading zeros, longest zero run compressed once. */
export function canonicalIPv6(bytes: number[]): string {
  const groups: number[] = [];
  for (let i = 0; i < 16; i += 2) groups.push((bytes[i] << 8) | bytes[i + 1]);

  let bestStart = -1;
  let bestLength = 0;
  let start = -1;
  for (let i = 0; i <= groups.length; i++) {
    if (i < groups.length && groups[i] === 0) {
      if (start === -1) start = i;
    } else if (start !== -1) {
      const length = i - start;
      // Strictly greater keeps the leftmost run on a tie, as the RFC requires.
      if (length > bestLength) {
        bestLength = length;
        bestStart = start;
      }
      start = -1;
    }
  }

  const text = groups.map((g) => g.toString(16));
  if (bestLength < 2) return text.join(':');

  const head = text.slice(0, bestStart).join(':');
  const tail = text.slice(bestStart + bestLength).join(':');
  return `${head}::${tail}`;
}

/** Parse an address in any notation, or return null if it is not one. */
export function parseIpAddress(text: string): ParsedIp | null {
  const value = normalizeHostText(text);
  if (!value) return null;
  if (value.includes(':')) return parseIPv6(value);
  return parseIPv4(value);
}

interface Range {
  /** Leading octets the address must match. */
  prefix: number[];
  /** Bits of significance, for ranges that do not stop on an octet boundary. */
  bits: number;
  reason: string;
}

function inRange(bytes: number[], range: Range): boolean {
  const whole = Math.floor(range.bits / 8);
  for (let i = 0; i < whole; i++) {
    if (bytes[i] !== range.prefix[i]) return false;
  }
  const remainder = range.bits % 8;
  if (remainder === 0) return true;
  const mask = (0xff << (8 - remainder)) & 0xff;
  return (bytes[whole] & mask) === (range.prefix[whole] & mask);
}

const PRIVATE = 'Private addresses are not reachable from our servers.';
const LOOPBACK = 'Loopback addresses are not allowed.';
const LINK_LOCAL = 'Link-local addresses are not allowed.';
const RESERVED = 'That address range is not routable.';
const METADATA = 'Cloud metadata addresses are not allowed.';

/**
 * Every IPv4 range we refuse. `169.254.0.0/16` is what actually covers the
 * common cloud metadata endpoint at `169.254.169.254`.
 */
const BLOCKED_V4: Range[] = [
  { prefix: [0, 0, 0, 0], bits: 8, reason: RESERVED },
  { prefix: [10, 0, 0, 0], bits: 8, reason: PRIVATE },
  { prefix: [100, 64, 0, 0], bits: 10, reason: PRIVATE },
  { prefix: [127, 0, 0, 0], bits: 8, reason: LOOPBACK },
  { prefix: [169, 254, 0, 0], bits: 16, reason: LINK_LOCAL },
  { prefix: [172, 16, 0, 0], bits: 12, reason: PRIVATE },
  // Azure's instance metadata service is a globally routable address, so no
  // range above covers it and it has to be named.
  { prefix: [168, 63, 129, 16], bits: 32, reason: METADATA },
  { prefix: [192, 0, 0, 0], bits: 24, reason: RESERVED },
  { prefix: [192, 0, 2, 0], bits: 24, reason: RESERVED },
  { prefix: [192, 88, 99, 0], bits: 24, reason: RESERVED },
  { prefix: [192, 168, 0, 0], bits: 16, reason: PRIVATE },
  { prefix: [198, 18, 0, 0], bits: 15, reason: RESERVED },
  { prefix: [198, 51, 100, 0], bits: 24, reason: RESERVED },
  { prefix: [203, 0, 113, 0], bits: 24, reason: RESERVED },
  { prefix: [224, 0, 0, 0], bits: 4, reason: 'Multicast addresses are not allowed.' },
  { prefix: [240, 0, 0, 0], bits: 4, reason: RESERVED },
];

function classifyIPv4(bytes: number[]): IpVerdict {
  for (const range of BLOCKED_V4) {
    if (inRange(bytes, range)) return { allowed: false, reason: range.reason };
  }
  return { allowed: true };
}

const V6_PREFIXES = {
  mapped: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0xff, 0xff],
  nat64: [0, 0x64, 0xff, 0x9b, 0, 0, 0, 0, 0, 0, 0, 0],
};

function startsWith(bytes: number[], prefix: number[]): boolean {
  return prefix.every((byte, i) => bytes[i] === byte);
}

/**
 * IPv6 is allow-listed rather than block-listed: only global unicast
 * (`2000::/3`) passes, minus the carve-outs inside it. The address space is
 * far too large to enumerate what is unsafe, so anything not known-public is
 * refused.
 */
function classifyIPv6(bytes: number[]): IpVerdict {
  // An address that embeds an IPv4 address is that address, wearing a hat.
  if (startsWith(bytes, V6_PREFIXES.mapped)) return classifyIPv4(bytes.slice(12));
  if (startsWith(bytes, V6_PREFIXES.nat64)) return classifyIPv4(bytes.slice(12));

  if (bytes.every((b) => b === 0)) return { allowed: false, reason: RESERVED };
  if (bytes.slice(0, 15).every((b) => b === 0) && bytes[15] === 1) {
    return { allowed: false, reason: LOOPBACK };
  }
  // Anything else in ::/96 is IPv4-compatible or reserved; neither is public.
  if (bytes.slice(0, 12).every((b) => b === 0)) return { allowed: false, reason: RESERVED };

  const blocked: Range[] = [
    { prefix: [0x01, 0, 0, 0], bits: 32, reason: RESERVED },
    { prefix: [0x00, 0x64, 0xff, 0x9b, 0, 0], bits: 48, reason: RESERVED },
    { prefix: [0x01, 0x00, 0, 0, 0, 0, 0, 0], bits: 64, reason: RESERVED },
    { prefix: [0x20, 0x01, 0, 0], bits: 32, reason: RESERVED }, // Teredo
    { prefix: [0x20, 0x01, 0x00, 0x20], bits: 28, reason: RESERVED }, // ORCHIDv2
    { prefix: [0x20, 0x01, 0x0d, 0xb8], bits: 32, reason: RESERVED }, // documentation
    { prefix: [0x20, 0x02], bits: 16, reason: RESERVED }, // 6to4, deprecated
    { prefix: [0xfc, 0], bits: 7, reason: PRIVATE }, // unique-local
    { prefix: [0xfe, 0x80], bits: 10, reason: LINK_LOCAL },
    { prefix: [0xfe, 0xc0], bits: 10, reason: PRIVATE }, // site-local, deprecated
    { prefix: [0xff, 0], bits: 8, reason: 'Multicast addresses are not allowed.' },
  ];

  for (const range of blocked) {
    if (inRange(bytes, range)) return { allowed: false, reason: range.reason };
  }

  if ((bytes[0] & 0xe0) !== 0x20) return { allowed: false, reason: RESERVED };

  return { allowed: true };
}

/** Classify a parsed address as publicly routable or not. */
export function classifyIp(ip: ParsedIp): IpVerdict {
  return ip.version === 4 ? classifyIPv4(ip.bytes) : classifyIPv6(ip.bytes);
}
