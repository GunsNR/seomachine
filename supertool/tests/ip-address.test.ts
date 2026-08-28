import { describe, expect, it } from 'vitest';
import { canonicalIPv6, classifyIp, parseIpAddress } from '@/lib/ip-address';

/**
 * A guard that recognises one spelling of an address recognises no addresses.
 *
 * Every case here is a way of writing a blocked address that the previous
 * dotted-quad regex did not recognise as an address at all, and therefore
 * allowed through as an ordinary hostname.
 */

const canonical = (text: string) => parseIpAddress(text)?.canonical;
const allowed = (text: string) => {
  const ip = parseIpAddress(text);
  return ip ? classifyIp(ip).allowed : null;
};

describe('parseIpAddress — IPv4 in every notation a resolver accepts', () => {
  it('reads the notations getaddrinfo reads', () => {
    // Verified against dns.lookup: all four reach 127.0.0.1.
    expect(canonical('127.0.0.1')).toBe('127.0.0.1');
    expect(canonical('127.1')).toBe('127.0.0.1');
    expect(canonical('0177.0.0.1')).toBe('127.0.0.1');
    expect(canonical('2130706433')).toBe('127.0.0.1');
    expect(canonical('0x7f000001')).toBe('127.0.0.1');
    expect(canonical('0300.0250.0.1')).toBe('192.168.0.1');
  });

  it('blocks loopback and private space however it is spelled', () => {
    for (const host of ['127.1', '0177.0.0.1', '2130706433', '0x7f000001', '0300.0250.0.1']) {
      expect(allowed(host), host).toBe(false);
    }
  });

  it('still reads a public address written unusually', () => {
    expect(canonical('0x08.0x08.0x08.0x08')).toBe('8.8.8.8');
    expect(allowed('0x08.0x08.0x08.0x08')).toBe(true);
  });

  it('refuses text that is not an address', () => {
    for (const host of ['example.com', '1.2.3.4.5', '256.1.1.1', '0x', '', '09.1.1.1']) {
      expect(parseIpAddress(host), host).toBeNull();
    }
  });

  it('reads a trailing FQDN dot as the root label, not as a new octet', () => {
    // `1.2.3.` is `1.2.3` with the root label spelled out. Reading it as an
    // address is the fail-closed direction: it gets classified rather than
    // waved through as a hostname.
    expect(canonical('1.2.3.')).toBe('1.2.0.3');
  });
});

describe('parseIpAddress — IPv6', () => {
  it('expands compression and embedded IPv4 to the same bytes', () => {
    // These are three spellings of one address.
    expect(canonical('::ffff:127.0.0.1')).toBe('::ffff:7f00:1');
    expect(canonical('::ffff:7f00:1')).toBe('::ffff:7f00:1');
    expect(canonical('0:0:0:0:0:ffff:127.0.0.1')).toBe('::ffff:7f00:1');
  });

  it('compresses the longest zero run, leftmost on a tie (RFC 5952)', () => {
    expect(canonicalIPv6([0x20, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1])).toBe('2001::1');
    // A longer run later in the address beats a shorter one earlier.
    expect(canonicalIPv6([0x20, 1, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 1])).toBe('2001:0:1::1:0:1');
    // Two runs of equal length: the leftmost is compressed.
    expect(canonicalIPv6([0x20, 1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0, 1])).toBe('2001::1:0:0:1:1');
  });

  it('refuses malformed IPv6', () => {
    for (const host of ['::ffff::1', '1:2:3:4:5:6:7', 'fe80::1::2', ':::', '12345::1', '::ffff:127.1']) {
      expect(parseIpAddress(host), host).toBeNull();
    }
  });

  it('allows global unicast only', () => {
    expect(allowed('2606:4700:4700::1111')).toBe(true);
    // Everything outside 2000::/3 is refused rather than enumerated.
    for (const host of ['::', '::1', '100::1', '2001::1', '2001:db8::1', '2002:7f00:1::', 'fc00::1', 'fd12:3456::1', 'fe80::1', 'fec0::1', 'ff02::1', '3fff:ffff::1']) {
      expect(allowed(host), host).not.toBe(null);
    }
    for (const host of ['::', '::1', '100::1', '2001::1', '2001:db8::1', '2002:7f00:1::', 'fc00::1', 'fe80::1', 'fec0::1', 'ff02::1']) {
      expect(allowed(host), host).toBe(false);
    }
  });

  it('classifies an embedded IPv4 as that IPv4', () => {
    // ::ffff:a9fe:a9fe is the metadata endpoint wearing an IPv6 hat, and it is
    // the form a parsed URL actually produces.
    expect(allowed('::ffff:a9fe:a9fe')).toBe(false);
    expect(allowed('::ffff:169.254.169.254')).toBe(false);
    expect(allowed('64:ff9b::7f00:1')).toBe(false);
    expect(allowed('::ffff:8.8.8.8')).toBe(true);
  });

  it('strips a zone id before parsing', () => {
    expect(allowed('fe80::1%eth0')).toBe(false);
    expect(canonical('[2606:4700::1111]')).toBe('2606:4700::1111');
  });
});

describe('classifyIp — IPv4 ranges', () => {
  it('blocks every reserved and private range', () => {
    const blocked = [
      '0.0.0.0', '10.0.0.1', '100.64.0.1', '100.100.100.200', '127.0.0.1',
      '169.254.169.254', '172.16.0.1', '172.31.255.255', '192.0.0.1', '192.0.2.1',
      '192.88.99.1', '192.168.1.1', '198.18.0.1', '198.51.100.1', '203.0.113.1',
      '224.0.0.1', '240.0.0.1', '255.255.255.255',
    ];
    for (const host of blocked) expect(allowed(host), host).toBe(false);
  });

  it('blocks the Azure metadata address, which no private range covers', () => {
    // 168.63.129.16 is globally routable; only naming it catches it.
    expect(allowed('168.63.129.16')).toBe(false);
    expect(allowed('168.63.129.17')).toBe(true);
  });

  it('does not over-block addresses adjacent to those ranges', () => {
    for (const host of ['172.15.0.1', '172.32.0.1', '192.169.1.1', '11.0.0.1', '100.63.255.255', '100.128.0.1', '198.20.0.1', '8.8.8.8']) {
      expect(allowed(host), host).toBe(true);
    }
  });
});
