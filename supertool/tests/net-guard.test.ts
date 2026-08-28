import { describe, expect, it } from 'vitest';
import { checkPublicHost, checkPublicUrl } from '@/lib/net-guard';

describe('checkPublicHost', () => {
  it('allows ordinary public hostnames', () => {
    for (const host of ['example.com', 'www.example.co.uk', 'sub.domain.example.io', '8.8.8.8']) {
      expect(checkPublicHost(host).allowed, host).toBe(true);
    }
  });

  it('blocks loopback', () => {
    for (const host of ['localhost', '127.0.0.1', '127.1.2.3', '::1', 'app.localhost']) {
      expect(checkPublicHost(host).allowed, host).toBe(false);
    }
  });

  it('blocks RFC1918 private ranges', () => {
    for (const host of ['10.0.0.1', '172.16.0.1', '172.31.255.255', '192.168.1.1']) {
      expect(checkPublicHost(host).allowed, host).toBe(false);
    }
  });

  it('allows public addresses adjacent to private ranges', () => {
    // 172.15 and 172.32 sit outside 172.16/12 and must not be caught.
    for (const host of ['172.15.0.1', '172.32.0.1', '192.169.1.1', '11.0.0.1']) {
      expect(checkPublicHost(host).allowed, host).toBe(true);
    }
  });

  it('blocks the cloud metadata endpoint', () => {
    expect(checkPublicHost('169.254.169.254').allowed).toBe(false);
  });

  it('blocks IPv6 private and link-local space', () => {
    for (const host of ['fc00::1', 'fd12:3456::1', 'fe80::1', '[::1]']) {
      expect(checkPublicHost(host).allowed, host).toBe(false);
    }
  });

  it('blocks IPv4-mapped IPv6 loopback', () => {
    expect(checkPublicHost('::ffff:127.0.0.1').allowed).toBe(false);
    expect(checkPublicHost('::ffff:169.254.169.254').allowed).toBe(false);
  });

  it('blocks internal-only suffixes and bare names', () => {
    for (const host of ['db.internal', 'printer.local', 'router.home.arpa', 'intranet']) {
      expect(checkPublicHost(host).allowed, host).toBe(false);
    }
  });

  it('blocks reserved, multicast and malformed addresses', () => {
    for (const host of ['0.0.0.0', '224.0.0.1', '255.255.255.255', '999.1.1.1', '']) {
      expect(checkPublicHost(host).allowed, host).toBe(false);
    }
  });

  it('is case-insensitive and tolerates surrounding whitespace', () => {
    expect(checkPublicHost('  LOCALHOST  ').allowed).toBe(false);
    expect(checkPublicHost('  Example.COM  ').allowed).toBe(true);
  });

  it('always explains why it refused', () => {
    const result = checkPublicHost('10.0.0.1');
    expect(result.allowed).toBe(false);
    expect(result.reason).toBeTruthy();
  });
});

describe('checkPublicUrl', () => {
  it('accepts a normal https URL', () => {
    const r = checkPublicUrl('https://example.com/wp-json');
    expect(r.allowed).toBe(true);
    expect(r.parsed?.hostname).toBe('example.com');
  });

  it('rejects non-http schemes that could reach the filesystem or internals', () => {
    for (const url of ['file:///etc/passwd', 'gopher://example.com', 'ftp://example.com']) {
      expect(checkPublicUrl(url).allowed, url).toBe(false);
    }
  });

  it('rejects an unparseable URL', () => {
    expect(checkPublicUrl('not a url').allowed).toBe(false);
  });

  it('rejects a public-looking URL that resolves to a private host', () => {
    expect(checkPublicUrl('http://192.168.0.10:8080/wp-json').allowed).toBe(false);
  });
});

describe('checkPublicHost — spellings the dotted-quad check could not see', () => {
  it('blocks loopback written in octal, hex, decimal and short form', () => {
    // Each of these reaches 127.0.0.1 through getaddrinfo, and each was
    // previously allowed: no dotted quad matched, so they fell through as
    // ordinary hostnames.
    for (const host of ['127.1', '0177.0.0.1', '0x7f000001', '2130706433', '0x7f.0.0.1']) {
      expect(checkPublicHost(host).allowed, host).toBe(false);
    }
  });

  it('blocks private space written in octal', () => {
    expect(checkPublicHost('0300.0250.0.1').allowed).toBe(false);
  });

  it('blocks the IPv4-mapped form a URL parser actually produces', () => {
    // new URL('http://[::ffff:127.0.0.1]/').hostname is '[::ffff:7f00:1]', so
    // a check written against the dotted spelling never fired in production.
    for (const host of ['::ffff:7f00:1', '[::ffff:7f00:1]', '::ffff:a9fe:a9fe', '0:0:0:0:0:ffff:127.0.0.1']) {
      expect(checkPublicHost(host).allowed, host).toBe(false);
    }
  });

  it('blocks IPv6 ranges outside global unicast', () => {
    for (const host of ['::', '100::1', '2001::1', '2001:db8::1', '2002:7f00:1::', '64:ff9b::7f00:1', 'fec0::1', 'ff02::1']) {
      expect(checkPublicHost(host).allowed, host).toBe(false);
    }
  });

  it('allows a real public IPv6 address', () => {
    const result = checkPublicHost('2606:4700:4700::1111');
    expect(result.allowed).toBe(true);
    expect(result.canonicalAddress).toBe('2606:4700:4700::1111');
  });

  it('blocks a link-local address carrying a zone id', () => {
    expect(checkPublicHost('fe80::1%eth0').allowed).toBe(false);
  });

  it('blocks reserved IPv4 ranges the previous table omitted', () => {
    for (const host of ['192.0.0.1', '192.0.2.1', '192.88.99.1', '198.18.0.1', '198.51.100.1', '203.0.113.1']) {
      expect(checkPublicHost(host).allowed, host).toBe(false);
    }
  });

  it('blocks the Azure metadata address, which is globally routable', () => {
    expect(checkPublicHost('168.63.129.16').allowed).toBe(false);
  });

  it('normalizes a trailing FQDN dot before deciding', () => {
    // 'localhost.' and 'localhost' name the same host to a resolver.
    expect(checkPublicHost('localhost.').allowed).toBe(false);
    expect(checkPublicHost('db.internal.').allowed).toBe(false);
    expect(checkPublicHost('example.com.').allowed).toBe(true);
  });

  it('returns the canonical address so the caller can pin to it', () => {
    expect(checkPublicHost('0x08.0x08.0x08.0x08').canonicalAddress).toBe('8.8.8.8');
    expect(checkPublicHost('example.com').canonicalAddress).toBeUndefined();
  });
});

describe('checkPublicUrl — the host as the URL parser hands it over', () => {
  it('blocks an IPv4-mapped IPv6 URL', () => {
    // The parser rewrites this to [::ffff:7f00:1] before the guard sees it.
    expect(checkPublicUrl('http://[::ffff:127.0.0.1]/').allowed).toBe(false);
  });

  it('blocks a URL whose host is loopback in an unusual notation', () => {
    for (const url of ['http://0177.0.0.1/', 'http://127.1/', 'http://2130706433/']) {
      expect(checkPublicUrl(url).allowed, url).toBe(false);
    }
  });

  it('allows a normal public URL with a port and credentials-free path', () => {
    expect(checkPublicUrl('https://example.com:8443/wp-json/wp/v2/posts').allowed).toBe(true);
  });
});
