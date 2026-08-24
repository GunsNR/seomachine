import { describe, expect, it } from 'vitest';
import {
  MIN_OBSERVATIONS_FOR_RATE,
  MIN_RUNS_FOR_VARIATION,
  binaryRate,
  costTotals,
  coverageOf,
  formatInterval,
  formatRate,
  isObservedStatus,
  runToRunVariation,
  summarizeRun,
  wilsonInterval,
} from '@/lib/measurement/stats';

/**
 * The arithmetic contract from docs/measurement-spec.md sections 2, 4 and 5.
 *
 * The single most important property under test: a failed or unavailable
 * observation belongs to the denominator of COVERAGE ONLY. If it ever reaches
 * the denominator of a rate, a provider outage becomes a finding about the
 * brand, which is the exact class of lie this gate exists to prevent.
 */

const obs = (status: string, over: Record<string, unknown> = {}) => ({
  status,
  brandMentioned: false,
  brandCited: false,
  mentionRank: 0,
  shareOfVoice: 0,
  ...over,
});

describe('observation status', () => {
  it('treats only live and simulated as carrying an answer', () => {
    expect(isObservedStatus('live')).toBe(true);
    expect(isObservedStatus('simulated')).toBe(true);
    expect(isObservedStatus('failed')).toBe(false);
    expect(isObservedStatus('unavailable')).toBe(false);
  });

  it('treats an unknown status as not observed rather than trusting it', () => {
    expect(isObservedStatus('something-new')).toBe(false);
  });
});

describe('coverage', () => {
  it('divides observed by attempted, counting every status as attempted', () => {
    const c = coverageOf([
      obs('live'), obs('live'), obs('failed'), obs('unavailable'),
    ]);
    expect(c.attempted).toBe(4);
    expect(c.observed).toBe(2);
    expect(c.failed).toBe(1);
    expect(c.unavailable).toBe(1);
    expect(c.coverage).toBeCloseTo(0.5, 6);
    expect(c.complete).toBe(false);
  });

  it('is complete only when every attempt produced an answer', () => {
    expect(coverageOf([obs('live'), obs('simulated')]).complete).toBe(true);
    expect(coverageOf([obs('live'), obs('failed')]).complete).toBe(false);
  });

  it('reports zero rather than dividing by zero on an empty set', () => {
    const c = coverageOf([]);
    expect(c.coverage).toBe(0);
    expect(c.complete).toBe(false);
  });
});

describe('failed and unavailable observations are excluded from rates', () => {
  it('never puts a failed call in a rate denominator', () => {
    // 5 observed, 1 mention. 20 failures alongside must not dilute it.
    const rows = [
      ...Array.from({ length: 5 }, (_, i) => obs('live', { brandMentioned: i === 0 })),
      ...Array.from({ length: 20 }, () => obs('failed')),
    ];
    const s = summarizeRun(rows);

    expect(s.inclusion.n).toBe(5);
    expect(s.inclusion.successes).toBe(1);
    expect(s.inclusion.rate).toBeCloseTo(0.2, 6);
    // Dividing by attempts would have produced 1/25 = 4%, describing an outage
    // as a finding.
    expect(s.inclusion.rate).not.toBeCloseTo(1 / 25, 6);
    expect(s.coverage.coverage).toBeCloseTo(5 / 25, 6);
  });

  it('never puts an unavailable surface in a rate denominator', () => {
    const rows = [
      ...Array.from({ length: 6 }, () => obs('live', { brandMentioned: true })),
      ...Array.from({ length: 6 }, () => obs('unavailable')),
    ];
    const s = summarizeRun(rows);
    expect(s.inclusion.n).toBe(6);
    expect(s.inclusion.rate).toBe(1);
    expect(s.coverage.coverage).toBeCloseTo(0.5, 6);
  });

  it('reports no rate at all when nothing was observed', () => {
    const s = summarizeRun([obs('failed'), obs('unavailable'), obs('unavailable')]);
    expect(s.inclusion.n).toBe(0);
    // null, never 0 — "we measured nothing" is not "we measured zero".
    expect(s.inclusion.rate).toBeNull();
    expect(s.citation.rate).toBeNull();
    expect(s.shareOfVoice).toBeNull();
    expect(s.meanMentionRank).toBeNull();
    expect(s.inclusion.insufficientEvidence).toBe(true);
  });
});

describe('minimum evidence', () => {
  it('refuses to state a rate below the documented threshold', () => {
    for (let n = 1; n < MIN_OBSERVATIONS_FOR_RATE; n++) {
      const r = binaryRate(n, n);
      expect(r.rate, `n=${n}`).toBeNull();
      expect(r.interval, `n=${n}`).toBeNull();
      expect(r.insufficientEvidence, `n=${n}`).toBe(true);
    }
  });

  it('states a rate at exactly the threshold', () => {
    const r = binaryRate(3, MIN_OBSERVATIONS_FOR_RATE);
    expect(r.insufficientEvidence).toBe(false);
    expect(r.rate).toBeCloseTo(3 / MIN_OBSERVATIONS_FOR_RATE, 6);
    expect(r.interval).not.toBeNull();
  });

  it('still reports the underlying counts when the rate is withheld', () => {
    const r = binaryRate(1, 2);
    expect(r.n).toBe(2);
    expect(r.successes).toBe(1);
  });

  it('clamps a numerator that exceeds the denominator instead of exceeding 1', () => {
    const r = binaryRate(99, 10);
    expect(r.successes).toBe(10);
    expect(r.rate).toBe(1);
  });
});

describe('Wilson interval', () => {
  it('does not claim certainty from zero successes', () => {
    // The normal approximation returns [0, 0] here, asserting certainty from
    // evidence that contains none. That degeneracy is why Wilson is used.
    const ci = wilsonInterval(0, 10);
    expect(ci.low).toBe(0);
    expect(ci.high).toBeGreaterThan(0);
    expect(ci.high).toBeLessThan(0.35);
  });

  it('does not claim certainty from all successes', () => {
    const ci = wilsonInterval(10, 10);
    expect(ci.high).toBe(1);
    expect(ci.low).toBeLessThan(1);
    expect(ci.low).toBeGreaterThan(0.65);
  });

  it('stays inside [0, 1] across the whole range', () => {
    for (let n = 1; n <= 40; n++) {
      for (let k = 0; k <= n; k++) {
        const ci = wilsonInterval(k, n);
        expect(ci.low, `k=${k} n=${n}`).toBeGreaterThanOrEqual(0);
        expect(ci.high, `k=${k} n=${n}`).toBeLessThanOrEqual(1);
        expect(ci.low, `k=${k} n=${n}`).toBeLessThanOrEqual(ci.high);
      }
    }
  });

  it('brackets the observed proportion for interior values', () => {
    const ci = wilsonInterval(5, 20);
    expect(ci.low).toBeLessThan(0.25);
    expect(ci.high).toBeGreaterThan(0.25);
  });

  it('narrows as evidence grows at a fixed proportion', () => {
    const small = wilsonInterval(5, 10);
    const large = wilsonInterval(50, 100);
    const huge = wilsonInterval(500, 1000);
    expect(large.high - large.low).toBeLessThan(small.high - small.low);
    expect(huge.high - huge.low).toBeLessThan(large.high - large.low);
  });

  it('matches a known reference value', () => {
    // k=2, n=10, z=1.96 → approximately [0.0567, 0.5098].
    const ci = wilsonInterval(2, 10);
    expect(ci.low).toBeCloseTo(0.0567, 3);
    expect(ci.high).toBeCloseTo(0.5098, 3);
  });

  it('expresses total ignorance for an empty sample', () => {
    const ci = wilsonInterval(0, 0);
    expect(ci.low).toBe(0);
    expect(ci.high).toBe(1);
  });
});

describe('run-to-run variation', () => {
  it('says nothing with fewer than the minimum comparable runs', () => {
    expect(runToRunVariation([]).insufficientRuns).toBe(true);
    expect(runToRunVariation([0.5]).insufficientRuns).toBe(true);
    expect(runToRunVariation([0.5, null]).insufficientRuns).toBe(true);
  });

  it('reports spread once there are enough runs', () => {
    const v = runToRunVariation([0.2, 0.4, 0.6]);
    expect(v.insufficientRuns).toBe(false);
    expect(v.runs).toBe(3);
    expect(v.mean).toBeCloseTo(0.4, 6);
    expect(v.min).toBeCloseTo(0.2, 6);
    expect(v.max).toBeCloseTo(0.6, 6);
    // Sample standard deviation of [0.2, 0.4, 0.6] is 0.2.
    expect(v.standardDeviation).toBeCloseTo(0.2, 6);
  });

  it('ignores runs that had no rate rather than treating them as zero', () => {
    const v = runToRunVariation([0.5, null, 0.5, null]);
    expect(v.runs).toBe(2);
    expect(v.mean).toBeCloseTo(0.5, 6);
    expect(v.standardDeviation).toBeCloseTo(0, 6);
  });

  it('needs at least MIN_RUNS_FOR_VARIATION to say anything', () => {
    expect(MIN_RUNS_FOR_VARIATION).toBeGreaterThanOrEqual(2);
  });
});

describe('cost and token aggregation', () => {
  it('sums usage across every attempted observation, including failures', () => {
    // A failed call can still have cost money. Hiding that understates spend.
    const t = costTotals([
      obs('live', { inputTokens: 1000, outputTokens: 500, estimatedCostUsd: 0.0075, latencyMs: 900 }),
      obs('failed', { inputTokens: 200, outputTokens: 0, estimatedCostUsd: 0.0005, latencyMs: 300 }),
      obs('unavailable'),
    ]);
    expect(t.inputTokens).toBe(1200);
    expect(t.outputTokens).toBe(500);
    expect(t.estimatedCostUsd).toBeCloseTo(0.01, 6);
    expect(t.meanLatencyMs).toBe(600);
  });

  it('distinguishes "no usage reported" from "no tokens used"', () => {
    const t = costTotals([obs('live'), obs('live'), obs('live')]);
    expect(t.inputTokens).toBe(0);
    // Zero tokens with zero reporters means the provider told us nothing.
    expect(t.usageReported).toBe(0);
  });

  it('counts only observations that actually carried usage', () => {
    const t = costTotals([
      obs('live', { inputTokens: 10 }),
      obs('live', { outputTokens: 5 }),
      obs('live'),
    ]);
    expect(t.usageReported).toBe(2);
  });

  it('has no latency to report when nothing recorded one', () => {
    expect(costTotals([obs('unavailable')]).meanLatencyMs).toBeNull();
  });
});

describe('summarizeRun denominators', () => {
  it('averages share of voice over observations but rank over inclusions', () => {
    const rows = [
      obs('live', { brandMentioned: true, mentionRank: 1, shareOfVoice: 0.5 }),
      obs('live', { brandMentioned: true, mentionRank: 3, shareOfVoice: 0.25 }),
      obs('live', { brandMentioned: false, mentionRank: 0, shareOfVoice: 0 }),
      obs('live', { brandMentioned: false, mentionRank: 0, shareOfVoice: 0 }),
      obs('live', { brandMentioned: false, mentionRank: 0, shareOfVoice: 0 }),
    ];
    const s = summarizeRun(rows);

    // Share of voice: mean over all 5 observed rows.
    expect(s.shareOfVoice).toBeCloseTo(0.75 / 5, 6);
    // Rank: mean over the 2 inclusions only — rank is undefined when absent, so
    // averaging zeros over non-inclusions would invent a flattering figure.
    expect(s.meanMentionRank).toBeCloseTo(2, 6);
    expect(s.inclusion.rate).toBeCloseTo(0.4, 6);
  });

  it('counts a citation without an inclusion, which is possible', () => {
    const rows = Array.from({ length: 5 }, (_, i) =>
      obs('live', { brandMentioned: false, brandCited: i === 0 }),
    );
    const s = summarizeRun(rows);
    expect(s.inclusion.rate).toBe(0);
    expect(s.citation.rate).toBeCloseTo(0.2, 6);
  });
});

describe('presentation precision', () => {
  it('shows whole percentage points and never more', () => {
    expect(formatRate(0.33333)).toBe('33%');
    expect(formatRate(0.666666)).toBe('67%');
    expect(formatRate(null)).toBe('—');
  });

  it('renders an interval as a range, or an em dash when there is none', () => {
    expect(formatInterval(wilsonInterval(5, 10))).toMatch(/^\d+%–\d+%$/);
    expect(formatInterval(null)).toBe('—');
  });
});
