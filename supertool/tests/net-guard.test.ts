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
