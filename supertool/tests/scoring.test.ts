import { describe, expect, it } from 'vitest';
import { scoreContent } from '@/lib/seo/content-score';
import { extractAnswer, quotablePassages, scoreAiReadiness } from '@/lib/seo/ai-readiness';
import { auditPages } from '@/lib/seo/audit';
import { parseHtml } from '@/lib/seo/crawler';

const goodBody = `
AI search visibility is the share of AI-generated answers in which a brand is named or cited as a source.
According to Gartner, 25% of search volume will shift to AI assistants by 2026, which makes this the
fastest-growing acquisition channel in B2B marketing.

## What is AI search visibility?

AI search visibility measures how often ChatGPT, Perplexity and Gemini name your brand when a buyer asks
a purchase question. Unlike blue-link rankings, there is no position one; there is only inclusion or absence.

- Track a fixed prompt set on a schedule.
- Measure mention rate, citation rate and share of voice.
- Compare against the three competitors named most often.

## How do you improve it?

Research from Semrush shows that pages cited by AI assistants carry 3x more statistics per 1000 words than
pages that are not cited. Adding sourced figures is the single highest-leverage change available.
`.repeat(2);

const headings = ['What is AI search visibility?', 'How do you improve it?'];

describe('scoreAiReadiness', () => {
  it('scores a sourced, structured, question-shaped page highly', () => {
    const r = scoreAiReadiness({
      body: goodBody,
      title: 'AI Search Visibility',
      headings,
      brand: 'SuperTool',
      outboundLinks: [
        { href: 'https://www.gartner.com/x', text: 'Gartner' },
        { href: 'https://www.semrush.com/y', text: 'Semrush' },
        { href: 'https://schema.org/FAQPage', text: 'schema' },
      ],
      schemaTypes: ['FAQPage', 'Article'],
    });
    expect(r.score).toBeGreaterThan(60);
    expect(r.stats.statCount).toBeGreaterThan(0);
    expect(r.stats.questionHeadings).toBe(2);
    expect(r.quotablePassages.length).toBeGreaterThan(0);
  });

  it('scores unsourced, unstructured filler poorly', () => {
    const r = scoreAiReadiness({
      body: 'This is a thing. It does stuff. They like it. That is why we do it.',
      headings: [],
    });
    expect(r.score).toBeLessThan(35);
    expect(r.grade).toBe('F');
  });

  it('always returns a score inside 0-100 with every weight accounted for', () => {
    const r = scoreAiReadiness({ body: goodBody, headings });
    expect(r.score).toBeGreaterThanOrEqual(0);
    expect(r.score).toBeLessThanOrEqual(100);
    expect(r.signals.reduce((s, x) => s + x.weight, 0)).toBe(100);
    for (const s of r.signals) {
      expect(s.score).toBeGreaterThanOrEqual(0);
      expect(s.score).toBeLessThanOrEqual(1);
      expect(s.fix.length).toBeGreaterThan(10);
    }
  });

  it('handles empty content without throwing', () => {
    const r = scoreAiReadiness({ body: '' });
    expect(r.score).toBeGreaterThanOrEqual(0);
    expect(r.quotablePassages).toEqual([]);
  });
});

describe('quotablePassages / extractAnswer', () => {
  it('rejects sentences that open on a pronoun', () => {
    const passages = quotablePassages(
      'This means the platform grew 40% year over year across every measured region worldwide.',
    );
    expect(passages).toEqual([]);
  });
  it('pulls a definitional opening sentence as the answer', () => {
    expect(extractAnswer(goodBody)).toMatch(/AI search visibility is the share/);
  });
});

describe('scoreContent', () => {
  const base = {
    body: goodBody,
    title: 'AI Search Visibility: The Complete 2026 Guide',
    metaDescription:
      'AI search visibility measures how often ChatGPT and Perplexity cite your brand. Here is how to track and improve it across six engines.',
    h1: 'AI Search Visibility',
    headings,
    url: 'https://example.com/ai-search-visibility',
    keyword: 'AI search visibility',
    internalLinks: 4,
    externalLinks: 3,
    images: [{ alt: 'AI search visibility dashboard' }, { alt: 'engine comparison' }],
  };

  it('rewards a well-optimized page', () => {
    const r = scoreContent(base);
    expect(r.score).toBeGreaterThan(70);
    expect(['A', 'B']).toContain(r.grade);
    expect(r.checks.every((c) => c.points <= c.max)).toBe(true);
  });

  it('penalises a page missing every on-page signal', () => {
    const r = scoreContent({
      body: 'Short and unrelated filler text goes here.',
      title: '', metaDescription: '', h1: '', headings: [], url: '',
      keyword: 'AI search visibility', images: [],
    });
    expect(r.score).toBeLessThan(30);
    expect(r.grade).toBe('F');
  });

  it('benchmarks length against the ranking set', () => {
    const r = scoreContent({ ...base, competitorWordCounts: [1200, 1500, 1800, 2000, 2400] });
    expect(r.benchmark).not.toBeNull();
    expect(r.benchmark!.median).toBe(1800);
    expect(r.benchmark!.target).toBe(2070);
  });

  it('never exceeds 100 or drops below 0', () => {
    for (const wc of [[], [100], [50_000]]) {
      const r = scoreContent({ ...base, competitorWordCounts: wc });
      expect(r.score).toBeGreaterThanOrEqual(0);
      expect(r.score).toBeLessThanOrEqual(100);
    }
  });
});

describe('parseHtml + auditPages', () => {
  const html = (over: Partial<Record<string, string>> = {}) => `
<!doctype html><html lang="${over.lang ?? 'en'}"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${over.title ?? 'A Perfectly Reasonable Title For Testing'}</title>
<meta name="description" content="${over.desc ?? 'A meta description of exactly the right sort of length, containing a keyword and a compelling reason for a searcher to click through to the page.'}">
<link rel="canonical" href="https://example.com/page">
<meta property="og:title" content="T"><meta property="og:description" content="D"><meta property="og:image" content="I">
<script type="application/ld+json">{"@type":"Article","author":{"@type":"Person","name":"A"}}</script>
</head><body>
<h1>${over.h1 ?? 'The Only H1'}</h1>
<h2>What is this?</h2><h2>How does it work?</h2>
<p>${'Substantial body copy that comfortably clears the thin-content threshold. '.repeat(40)}</p>
<a href="/internal">internal</a><a href="https://nih.gov/study">source</a><a href="https://other.com/a">other</a>
<img src="a.png" alt="described" width="10" height="10">
</body></html>`;

  it('extracts the full page model', () => {
    const p = parseHtml(html(), 'https://example.com/page');
    expect(p.title).toBe('A Perfectly Reasonable Title For Testing');
    expect(p.h1).toEqual(['The Only H1']);
    expect(p.headings).toEqual(['What is this?', 'How does it work?']);
    expect(p.lang).toBe('en');
    expect(p.canonical).toBe('https://example.com/page');
    expect(p.schemaTypes).toContain('Article');
    expect(p.internalLinks).toHaveLength(1);
    expect(p.externalLinks).toHaveLength(2);
    expect(p.images[0].alt).toBe('described');
    expect(p.wordCount).toBeGreaterThan(300);
  });

  it('gives a clean page a high health score', () => {
    const report = auditPages([parseHtml(html(), 'https://example.com/page')]);
    expect(report.score).toBeGreaterThan(85);
    expect(report.totals.critical).toBe(0);
  });

  it('raises criticals for a broken page', () => {
    const broken = parseHtml('<html><body><p>tiny</p></body></html>', 'https://example.com/bad');
    const report = auditPages([broken]);
    const codes = report.findings.map((f) => f.code);
    expect(codes).toContain('title-missing');
    expect(codes).toContain('h1-missing');
    expect(codes).toContain('thin-content');
    expect(codes).toContain('viewport');
    expect(report.totals.critical).toBeGreaterThan(2);
    expect(report.score).toBeLessThan(60);
  });

  it('detects duplicate titles across pages', () => {
    const a = parseHtml(html(), 'https://example.com/a');
    const b = parseHtml(html(), 'https://example.com/b');
    const codes = auditPages([a, b]).findings.map((f) => f.code);
    expect(codes).toContain('duplicate-title');
  });

  it('keeps the score inside 0-100 for an empty crawl', () => {
    const r = auditPages([]);
    expect(r.score).toBe(100);
    expect(r.pagesCrawled).toBe(0);
  });
});
