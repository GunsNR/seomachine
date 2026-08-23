/**
 * Composite on-page content score, 0-100.
 *
 * Combines the classic on-page checks (title/meta/heading hygiene, keyword
 * placement, link structure, media) with readability and length benchmarking
 * against whatever is currently ranking.
 */
import { analyzeKeyword, type KeywordUsage } from './keywords';
import { readability, words, round } from './text';

export interface ContentScoreInput {
  body: string;
  title: string;
  metaDescription?: string;
  h1?: string;
  headings?: string[];
  url?: string;
  keyword: string;
  internalLinks?: number;
  externalLinks?: number;
  images?: Array<{ alt?: string }>;
  /** Word counts of the pages currently ranking top-10 for the keyword. */
  competitorWordCounts?: number[];
}

export interface ScoreCheck {
  id: string;
  label: string;
  status: 'pass' | 'warn' | 'fail';
  points: number;
  max: number;
  message: string;
}

export interface ContentScoreReport {
  score: number;
  grade: 'A' | 'B' | 'C' | 'D' | 'F';
  checks: ScoreCheck[];
  keyword: KeywordUsage;
  readability: ReturnType<typeof readability>;
  wordCount: number;
  benchmark: { median: number; target: number; delta: number } | null;
}

const check = (
  id: string,
  label: string,
  max: number,
  ratio: number,
  message: string,
): ScoreCheck => ({
  id,
  label,
  max,
  points: round(max * Math.min(1, Math.max(0, ratio)), 2),
  status: ratio >= 0.999 ? 'pass' : ratio >= 0.5 ? 'warn' : 'fail',
  message,
});

export function scoreContent(input: ContentScoreInput): ContentScoreReport {
  const {
    body, title, metaDescription = '', h1 = '', headings = [], url = '',
    keyword, internalLinks = 0, externalLinks = 0, images = [],
    competitorWordCounts = [],
  } = input;

  const wordCount = words(body).length;
  const read = readability(body);
  const usage = analyzeKeyword(body, keyword, {
    title, metaDescription, h1, subheadings: headings, url,
    imageAlts: images.map((i) => i.alt ?? ''),
  });

  const titleLen = title.length;
  const metaLen = metaDescription.length;
  const withAlt = images.filter((i) => (i.alt ?? '').trim().length > 0).length;

  const benchmark = competitorWordCounts.length
    ? (() => {
        const sorted = [...competitorWordCounts].sort((a, b) => a - b);
        const mid = Math.floor(sorted.length / 2);
        const median =
          sorted.length % 2 ? sorted[mid] : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
        // Beating the median by ~15% is the usual practical target.
        const target = Math.round(median * 1.15);
        return { median, target, delta: wordCount - target };
      })()
    : null;

  const checks: ScoreCheck[] = [
    check('title-length', 'Title tag length', 8,
      titleLen >= 30 && titleLen <= 60 ? 1 : titleLen >= 20 && titleLen <= 70 ? 0.6 : 0.15,
      `${titleLen} characters (target 30-60).`),

    check('title-keyword', 'Keyword in title', 10, usage.inTitle ? 1 : 0,
      usage.inTitle ? 'Primary keyword present in the title tag.' : 'Primary keyword missing from the title tag.'),

    check('meta-length', 'Meta description length', 6,
      metaLen >= 120 && metaLen <= 158 ? 1 : metaLen >= 80 && metaLen <= 180 ? 0.6 : metaLen ? 0.25 : 0,
      metaLen ? `${metaLen} characters (target 120-158).` : 'No meta description set.'),

    check('meta-keyword', 'Keyword in meta description', 4, usage.inMetaDescription ? 1 : 0,
      usage.inMetaDescription ? 'Keyword present in the meta description.' : 'Add the keyword to the meta description.'),

    check('h1', 'Single keyword-bearing H1', 8,
      h1 ? (usage.inH1 ? 1 : 0.45) : 0,
      h1 ? (usage.inH1 ? 'H1 contains the primary keyword.' : 'H1 present but does not contain the keyword.') : 'No H1 found.'),

    check('heading-structure', 'Subheading structure', 7,
      headings.length >= 5 ? 1 : headings.length >= 3 ? 0.7 : headings.length >= 1 ? 0.35 : 0,
      `${headings.length} subheadings (aim for 1 per ~250 words).`),

    check('heading-keyword', 'Keyword in subheadings', 5,
      usage.inSubheadings >= 2 ? 1 : usage.inSubheadings === 1 ? 0.6 : 0,
      `Keyword appears in ${usage.inSubheadings} subheading${usage.inSubheadings === 1 ? '' : 's'}.`),

    check('intro-keyword', 'Keyword in opening paragraph', 6, usage.inFirstParagraph ? 1 : 0,
      usage.inFirstParagraph ? 'Keyword appears in the first paragraph.' : 'Work the keyword into the first 100 words.'),

    check('density', 'Keyword density', 8,
      usage.verdict === 'optimal' ? 1 : usage.verdict === 'high' ? 0.5 : usage.verdict === 'under-optimized' ? 0.3 : 0,
      `${usage.count} uses (${(usage.density * 100).toFixed(2)}%) — ${usage.verdict}. Recommended ${usage.recommended.min}-${usage.recommended.max}.`),

    check('distribution', 'Keyword distribution', 5, usage.distribution,
      `Spread evenness ${(usage.distribution * 100).toFixed(0)}% across the document.`),

    check('length', 'Content length', 9,
      benchmark
        ? wordCount >= benchmark.target ? 1 : Math.max(0.15, wordCount / benchmark.target)
        : wordCount >= 1500 ? 1 : wordCount >= 900 ? 0.7 : wordCount >= 500 ? 0.4 : 0.15,
      benchmark
        ? `${wordCount} words vs ${benchmark.target} target (SERP median ${benchmark.median}).`
        : `${wordCount} words.`),

    check('readability', 'Readability', 8,
      read.fleschReadingEase >= 55 && read.fleschReadingEase <= 75 ? 1
        : read.fleschReadingEase >= 45 && read.fleschReadingEase <= 85 ? 0.65 : 0.25,
      `Flesch ${read.fleschReadingEase} (${read.label}), grade ${read.consensusGrade}.`),

    check('sentence-length', 'Sentence length', 4,
      read.avgWordsPerSentence > 0 && read.avgWordsPerSentence <= 20 ? 1
        : read.avgWordsPerSentence <= 25 ? 0.6 : 0.2,
      `${read.avgWordsPerSentence} words per sentence (target under 20).`),

    check('internal-links', 'Internal links', 6,
      internalLinks >= 3 ? 1 : internalLinks >= 1 ? 0.5 : 0,
      `${internalLinks} internal link${internalLinks === 1 ? '' : 's'} (aim for 3+).`),

    check('external-links', 'Outbound citations', 4,
      externalLinks >= 2 ? 1 : externalLinks === 1 ? 0.5 : 0,
      `${externalLinks} outbound link${externalLinks === 1 ? '' : 's'} to sources.`),

    check('images', 'Images with alt text', 6,
      images.length === 0 ? 0 : withAlt / images.length,
      images.length ? `${withAlt}/${images.length} images have alt text.` : 'No images found — add at least one.'),

    check('url', 'Keyword in URL slug', 4, usage.inUrl ? 1 : url ? 0 : 0.5,
      url ? (usage.inUrl ? 'Slug contains the keyword.' : 'Slug does not contain the keyword.') : 'No URL supplied.'),
  ];

  const earned = checks.reduce((s, c) => s + c.points, 0);
  const total = checks.reduce((s, c) => s + c.max, 0);
  const score = Math.round((earned / total) * 100);

  return {
    score,
    grade: score >= 85 ? 'A' : score >= 70 ? 'B' : score >= 55 ? 'C' : score >= 40 ? 'D' : 'F',
    checks,
    keyword: usage,
    readability: read,
    wordCount,
    benchmark,
  };
}
