import { describe, expect, it } from 'vitest';
import { readability, sentences, syllables, toPlainText, words } from '@/lib/seo/text';

describe('toPlainText', () => {
  it('strips html, scripts and markdown chrome', () => {
    const out = toPlainText('<p>Hello <b>world</b></p><script>evil()</script>\n## Heading\n[link](http://x.com)');
    expect(out).toContain('Hello world');
    expect(out).toContain('Heading');
    expect(out).toContain('link');
    expect(out).not.toContain('evil');
    expect(out).not.toContain('<');
  });
});

describe('words', () => {
  it('keeps hyphenated and apostrophed words as single tokens', () => {
    expect(words("It's a well-known fact.")).toEqual(["it's", 'a', 'well-known', 'fact']);
  });
});

describe('sentences', () => {
  it('splits on terminators', () => {
    expect(sentences('One. Two! Three?')).toHaveLength(3);
  });

  it('does not split on abbreviations or decimals', () => {
    expect(sentences('Revenue grew 12.5% last year. Dr. Smith agreed.')).toHaveLength(2);
  });

  it('returns nothing for empty input', () => {
    expect(sentences('   ')).toEqual([]);
  });
});

describe('syllables', () => {
  it.each([
    ['cat', 1], ['table', 2], ['running', 2], ['beautiful', 3],
    ['the', 1], ['optimization', 5], ['a', 1],
    ['little', 2], ['codes', 1], ['watches', 2], ['wanted', 2], ['walked', 1],
    ['make', 1], ['queue', 1],
  ])('counts %s as %i', (word, expected) => {
    expect(syllables(word)).toBe(expected);
  });

  it('never returns zero for a real word', () => {
    for (const w of ['rhythm', 'strengths', 'queue', 'idea']) {
      expect(syllables(w)).toBeGreaterThan(0);
    }
  });
});

describe('readability', () => {
  it('rates simple prose as easier than dense prose', () => {
    const simple = 'The cat sat on the mat. The dog ran fast. We had fun. It was a good day.';
    const dense =
      'Notwithstanding the aforementioned considerations, the implementation of comprehensive ' +
      'organizational restructuring necessitates extraordinarily meticulous deliberation regarding ' +
      'multifaceted interdependencies among constituent administrative subdivisions.';
    expect(readability(simple).fleschReadingEase).toBeGreaterThan(readability(dense).fleschReadingEase);
    expect(readability(simple).consensusGrade).toBeLessThan(readability(dense).consensusGrade);
  });

  it('keeps every score inside its valid range', () => {
    const r = readability('Search engine optimization improves organic visibility. It takes consistent work.');
    expect(r.fleschReadingEase).toBeGreaterThanOrEqual(0);
    expect(r.fleschReadingEase).toBeLessThanOrEqual(100);
    expect(r.fleschKincaidGrade).toBeGreaterThanOrEqual(0);
    expect(r.words).toBe(10);
    expect(r.sentences).toBe(2);
  });

  it('handles empty input without dividing by zero', () => {
    const r = readability('');
    expect(r.words).toBe(0);
    expect(Number.isFinite(r.fleschReadingEase)).toBe(true);
    expect(r.label).toBe('No content');
  });
});
