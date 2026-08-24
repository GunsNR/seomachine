import { afterEach, describe, expect, it } from 'vitest';
import { clientIp, clientKey, pickForwardedIp, trustedProxyCount } from '@/lib/client-ip';

/**
 * The trust boundary on `X-Forwarded-For`.
 *
 * This header is written by the caller. Before Phase 2 the limiter took its
 * leftmost entry unconditionally, which means the identity it rate-limited on
 * was whatever the attacker typed: rotate the value, reset the window; forge
 * someone else's address, exhaust theirs.
 *
 * The rule under test: with N trusted proxies, only the Nth entry from the
 * right can be believed, because each trusted proxy appends exactly one entry.
 * Everything to its left is caller-controlled fiction.
 */

const req = (headers: Record<string, string>) => new Request('https://example.com', { headers });

afterEach(() => {
  delete process.env.TRUSTED_PROXY_COUNT;
});

describe('trustedProxyCount', () => {
  it('defaults to zero — trust nothing', () => {
    expect(trustedProxyCount({})).toBe(0);
  });

  it('refuses negative, non-numeric and absurd values rather than guessing', () => {
    for (const raw of ['-1', 'two', '', 'NaN', '1.5.2']) {
      expect(trustedProxyCount({ TRUSTED_PROXY_COUNT: raw }), raw).toBeGreaterThanOrEqual(0);
    }
    expect(trustedProxyCount({ TRUSTED_PROXY_COUNT: '-3' })).toBe(0);
    expect(trustedProxyCount({ TRUSTED_PROXY_COUNT: 'two' })).toBe(0);
    // A pathological value would walk off the end of every chain.
    expect(trustedProxyCount({ TRUSTED_PROXY_COUNT: '9999' })).toBe(10);
  });
});

describe('pickForwardedIp', () => {
  const chain = ['1.1.1.1', '2.2.2.2', '3.3.3.3'];

  it('ignores the header entirely when nothing is trusted', () => {
    expect(pickForwardedIp(chain, 0, 'sock')).toBe('sock');
  });

  it('takes the Nth entry from the right for N trusted proxies', () => {
    // One proxy in front: it appended the rightmost entry, which is what it saw.
    expect(pickForwardedIp(chain, 1, 'sock')).toBe('3.3.3.3');
    expect(pickForwardedIp(chain, 2, 'sock')).toBe('2.2.2.2');
    expect(pickForwardedIp(chain, 3, 'sock')).toBe('1.1.1.1');
  });

  it('never returns a caller-controlled entry', () => {
    // With one trusted proxy, the attacker can prepend anything they like to
    // the left of the chain and it must not be selected.
    const forged = ['evil', 'also-evil', '9.9.9.9'];
    expect(pickForwardedIp(forged, 1, 'sock')).toBe('9.9.9.9');
    expect(pickForwardedIp(forged, 1, 'sock')).not.toBe('evil');
  });

  it('falls back to the socket when the chain is shorter than expected', () => {
    // Fewer entries than trusted proxies means the chain is not what the
    // deployment described, so reading any entry would be reading a guess.
    expect(pickForwardedIp(['1.1.1.1'], 3, 'sock')).toBe('sock');
  });

  it('tolerates whitespace and empty entries', () => {
    expect(pickForwardedIp([' 1.1.1.1 ', '', '  ', '2.2.2.2'], 1, 'sock')).toBe('2.2.2.2');
  });
});

describe('clientIp', () => {
  it('ignores a forged header by default', () => {
    expect(clientIp(req({ 'x-forwarded-for': '1.2.3.4' }), {})).toBe('');
  });

  it('uses the header once a proxy is trusted', () => {
    expect(
      clientIp(req({ 'x-forwarded-for': 'forged, 5.6.7.8' }), { TRUSTED_PROXY_COUNT: '1' }),
    ).toBe('5.6.7.8');
  });

  it('prefers a platform-set header over the forwarded chain when untrusted', () => {
    expect(clientIp(req({ 'x-real-ip': '9.9.9.9', 'x-forwarded-for': 'forged' }), {})).toBe(
      '9.9.9.9',
    );
  });
});

describe('clientKey', () => {
  it('buckets every unidentifiable caller together', () => {
    // Deliberate: contending with other anonymous traffic is better than
    // letting a caller mint a fresh identity per request.
    expect(clientKey(req({}), 'audit', {})).toBe('audit:untrusted');
    expect(clientKey(req({ 'x-forwarded-for': 'a' }), 'audit', {})).toBe('audit:untrusted');
    expect(clientKey(req({ 'x-forwarded-for': 'b' }), 'audit', {})).toBe('audit:untrusted');
  });

  it('namespaces by scope so endpoints do not share a budget', () => {
    const r = req({ 'x-real-ip': '1.1.1.1' });
    expect(clientKey(r, 'login', {})).not.toBe(clientKey(r, 'audit', {}));
  });
});
