/**
 * Keyword extraction, density and prominence analysis.
 *
 * Mirrors what Semrush's On-Page Checker and Ahrefs' Content Grader measure:
 * how often a term appears, where it appears, whether it is over-used, and
 * which co-occurring terms the page is missing.
 */
import { round, sentences, toPlainText, words } from './text';

export const STOP_WORDS = new Set([
  'a','about','above','after','again','against','all','am','an','and','any','are','as','at',
  'be','because','been','before','being','below','between','both','but','by','can','cannot',
  'could','did','do','does','doing','down','during','each','few','for','from','further','had',
  'has','have','having','he','her','here','hers','herself','him','himself','his','how','i','if',
  'in','into','is','it','its','itself','just','me','more','most','my','myself','no','nor','not',
  'now','of','off','on','once','only','or','other','ought','our','ours','ourselves','out','over',
  'own','same','she','should','so','some','such','than','that','the','their','theirs','them',
  'themselves','then','there','these','they','this','those','through','to','too','under','until',
  'up','very','was','we','were','what','when','where','which','while','who','whom','why','will',
  'with','would','you','your','yours','yourself','yourselves','s','t','don','now','also','into',
]);

export interface TermStat {
  term: string;
  count: number;
  /** Share of all non-stopword tokens, 0-1. */
  density: number;
  words: number;
}

/** Count contiguous n-grams, skipping any that start or end on a stop word. */
export function ngrams(text: string, n: number): TermStat[] {
  const tokens = words(text);
  if (tokens.length < n) return [];

  const counts = new Map<string, number>();
  for (let i = 0; i <= tokens.length - n; i++) {
    const gram = tokens.slice(i, i + n);
    if (STOP_WORDS.has(gram[0]) || STOP_WORDS.has(gram[n - 1])) continue;
    if (gram.some((g) => /^\d+$/.test(g)) && n === 1) continue;
    const key = gram.join(' ');
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  const contentTokens = tokens.filter((t) => !STOP_WORDS.has(t)).length || 1;

  return [...counts.entries()]
    .map(([term, count]) => ({ term, count, density: count / contentTokens, words: n }))
    .sort((a, b) => b.count - a.count || a.term.localeCompare(b.term));
}

/** Top terms across 1-, 2- and 3-word phrases, longest-phrase-first on ties. */
export function extractTerms(text: string, limit = 25): TermStat[] {
  const all = [...ngrams(text, 3), ...ngrams(text, 2), ...ngrams(text, 1)].filter(
    (t) => t.count > 1 || t.words > 1,
  );
  return all
    .sort((a, b) => b.count * b.words - a.count * a.words || b.count - a.count)
    .slice(0, limit);
}

export function countPhrase(text: string, phrase: string): number {
  const needle = words(phrase);
  if (!needle.length) return 0;
  const hay = words(text);
  let hits = 0;
  for (let i = 0; i <= hay.length - needle.length; i++) {
    let match = true;
    for (let j = 0; j < needle.length; j++) {
      if (hay[i + j] !== needle[j]) { match = false; break; }
    }
    if (match) hits++;
  }
  return hits;
}

export type StuffingVerdict = 'under-optimized' | 'optimal' | 'high' | 'stuffed';

export interface KeywordUsage {
  keyword: string;
  count: number;
  density: number;
  verdict: StuffingVerdict;
  /** Recommended occurrence range for this document length. */
  recommended: { min: number; max: number };
  inTitle: boolean;
  inMetaDescription: boolean;
  inH1: boolean;
  inSubheadings: number;
  inFirstParagraph: boolean;
  inUrl: boolean;
  inImageAlt: boolean;
  /** 0-1: how evenly the keyword is spread across the document. */
  distribution: number;
  /** 0-100 placement score across the slots above. */
  placementScore: number;
}

export interface UsageContext {
  title?: string;
  metaDescription?: string;
  h1?: string;
  subheadings?: string[];
  url?: string;
  imageAlts?: string[];
}

const has = (haystack: string | undefined, phrase: string): boolean =>
  !!haystack && countPhrase(haystack, phrase) > 0;

/**
 * Even-spread measure: split the body into quartiles and compare the observed
 * per-quartile hit distribution to a perfectly uniform one.
 */
export function distributionScore(text: string, keyword: string, buckets = 4): number {
  const tokens = words(text);
  const needle = words(keyword);
  if (!tokens.length || !needle.length) return 0;

  const size = Math.ceil(tokens.length / buckets);
  const hits = new Array(buckets).fill(0);

  for (let i = 0; i <= tokens.length - needle.length; i++) {
    if (needle.every((w, j) => tokens[i + j] === w)) {
      hits[Math.min(buckets - 1, Math.floor(i / size))]++;
    }
  }

  const total = hits.reduce((a, b) => a + b, 0);
  if (total === 0) return 0;
  if (total === 1) return 0.25;

  // 1 - normalised mean absolute deviation from the uniform share.
  const ideal = total / buckets;
  const deviation = hits.reduce((sum, h) => sum + Math.abs(h - ideal), 0);
  const worstCase = 2 * (total - ideal);
  return worstCase <= 0 ? 1 : round(1 - deviation / worstCase, 3);
}

export function analyzeKeyword(
  body: string,
  keyword: string,
  ctx: UsageContext = {},
): KeywordUsage {
  const tokens = words(body);
  const contentTokens = tokens.filter((t) => !STOP_WORDS.has(t)).length || 1;
  const count = countPhrase(body, keyword);
  const density = count / contentTokens;

  // Semrush/Yoast converge on ~0.5-2.5% for a primary term; scale to length.
  const min = Math.max(2, Math.round(contentTokens * 0.005));
  const max = Math.max(min + 1, Math.round(contentTokens * 0.025));

  let verdict: StuffingVerdict;
  if (count < min) verdict = 'under-optimized';
  else if (count <= max) verdict = 'optimal';
  else if (density <= 0.04) verdict = 'high';
  else verdict = 'stuffed';

  const firstPara = toPlainText(body).split(/(?<=[.!?])\s+/).slice(0, 3).join(' ');
  const subheadHits = (ctx.subheadings ?? []).filter((h) => has(h, keyword)).length;

  const usage: Omit<KeywordUsage, 'placementScore'> = {
    keyword,
    count,
    density: round(density, 5),
    verdict,
    recommended: { min, max },
    inTitle: has(ctx.title, keyword),
    inMetaDescription: has(ctx.metaDescription, keyword),
    inH1: has(ctx.h1, keyword),
    inSubheadings: subheadHits,
    inFirstParagraph: countPhrase(firstPara, keyword) > 0,
    inUrl: !!ctx.url && ctx.url.toLowerCase().includes(words(keyword).join('-')),
    inImageAlt: (ctx.imageAlts ?? []).some((a) => has(a, keyword)),
    distribution: distributionScore(body, keyword),
  };

  // Weighted the way search engines weight the slots.
  const weights: Array<[boolean, number]> = [
    [usage.inTitle, 24],
    [usage.inH1, 18],
    [usage.inMetaDescription, 10],
    [usage.inFirstParagraph, 14],
    [usage.inSubheadings > 0, 12],
    [usage.inUrl, 10],
    [usage.inImageAlt, 6],
    [usage.verdict === 'optimal', 6],
  ];
  const placementScore =
    weights.reduce((sum, [hit, w]) => sum + (hit ? w : 0), 0) * (0.7 + 0.3 * usage.distribution);

  return { ...usage, placementScore: Math.round(Math.min(100, placementScore)) };
}

/**
 * Terms competitors use that the draft does not — the "content gap" list.
 * `competitorTexts` are the bodies of the pages currently ranking.
 */
export function missingTerms(
  draft: string,
  competitorTexts: string[],
  limit = 20,
): Array<{ term: string; competitorsUsing: number; avgUses: number }> {
  const draftTerms = new Set(extractTerms(draft, 400).map((t) => t.term));
  const tally = new Map<string, { docs: number; uses: number }>();

  for (const text of competitorTexts) {
    const seen = new Set<string>();
    for (const t of extractTerms(text, 120)) {
      if (draftTerms.has(t.term)) continue;
      const entry = tally.get(t.term) ?? { docs: 0, uses: 0 };
      if (!seen.has(t.term)) { entry.docs++; seen.add(t.term); }
      entry.uses += t.count;
      tally.set(t.term, entry);
    }
  }

  return [...tally.entries()]
    .filter(([, v]) => v.docs >= Math.max(2, Math.ceil(competitorTexts.length * 0.4)))
    .map(([term, v]) => ({
      term,
      competitorsUsing: v.docs,
      avgUses: round(v.uses / v.docs, 1),
    }))
    .sort((a, b) => b.competitorsUsing - a.competitorsUsing || b.avgUses - a.avgUses)
    .slice(0, limit);
}

/** Classify a query into the four standard search intents. */
export function classifyIntent(
  query: string,
): 'informational' | 'commercial' | 'transactional' | 'navigational' {
  const q = query.toLowerCase();
  if (/\b(buy|price|pricing|cost|order|subscribe|signup|sign up|deal|discount|coupon|for sale|hire|quote)\b/.test(q))
    return 'transactional';
  if (/\b(best|top|vs|versus|review|reviews|compare|comparison|alternative|alternatives|cheapest)\b/.test(q))
    return 'commercial';
  if (/\b(login|log in|sign in|dashboard|download|app|official|website|contact|careers)\b/.test(q))
    return 'navigational';
  return 'informational';
}

/** Average sentence length inside the sentences that contain the keyword. */
export function keywordSentenceLength(body: string, keyword: string): number {
  const hits = sentences(body).filter((s) => countPhrase(s, keyword) > 0);
  if (!hits.length) return 0;
  return round(hits.reduce((sum, s) => sum + words(s).length, 0) / hits.length, 1);
}
