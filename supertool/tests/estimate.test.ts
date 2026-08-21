import { describe, expect, it } from 'vitest';
import { estimateKeyword } from '@/lib/seo/estimate';

describe('estimateKeyword', () => {
  it('is deterministic for the same phrase', () => {
    expect(estimateKeyword('ai search visibility')).toEqual(estimateKeyword('ai search visibility'));
  });

  it('gives head terms more volume than long-tail ones', () => {
    const head = estimateKeyword('seo tool').volume;
    const tail = estimateKeyword('how do i measure ai search visibility for b2b saas').volume;
    expect(head).toBeGreaterThan(tail);
  });

  it('prices commercial intent above informational', () => {
    expect(estimateKeyword('buy seo software').cpc).toBeGreaterThan(estimateKeyword('what is seo').cpc);
  });

  it('keeps every metric inside a sane range', () => {
    for (const phrase of ['a b', 'seo', 'best enterprise ai search visibility platform for agencies']) {
      const e = estimateKeyword(phrase);
      expect(e.volume).toBeGreaterThan(0);
      expect(e.difficulty).toBeGreaterThanOrEqual(1);
      expect(e.difficulty).toBeLessThanOrEqual(100);
      expect(e.cpc).toBeGreaterThan(0);
      expect(e.trend).toHaveLength(12);
      expect(e.trend.every((v) => v >= 0)).toBe(true);
    }
  });

  it('labels its output as estimated, never as measured', () => {
    expect(estimateKeyword('anything at all').source).toBe('estimated');
  });

  it('makes long-tail phrases easier than head terms', () => {
    const head = estimateKeyword('crm').difficulty;
    const tail = estimateKeyword('crm for independent insurance brokers in texas').difficulty;
    expect(tail).toBeLessThan(head);
  });
});
