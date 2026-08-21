import { describe, expect, it } from 'vitest';
import {
  analyzeKeyword, classifyIntent, countPhrase, distributionScore,
  extractTerms, missingTerms, ngrams,
} from '@/lib/seo/keywords';

const body = [
  'AI search visibility is the new organic channel for B2B brands.',
  'Winning AI search visibility means being cited by ChatGPT and Perplexity.',
  'Most teams track rankings but ignore AI search visibility entirely.',
  'Measuring AI search visibility requires a fixed prompt set run on a schedule.',
].join(' ');

describe('countPhrase', () => {
  it('counts multi-word phrases', () => {
    expect(countPhrase(body, 'AI search visibility')).toBe(4);
  });
  it('is case-insensitive', () => {
    expect(countPhrase('Search Engine Optimization rocks', 'search engine optimization')).toBe(1);
  });
  it('does not match across word boundaries', () => {
    expect(countPhrase('the cathode ray', 'cat')).toBe(0);
  });
  it('returns 0 for an empty needle', () => {
    expect(countPhrase(body, '')).toBe(0);
  });
});

describe('ngrams', () => {
  it('skips grams that begin or end on a stop word', () => {
    const grams = ngrams('the quick brown fox and the lazy dog', 2).map((g) => g.term);
    expect(grams).toContain('quick brown');
    expect(grams).not.toContain('the quick');
    expect(grams).not.toContain('fox and');
  });
  it('returns nothing when the text is shorter than n', () => {
    expect(ngrams('hi', 3)).toEqual([]);
  });
});

describe('extractTerms', () => {
  it('surfaces the dominant phrase first', () => {
    expect(extractTerms(body, 5)[0].term).toBe('ai search visibility');
  });
});

describe('distributionScore', () => {
  it('scores an evenly spread keyword near 1', () => {
    const even = Array.from({ length: 8 }, () => 'alpha beta gamma delta target').join(' ');
    expect(distributionScore(even, 'target')).toBeGreaterThan(0.85);
  });
  it('scores a front-loaded keyword lower than an even one', () => {
    const filler = Array.from({ length: 40 }, () => 'filler').join(' ');
    const clumped = `target target target target ${filler}`;
    const even = 'target ' + Array.from({ length: 4 }, () => `${filler} target`).join(' ');
    expect(distributionScore(clumped, 'target')).toBeLessThan(distributionScore(even, 'target'));
  });
  it('returns 0 when the keyword is absent', () => {
    expect(distributionScore(body, 'nowhere to be found')).toBe(0);
  });
});

describe('analyzeKeyword', () => {
  it('rewards correct placement across title, h1 and intro', () => {
    const r = analyzeKeyword(body, 'AI search visibility', {
      title: 'AI Search Visibility: The 2026 Playbook',
      metaDescription: 'How to measure AI search visibility across six engines.',
      h1: 'AI Search Visibility',
      subheadings: ['Why AI search visibility matters', 'Tracking setup'],
      url: 'https://example.com/ai-search-visibility',
      imageAlts: ['AI search visibility dashboard'],
    });
    expect(r.inTitle).toBe(true);
    expect(r.inH1).toBe(true);
    expect(r.inMetaDescription).toBe(true);
    expect(r.inFirstParagraph).toBe(true);
    expect(r.inUrl).toBe(true);
    expect(r.inImageAlt).toBe(true);
    expect(r.inSubheadings).toBe(1);
    expect(r.placementScore).toBeGreaterThan(70);
  });

  it('flags stuffing when density is extreme', () => {
    const stuffed = Array.from({ length: 30 }, () => 'seo tool').join(' ');
    expect(analyzeKeyword(stuffed, 'seo tool').verdict).toBe('stuffed');
  });

  it('flags under-optimization when the keyword barely appears', () => {
    const long = Array.from({ length: 400 }, (_, i) => `word${i % 50}`).join(' ');
    expect(analyzeKeyword(`${long} rare phrase`, 'rare phrase').verdict).toBe('under-optimized');
  });

  it('scores placement at zero when nothing matches', () => {
    const r = analyzeKeyword(body, 'unrelated topic', { title: 'Something else' });
    expect(r.count).toBe(0);
    expect(r.placementScore).toBe(0);
  });
});

describe('missingTerms', () => {
  it('reports terms most competitors use that the draft lacks', () => {
    const draft = 'We discuss rank tracking and keyword research at length here.';
    const competitors = [
      'Backlink analysis matters. Backlink analysis drives authority. Backlink analysis is core.',
      'Backlink analysis is essential. Backlink analysis wins. Backlink analysis compounds.',
      'Backlink analysis first. Backlink analysis always. Backlink analysis again.',
    ];
    const gaps = missingTerms(draft, competitors).map((g) => g.term);
    expect(gaps).toContain('backlink analysis');
  });

  it('returns an empty list when there are no competitors', () => {
    expect(missingTerms('anything at all', [])).toEqual([]);
  });
});

describe('classifyIntent', () => {
  it.each([
    ['buy seo software', 'transactional'],
    ['best seo tools', 'commercial'],
    ['semrush login', 'navigational'],
    ['how does seo work', 'informational'],
  ])('classifies %s as %s', (q, expected) => {
    expect(classifyIntent(q)).toBe(expected);
  });
});
