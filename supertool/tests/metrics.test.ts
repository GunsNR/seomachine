import { describe, expect, it } from 'vitest';
import {
  ctrForPosition, domainAuthority, estimatedTraffic, keywordDifficulty,
  opportunityScore, shareOfVoice, trafficValue,
} from '@/lib/seo/metrics';

describe('ctrForPosition', () => {
  it('decreases monotonically down the page', () => {
    for (let p = 1; p < 30; p++) {
      expect(ctrForPosition(p)).toBeGreaterThan(ctrForPosition(p + 1));
    }
  });
  it('returns 0 outside the ranking range', () => {
    expect(ctrForPosition(0)).toBe(0);
    expect(ctrForPosition(101)).toBe(0);
  });
  it('discounts clicks when an AI Overview occupies the SERP', () => {
    expect(ctrForPosition(1, { hasAiOverview: true })).toBeLessThan(ctrForPosition(1));
  });
  it('never exceeds 100%', () => {
    expect(ctrForPosition(1)).toBeLessThan(1);
  });
});

describe('keywordDifficulty', () => {
  const weak = Array.from({ length: 10 }, (_, i) => ({
    domain: `weak${i}.com`, domainAuthority: 12, referringDomains: 3, wordCount: 600,
  }));
  const strong = Array.from({ length: 10 }, (_, i) => ({
    domain: `strong${i}.com`, domainAuthority: 88, referringDomains: 4200, wordCount: 3500,
  }));

  it('scores an authoritative SERP as much harder', () => {
    expect(keywordDifficulty(strong)).toBeGreaterThan(keywordDifficulty(weak) + 30);
  });
  it('stays inside 0-100', () => {
    expect(keywordDifficulty(strong)).toBeLessThanOrEqual(100);
    expect(keywordDifficulty(weak)).toBeGreaterThanOrEqual(0);
  });
  it('returns 0 for an empty SERP', () => {
    expect(keywordDifficulty([])).toBe(0);
  });
  it('adds a penalty when an AI Overview is present', () => {
    expect(keywordDifficulty(weak, { hasAiOverview: true })).toBeGreaterThan(keywordDifficulty(weak));
  });
});

describe('domainAuthority', () => {
  it('ranks a big link profile above a small one', () => {
    const small = domainAuthority({ referringDomains: 20, backlinks: 90 });
    const big = domainAuthority({ referringDomains: 90_000, backlinks: 4_000_000, avgLinkingAuthority: 70 });
    expect(big).toBeGreaterThan(small);
    expect(big).toBeLessThanOrEqual(100);
  });
  it('handles a zero-link domain without NaN', () => {
    const da = domainAuthority({ referringDomains: 0, backlinks: 0 });
    expect(Number.isFinite(da)).toBe(true);
    expect(da).toBeGreaterThanOrEqual(0);
  });
});

describe('estimatedTraffic / trafficValue', () => {
  it('estimates clicks from volume and position', () => {
    expect(estimatedTraffic(10_000, 1)).toBe(2745);
    expect(estimatedTraffic(10_000, 10)).toBeLessThan(estimatedTraffic(10_000, 1));
  });
  it('prices traffic at the keyword CPC', () => {
    // 1000 * 27.45% = 274.5 clicks, rounded to 275 whole visitors, at $5 each.
    expect(trafficValue(1000, 1, 5)).toBe(1375);
  });
});

describe('opportunityScore', () => {
  it('flags a page-one-adjacent, low-difficulty keyword as a quick win', () => {
    const r = opportunityScore({
      volume: 4400, position: 7, difficulty: 22, intent: 'commercial', cpc: 9,
      clusterSize: 6, monthsSinceUpdate: 8, trend: [80, 90, 100, 120, 140, 160],
    });
    expect(r.band).toBe('quick-win');
    expect(r.score).toBeGreaterThan(55);
  });

  it('scores a brutal, unranked, low-volume keyword as low', () => {
    const r = opportunityScore({
      volume: 40, position: 0, difficulty: 94, intent: 'informational',
    });
    expect(r.band).toBe('low');
    expect(r.score).toBeLessThan(45);
  });

  it('keeps the score inside 0-100 for extreme inputs', () => {
    const hot = opportunityScore({
      volume: 5_000_000, position: 4, difficulty: 0, intent: 'transactional',
      cpc: 500, clusterSize: 500, monthsSinceUpdate: 240, trend: [1, 999],
    });
    expect(hot.score).toBeLessThanOrEqual(100);
    expect(hot.score).toBeGreaterThanOrEqual(0);
  });

  it('exposes every weighted factor', () => {
    const r = opportunityScore({ volume: 100, position: 5, difficulty: 30, intent: 'commercial' });
    expect(Object.keys(r.factors).sort()).toEqual([
      'cluster', 'competition', 'ctr', 'freshness', 'intent', 'position', 'trend', 'volume',
    ]);
    for (const v of Object.values(r.factors)) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    }
  });
});

describe('shareOfVoice', () => {
  it('is 1 when every keyword ranks first', () => {
    expect(shareOfVoice([{ volume: 100, position: 1 }, { volume: 900, position: 1 }])).toBe(1);
  });
  it('is 0 when nothing ranks', () => {
    expect(shareOfVoice([{ volume: 100, position: 0 }])).toBe(0);
  });
  it('weights by volume, not keyword count', () => {
    const sov = shareOfVoice([{ volume: 10_000, position: 1 }, { volume: 10, position: 90 }]);
    expect(sov).toBeGreaterThan(0.9);
  });
  it('handles an empty set', () => {
    expect(shareOfVoice([])).toBe(0);
  });
});
