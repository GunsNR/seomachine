/**
 * Answer analysis: given the text an assistant produced for a buyer question,
 * work out whether the brand was named, whether it was cited as a source,
 * where it ranked among the vendors mentioned, and how it was characterised.
 *
 * This is the measurement layer — it runs identically over a live API
 * response and a simulated one.
 */

export interface AnswerAnalysis {
  brandMentioned: boolean;
  brandCited: boolean;
  /** 1-based order of first appearance among all named vendors; 0 if absent. */
  mentionRank: number;
  sentiment: 'positive' | 'neutral' | 'negative';
  /** Brand's share of all vendor mentions in the answer, 0-1. */
  shareOfVoice: number;
  citedUrls: string[];
  competitorsMentioned: string[];
  /** The sentence that names the brand, for the evidence drawer. */
  excerpt: string;
}

const URL_RE = /https?:\/\/[^\s<>()[\]"']+/gi;

const POSITIVE = /\b(best|leading|top|excellent|powerful|popular|recommended|strong|robust|comprehensive|trusted|reliable|great|ideal|standout|favou?rite)\b/gi;
const NEGATIVE = /\b(limited|lacking|expensive|outdated|weak|poor|clunky|confusing|buggy|drawback|downside|disappointing|slow|difficult)\b/gi;

/** Escape a string for safe embedding in a RegExp. */
function esc(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Match a brand as a whole word, tolerating spacing/casing variants. */
function brandRegex(brand: string): RegExp {
  const flexible = esc(brand.trim()).replace(/\\?\s+/g, '[\\s-]?');
  return new RegExp(`(?<![\\w])${flexible}(?![\\w])`, 'gi');
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '').toLowerCase();
  } catch {
    return '';
  }
}

function rootDomain(input: string): string {
  const host = input.includes('://') ? hostOf(input) : input.replace(/^www\./, '').toLowerCase();
  return host.split('/')[0];
}

function splitSentences(text: string): string[] {
  return text.split(/(?<=[.!?])\s+|\n+/).map((s) => s.trim()).filter(Boolean);
}

export interface AnalyzeAnswerInput {
  answer: string;
  brand: string;
  /** The brand's own domain, matched against citation URLs. */
  domain: string;
  /** Competitor names and/or domains to look for. */
  competitors: Array<{ name?: string; domain: string }>;
  /** Citation URLs the provider returned out-of-band, if any. */
  providedCitations?: string[];
}

export function analyzeAnswer(input: AnalyzeAnswerInput): AnswerAnalysis {
  const { answer, brand, domain, competitors, providedCitations = [] } = input;

  const inlineUrls = answer.match(URL_RE) ?? [];
  const citedUrls = [...new Set([...providedCitations, ...inlineUrls].map((u) => u.replace(/[.,);]+$/, '')))];

  // Name mentions are counted over prose only. A vendor's domain appearing
  // inside a source URL is a citation, not a second mention of the vendor —
  // counting it twice would inflate that vendor's share of voice.
  const prose = answer.replace(URL_RE, ' ');

  const brandRoot = rootDomain(domain);
  const brandRe = brandRegex(brand);
  const brandNameHits = [...prose.matchAll(brandRe)];
  const brandMentioned = brandNameHits.length > 0;

  // "Cited" is stricter than "mentioned": the brand's own domain must appear
  // as a source the assistant is pointing at.
  const brandCited =
    !!brandRoot &&
    citedUrls.some((u) => {
      const h = hostOf(u);
      return h === brandRoot || h.endsWith(`.${brandRoot}`);
    });

  // Build an ordered list of every vendor named, to derive rank and SoV.
  interface Hit { key: string; index: number; count: number; isBrand: boolean }
  const hits: Hit[] = [];

  if (brandMentioned) {
    hits.push({
      key: brand,
      index: brandNameHits[0].index ?? 0,
      count: brandNameHits.length,
      isBrand: true,
    });
  }

  const competitorsMentioned: string[] = [];
  for (const comp of competitors) {
    const label = comp.name?.trim() || rootDomain(comp.domain).split('.')[0];
    if (!label) continue;
    const compRoot = rootDomain(comp.domain);

    const nameHits = [...prose.matchAll(brandRegex(label))];
    const domainHit = compRoot && citedUrls.some((u) => hostOf(u).endsWith(compRoot));
    if (!nameHits.length && !domainHit) continue;

    competitorsMentioned.push(compRoot || label);
    hits.push({
      key: label,
      index: nameHits.length ? nameHits[0].index ?? Number.MAX_SAFE_INTEGER : Number.MAX_SAFE_INTEGER - 1,
      count: nameHits.length || 1,
      isBrand: false,
    });
  }

  hits.sort((a, b) => a.index - b.index);
  const mentionRank = brandMentioned ? hits.findIndex((h) => h.isBrand) + 1 : 0;

  const totalMentions = hits.reduce((s, h) => s + h.count, 0);
  const brandMentions = hits.find((h) => h.isBrand)?.count ?? 0;
  const shareOfVoice = totalMentions > 0 ? brandMentions / totalMentions : 0;

  // Sentiment is judged only on the sentences that actually name the brand.
  const brandSentences = splitSentences(prose).filter((s) => brandRegex(brand).test(s));
  const scope = brandSentences.join(' ');
  const pos = (scope.match(POSITIVE) ?? []).length;
  const neg = (scope.match(NEGATIVE) ?? []).length;
  const sentiment: AnswerAnalysis['sentiment'] =
    !brandMentioned || pos === neg ? 'neutral' : pos > neg ? 'positive' : 'negative';

  return {
    brandMentioned,
    brandCited,
    mentionRank,
    sentiment,
    shareOfVoice: Math.round(shareOfVoice * 10000) / 10000,
    citedUrls,
    competitorsMentioned: [...new Set(competitorsMentioned)],
    excerpt: (brandSentences[0] ?? splitSentences(prose)[0] ?? '').slice(0, 400),
  };
}

export interface VisibilityRollup {
  /** Share of checks in which the brand was named at all, 0-1. */
  mentionRate: number;
  /** Share of checks in which the brand's own domain was cited, 0-1. */
  citationRate: number;
  /** Volume-free average share of voice across checks, 0-1. */
  shareOfVoice: number;
  /** Mean rank among named vendors, over checks where the brand appeared. */
  avgMentionRank: number;
  /** Headline 0-100 score blending the four measures above. */
  score: number;
  checks: number;
  sentimentSplit: { positive: number; neutral: number; negative: number };
}

/** One check as the roll-up needs it. `sentiment` is widened to `string`
 *  because it arrives from a database column that cannot be enum-typed. */
export interface RollupInput {
  brandMentioned: boolean;
  brandCited: boolean;
  shareOfVoice: number;
  mentionRank: number;
  sentiment: string;
}

/** Coerce any stored value into a known sentiment bucket. */
function normalizeSentiment(value: string): AnswerAnalysis['sentiment'] {
  return value === 'positive' || value === 'negative' ? value : 'neutral';
}

/**
 * Roll individual checks up into the headline AI Visibility Score.
 *
 * Mention rate carries the most weight (being named at all is the gate),
 * then citation rate (attribution drives referral traffic), then share of
 * voice and rank position.
 */
export function rollUpVisibility(checks: RollupInput[]): VisibilityRollup {
  const n = checks.length;
  if (n === 0) {
    return {
      mentionRate: 0, citationRate: 0, shareOfVoice: 0, avgMentionRank: 0,
      score: 0, checks: 0, sentimentSplit: { positive: 0, neutral: 0, negative: 0 },
    };
  }

  const mentioned = checks.filter((c) => c.brandMentioned);
  const mentionRate = mentioned.length / n;
  const citationRate = checks.filter((c) => c.brandCited).length / n;
  const shareOfVoice = checks.reduce((s, c) => s + c.shareOfVoice, 0) / n;
  const avgMentionRank = mentioned.length
    ? mentioned.reduce((s, c) => s + c.mentionRank, 0) / mentioned.length
    : 0;

  // Rank 1 is worth full credit; credit decays toward 0 by rank 6.
  const rankQuality = avgMentionRank > 0 ? Math.max(0, 1 - (avgMentionRank - 1) / 5) : 0;

  const score = Math.round(
    (mentionRate * 0.4 + citationRate * 0.25 + shareOfVoice * 0.2 + rankQuality * 0.15) * 100,
  );

  const sentimentSplit = { positive: 0, neutral: 0, negative: 0 };
  for (const c of checks) sentimentSplit[normalizeSentiment(c.sentiment)]++;

  return {
    mentionRate: Math.round(mentionRate * 10000) / 10000,
    citationRate: Math.round(citationRate * 10000) / 10000,
    shareOfVoice: Math.round(shareOfVoice * 10000) / 10000,
    avgMentionRank: Math.round(avgMentionRank * 100) / 100,
    score,
    checks: n,
    sentimentSplit,
  };
}
