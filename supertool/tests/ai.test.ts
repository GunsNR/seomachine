import { describe, expect, it } from 'vitest';
import { analyzeAnswer, rollUpVisibility } from '@/lib/ai/analysis';
import { ask, askAll, seededRandom } from '@/lib/ai/providers';
import { generatePromptSet } from '@/lib/ai/prompts';
import { ENGINE_IDS, ENGINES, MEASURABLE_ENGINES, MEASURABLE_ENGINE_IDS } from '@/lib/ai/engines';

const competitors = [{ name: 'Semrush', domain: 'semrush.com' }, { name: 'Ahrefs', domain: 'ahrefs.com' }];

describe('analyzeAnswer', () => {
  it('detects a mention, a citation, rank and share of voice', () => {
    const r = analyzeAnswer({
      answer:
        'SuperTool is a strong option for AI visibility tracking. Semrush also covers this. ' +
        'Sources:\nhttps://ranklogicsupertool.com/guide\nhttps://semrush.com/blog',
      brand: 'SuperTool',
      domain: 'ranklogicsupertool.com',
      competitors,
    });
    expect(r.brandMentioned).toBe(true);
    expect(r.brandCited).toBe(true);
    expect(r.mentionRank).toBe(1);
    expect(r.competitorsMentioned).toContain('semrush.com');
    expect(r.shareOfVoice).toBeCloseTo(0.5, 2);
    expect(r.sentiment).toBe('positive');
  });

  it('does not count a domain inside a source URL as a prose mention', () => {
    const r = analyzeAnswer({
      answer: 'SuperTool and Semrush both do this. Sources:\nhttps://semrush.com/a\nhttps://semrush.com/b',
      brand: 'SuperTool', domain: 'ranklogicsupertool.com', competitors,
    });
    // One prose mention each, so share of voice is an even split.
    expect(r.shareOfVoice).toBeCloseTo(0.5, 3);
  });

  it('ranks the brand second when a competitor is named first', () => {
    const r = analyzeAnswer({
      answer: 'Ahrefs leads here. SuperTool is also worth a look.',
      brand: 'SuperTool', domain: 'ranklogicsupertool.com', competitors,
    });
    expect(r.mentionRank).toBe(2);
  });

  it('separates mention from citation', () => {
    const r = analyzeAnswer({
      answer: 'SuperTool is popular. Sources:\nhttps://g2.com/x',
      brand: 'SuperTool', domain: 'ranklogicsupertool.com', competitors: [],
    });
    expect(r.brandMentioned).toBe(true);
    expect(r.brandCited).toBe(false);
  });

  it('reports absence cleanly', () => {
    const r = analyzeAnswer({
      answer: 'Semrush and Ahrefs are the usual choices.',
      brand: 'SuperTool', domain: 'ranklogicsupertool.com', competitors,
    });
    expect(r.brandMentioned).toBe(false);
    expect(r.mentionRank).toBe(0);
    expect(r.shareOfVoice).toBe(0);
    expect(r.sentiment).toBe('neutral');
  });

  it('does not match a brand name inside a longer word', () => {
    const r = analyzeAnswer({
      answer: 'The supertooling ecosystem is broad.',
      brand: 'SuperTool', domain: 'x.com', competitors: [],
    });
    expect(r.brandMentioned).toBe(false);
  });

  it('detects negative characterisation', () => {
    const r = analyzeAnswer({
      answer: 'SuperTool is expensive and limited compared with the alternatives.',
      brand: 'SuperTool', domain: 'x.com', competitors: [],
    });
    expect(r.sentiment).toBe('negative');
  });

  it('accepts citations supplied out-of-band by the provider', () => {
    const r = analyzeAnswer({
      answer: 'SuperTool is good.',
      brand: 'SuperTool', domain: 'ranklogicsupertool.com', competitors: [],
      providedCitations: ['https://www.ranklogicsupertool.com/x'],
    });
    expect(r.brandCited).toBe(true);
  });
});

describe('rollUpVisibility', () => {
  const check = (o: Partial<Parameters<typeof rollUpVisibility>[0][number]>) => ({
    brandMentioned: true, brandCited: true, shareOfVoice: 1, mentionRank: 1,
    sentiment: 'neutral' as const, ...o,
  });

  it('scores perfect visibility at 100', () => {
    expect(rollUpVisibility([check({}), check({})]).score).toBe(100);
  });
  it('scores total absence at 0', () => {
    const r = rollUpVisibility([check({ brandMentioned: false, brandCited: false, shareOfVoice: 0, mentionRank: 0 })]);
    expect(r.score).toBe(0);
  });
  it('handles an empty run', () => {
    expect(rollUpVisibility([]).score).toBe(0);
  });
  it('keeps every rate inside 0-1', () => {
    const r = rollUpVisibility([check({ mentionRank: 9, shareOfVoice: 0.3 }), check({ brandCited: false })]);
    for (const v of [r.mentionRate, r.citationRate, r.shareOfVoice]) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    }
    expect(r.score).toBeLessThanOrEqual(100);
  });
});

describe('seededRandom', () => {
  it('is deterministic for the same seed', () => {
    const a = seededRandom('x'), b = seededRandom('x');
    expect([a(), a(), a()]).toEqual([b(), b(), b()]);
  });
  it('differs across seeds', () => {
    expect(seededRandom('x')()).not.toBe(seededRandom('y')());
  });
  it('stays within [0,1)', () => {
    const r = seededRandom('range');
    for (let i = 0; i < 500; i++) {
      const v = r();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
});

/**
 * These expectations changed deliberately in the Gate 0 truth pass.
 *
 * Previously `ask()` returned simulated text whenever a credential was
 * missing or a live call failed, and the caller could only tell via a boolean.
 * That made a provider outage indistinguishable from a real answer. The
 * contract is now four explicit statuses, and simulation happens only when the
 * caller asks for demo mode.
 */
describe('ask (demo mode)', () => {
  it('returns a deterministic, analysable answer', async () => {
    const input = {
      prompt: 'What is the best AI SEO platform?', engine: 'chatgpt' as const,
      brand: 'SuperTool', domain: 'ranklogicsupertool.com', competitors, seed: 'p1',
      mode: 'demo' as const,
    };
    const a = await ask(input);
    const b = await ask(input);
    expect(a.status).toBe('simulated');
    expect(a.answer).toBe(b.answer);
    expect(a.answer.length).toBeGreaterThan(50);
    expect(a.model).toContain('simulated');
  });

  it('varies by engine', async () => {
    const base = {
      prompt: 'What is the best AI SEO platform?', brand: 'SuperTool',
      domain: 'ranklogicsupertool.com', competitors, seed: 'p1', mode: 'demo' as const,
    };
    const answers = await Promise.all(
      MEASURABLE_ENGINE_IDS.map((engine) => ask({ ...base, engine })),
    );
    expect(new Set(answers.map((a) => a.answer)).size).toBeGreaterThan(1);
  });

  it('askAll covers every registered engine', async () => {
    const all = await askAll({
      prompt: 'Best AI SEO platform?', brand: 'SuperTool',
      domain: 'ranklogicsupertool.com', competitors, seed: 's', mode: 'demo',
    });
    expect(Object.keys(all).sort()).toEqual([...ENGINE_IDS].sort());
  });

  it('reports an unknown engine as unavailable rather than simulating it', async () => {
    const r = await ask({
      prompt: 'x', engine: 'nope' as never, brand: 'B', domain: 'b.com', competitors: [],
      seed: 's', mode: 'demo',
    });
    expect(r.status).toBe('unavailable');
    expect(r.errorCategory).toBe('unsupported_engine');
    expect(r.answer).toBe('');
  });
});

describe('generatePromptSet', () => {
  const set = generatePromptSet({
    brand: 'SuperTool',
    category: 'AI SEO platform',
    topics: ['AI search visibility', 'content decay'],
    competitors: ['Semrush', 'Ahrefs'],
    limit: 30,
  });

  it('is deterministic', () => {
    const again = generatePromptSet({
      brand: 'SuperTool', category: 'AI SEO platform',
      topics: ['AI search visibility', 'content decay'],
      competitors: ['Semrush', 'Ahrefs'], limit: 30,
    });
    expect(set).toEqual(again);
  });

  it('respects the limit and deduplicates', () => {
    expect(set.length).toBeLessThanOrEqual(30);
    expect(new Set(set.map((p) => p.text.toLowerCase())).size).toBe(set.length);
  });

  it('covers multiple funnel clusters even when truncated', () => {
    const small = generatePromptSet({
      brand: 'SuperTool', category: 'AI SEO platform',
      competitors: ['Semrush'], topics: ['rank tracking'], limit: 6,
    });
    expect(new Set(small.map((p) => p.cluster)).size).toBeGreaterThanOrEqual(3);
  });

  it('leaves no unfilled placeholders', () => {
    for (const p of set) expect(p.text).not.toMatch(/\{|\}/);
  });

  it('produces only brand and discovery prompts with no competitors or topics', () => {
    const s = generatePromptSet({ brand: 'SuperTool', category: 'AI SEO platform' });
    expect(s.length).toBeGreaterThan(0);
    expect(new Set(s.map((p) => p.cluster))).toEqual(new Set(['discovery', 'brand', 'pricing']));
  });
});

describe('engine registry', () => {
  it('knows six surfaces but only measures the five with a compliant source', () => {
    expect(ENGINES).toHaveLength(6);
    expect(MEASURABLE_ENGINE_IDS).toHaveLength(5);
    expect(MEASURABLE_ENGINE_IDS).not.toContain('google-ai-mode');
  });

  it('uses unique ids and unique credential keys among measurable surfaces', () => {
    expect(new Set(ENGINES.map((e) => e.id)).size).toBe(6);
    const keys = MEASURABLE_ENGINES.map((e) => e.envKey);
    expect(keys.every(Boolean)).toBe(true);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('gives every unavailable surface a stated reason', () => {
    for (const e of ENGINES) {
      if (e.availability === 'unavailable') {
        expect(e.unavailableReason && e.unavailableReason.length).toBeGreaterThan(20);
      }
    }
  });
});
