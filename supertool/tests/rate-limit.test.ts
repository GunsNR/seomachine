import { describe, expect, it } from 'vitest';
import { clientKey, rateLimit, rateLimitHeaders } from '@/lib/rate-limit';

/** Unique scope per test so windows never leak between cases. */
let n = 0;
const key = () => `test-${Date.now()}-${n++}`;

describe('rateLimit', () => {
  it('allows requests up to the limit, then refuses', () => {
    const k = key();
    for (let i = 0; i < 3; i++) {
      expect(rateLimit(k, 3, 60_000).ok).toBe(true);
    }
    expect(rateLimit(k, 3, 60_000).ok).toBe(false);
  });

  it('counts down remaining and never goes negative', () => {
    const k = key();
    expect(rateLimit(k, 2, 60_000).remaining).toBe(1);
    expect(rateLimit(k, 2, 60_000).remaining).toBe(0);
    expect(rateLimit(k, 2, 60_000).remaining).toBe(0);
  });

  it('keeps separate keys independent', () => {
    const a = key();
    const b = key();
    rateLimit(a, 1, 60_000);
    expect(rateLimit(a, 1, 60_000).ok).toBe(false);
    expect(rateLimit(b, 1, 60_000).ok).toBe(true);
  });

  it('starts a fresh window once the old one expires', async () => {
    const k = key();
    expect(rateLimit(k, 1, 20).ok).toBe(true);
    expect(rateLimit(k, 1, 20).ok).toBe(false);
    await new Promise((r) => setTimeout(r, 35));
    expect(rateLimit(k, 1, 20).ok).toBe(true);
  });

  it('reports a positive retry-after only when blocked', () => {
    const k = key();
    expect(rateLimit(k, 1, 60_000).retryAfterSeconds).toBe(0);
    const blocked = rateLimit(k, 1, 60_000);
    expect(blocked.ok).toBe(false);
    expect(blocked.retryAfterSeconds).toBeGreaterThan(0);
  });
});

describe('rateLimitHeaders', () => {
  it('omits Retry-After while requests are still allowed', () => {
    const headers = rateLimitHeaders(rateLimit(key(), 5, 60_000));
    expect(headers['X-RateLimit-Limit']).toBe('5');
    expect(headers['Retry-After']).toBeUndefined();
  });

  it('includes Retry-After once blocked', () => {
    const k = key();
    rateLimit(k, 1, 60_000);
    const headers = rateLimitHeaders(rateLimit(k, 1, 60_000));
    expect(headers['Retry-After']).toBeDefined();
  });
});

describe('clientKey', () => {
  const req = (headers: Record<string, string>) =>
    new Request('https://example.com', { headers });

  it('prefers the first x-forwarded-for hop', () => {
    expect(clientKey(req({ 'x-forwarded-for': '1.2.3.4, 5.6.7.8' }), 'audit')).toBe('audit:1.2.3.4');
  });

  it('falls back to x-real-ip', () => {
    expect(clientKey(req({ 'x-real-ip': '9.9.9.9' }), 'audit')).toBe('audit:9.9.9.9');
  });

  it('degrades to a shared bucket when no client IP is present', () => {
    expect(clientKey(req({}), 'audit')).toBe('audit:unknown');
  });

  it('namespaces by scope so endpoints do not share a budget', () => {
    const headers = { 'x-forwarded-for': '1.2.3.4' };
    expect(clientKey(req(headers), 'a')).not.toBe(clientKey(req(headers), 'b'));
  });
});
