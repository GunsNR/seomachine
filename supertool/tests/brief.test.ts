import { describe, expect, it } from 'vitest';
import { briefUpside, generateBrief } from '@/lib/seo/brief';

const base = {
  targetKeyword: 'ai search visibility',
  volume: 2400,
  difficulty: 38,
  unansweredPrompts: [
    'What is the best AI SEO platform?',
    'How do I track brand mentions in ChatGPT?',
  ],
  competingUrls: ['https://semrush.com/blog/x', 'https://ahrefs.com/blog/y', 'https://semrush.com/blog/x'],
  relatedKeywords: [
    { phrase: 'ai citation tracking', volume: 800 },
    { phrase: 'ai search visibility', volume: 2400 },
    { phrase: 'geo vs seo', volume: 1500 },
  ],
  brand: 'SuperTool',
};

describe('generateBrief', () => {
  it('leads the outline with a definition heading', () => {
    const brief = generateBrief(base);
    expect(brief.outline[0].heading).toBe('What is ai search visibility?');
  });

  it('puts measured unanswered prompts before generic questions', () => {
    const brief = generateBrief(base);
    expect(brief.questions[0]).toBe('What is the best AI SEO platform?');
    expect(brief.questions).toContain('How do I track brand mentions in ChatGPT?');
  });

  it('phrases every outline heading as a question or an actionable section', () => {
    for (const item of generateBrief(base).outline) {
      expect(item.heading.length).toBeGreaterThan(4);
      expect(item.guidance.length).toBeGreaterThan(20);
    }
  });

  it('deduplicates competing URLs and excludes the target keyword from secondaries', () => {
    const brief = generateBrief(base);
    expect(brief.competingUrls).toHaveLength(2);
    expect(brief.secondaryKeywords).not.toContain('ai search visibility');
    expect(brief.secondaryKeywords[0]).toBe('geo vs seo');
  });

  it('benchmarks length against the ranking set when counts are supplied', () => {
    const brief = generateBrief({ ...base, competitorWordCounts: [1000, 2000, 3000] });
    expect(brief.benchmark.basis).toBe('serp');
    expect(brief.benchmark.median).toBe(2000);
    expect(brief.targetWords).toBe(2300);
  });

  it('falls back to an intent default with no ranking data', () => {
    const brief = generateBrief({ ...base, competitorWordCounts: [] });
    expect(brief.benchmark.basis).toBe('intent-default');
    expect(brief.targetWords).toBeGreaterThan(500);
  });

  it('warns that a hard keyword needs links', () => {
    const brief = generateBrief({ ...base, difficulty: 82 });
    expect(brief.requirements.join(' ')).toMatch(/need links/i);
  });

  it('always states the checkable GEO requirements', () => {
    const joined = generateBrief(base).requirements.join(' ');
    expect(joined).toMatch(/quantified claims/i);
    expect(joined).toMatch(/named primary sources/i);
    expect(joined).toMatch(/Flesch/i);
  });

  it('handles a keyword with no prompt or competitor data', () => {
    const brief = generateBrief({
      ...base, unansweredPrompts: [], competingUrls: [], relatedKeywords: [],
    });
    expect(brief.questions.length).toBeGreaterThan(0);
    expect(brief.outline.length).toBeGreaterThan(2);
    expect(brief.competingUrls).toEqual([]);
  });

  it('classifies commercial intent and adds a comparison section', () => {
    const brief = generateBrief({ ...base, targetKeyword: 'best seo software' });
    expect(['commercial', 'transactional']).toContain(brief.intent);
    expect(brief.outline.map((o) => o.heading).join(' ')).toMatch(/How to choose/i);
  });

  it('names the brand in the closing section', () => {
    expect(generateBrief(base).outline.at(-1)!.heading).toContain('SuperTool');
  });
});

describe('brief topic casing', () => {
  it('keeps acronyms upper-case', () => {
    expect(generateBrief({ ...base, targetKeyword: 'ai search visibility' }).topic)
      .toBe('AI Search Visibility');
    expect(generateBrief({ ...base, targetKeyword: 'geo vs seo' }).topic)
      .toBe('GEO vs SEO');
  });

  it('keeps minor words lower-case except at the edges', () => {
    expect(generateBrief({ ...base, targetKeyword: 'the future of content marketing' }).topic)
      .toBe('The Future of Content Marketing');
  });

  it('capitalises ordinary words', () => {
    expect(generateBrief({ ...base, targetKeyword: 'keyword research tool' }).topic)
      .toBe('Keyword Research Tool');
  });
});

describe('briefUpside', () => {
  it('scales with volume and is zero for none', () => {
    expect(briefUpside(0)).toBe(0);
    expect(briefUpside(10_000)).toBeGreaterThan(briefUpside(1000));
  });
});
