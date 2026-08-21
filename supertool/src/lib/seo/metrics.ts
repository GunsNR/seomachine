/**
 * Ranking-economics models: difficulty, authority, click-through, traffic
 * value and opportunity. These are the numbers a strategist actually acts on.
 */
import { classifyIntent } from './keywords';
import { round } from './text';

/**
 * Organic CTR by position. Derived from the shape of published large-scale
 * click studies: a steep head, a long shallow tail, and a floor on page two.
 */
const CTR_CURVE = [
  0.2745, 0.1509, 0.0997, 0.0723, 0.0551, 0.0434, 0.0352, 0.0292, 0.0247, 0.0212,
  0.0186, 0.0164, 0.0146, 0.0131, 0.0118, 0.0107, 0.0098, 0.0090, 0.0083, 0.0076,
];

/** Expected organic CTR for a position, adjusted for SERP features. */
export function ctrForPosition(
  position: number,
  opts: { hasAiOverview?: boolean; hasFeaturedSnippet?: boolean; adsAbove?: number } = {},
): number {
  if (position < 1 || position > 100) return 0;
  const base =
    position <= CTR_CURVE.length
      ? CTR_CURVE[position - 1]
      : // Tail decays smoothly toward zero past position 20.
        Math.max(0.0004, CTR_CURVE[CTR_CURVE.length - 1] * Math.pow(0.88, position - CTR_CURVE.length));

  let factor = 1;
  // An AI Overview absorbs a large share of clicks from the classic results.
  if (opts.hasAiOverview) factor *= position <= 3 ? 0.66 : 0.78;
  if (opts.hasFeaturedSnippet && position > 1) factor *= 0.88;
  if (opts.adsAbove) factor *= Math.max(0.62, 1 - opts.adsAbove * 0.09);

  return round(base * factor, 5);
}

export interface SerpCompetitor {
  domain: string;
  /** 0-100 authority of the ranking domain. */
  domainAuthority: number;
  /** Referring domains pointing at the specific ranking URL. */
  referringDomains: number;
  wordCount?: number;
}

/**
 * Keyword Difficulty, 0-100 — how hard it is to break into the top 10.
 *
 * Driven mainly by the link authority of the incumbents (the dominant factor
 * in every published KD model), tempered by content depth and SERP crowding.
 */
export function keywordDifficulty(
  competitors: SerpCompetitor[],
  opts: { hasAiOverview?: boolean; hasFeaturedSnippet?: boolean } = {},
): number {
  if (!competitors.length) return 0;
  const top10 = competitors.slice(0, 10);

  // Log-scaled referring domains: the 10th link matters far more than the 1000th.
  const linkStrength =
    top10.reduce((sum, c) => sum + Math.log10(Math.max(1, c.referringDomains) + 1), 0) / top10.length;
  const linkComponent = Math.min(1, linkStrength / 3.2); // ~1500 RDs saturates

  const authorityComponent =
    top10.reduce((sum, c) => sum + c.domainAuthority, 0) / (top10.length * 100);

  const depths = top10.map((c) => c.wordCount ?? 0).filter((n) => n > 0);
  const depthComponent = depths.length
    ? Math.min(1, depths.reduce((a, b) => a + b, 0) / depths.length / 3000)
    : 0.35;

  // A shallow SERP (fewer than 10 real organic results) is easier to enter.
  const crowding = Math.min(1, top10.length / 10);

  let kd =
    (linkComponent * 0.5 + authorityComponent * 0.32 + depthComponent * 0.18) * 100 * crowding;

  if (opts.hasAiOverview) kd += 4;
  if (opts.hasFeaturedSnippet) kd += 2;

  return Math.round(Math.min(100, Math.max(0, kd)));
}

/**
 * Domain Authority, 0-100 — a log-scaled blend of referring-domain breadth,
 * total backlink volume and link quality.
 */
export function domainAuthority(input: {
  referringDomains: number;
  backlinks: number;
  dofollowRatio?: number;
  avgLinkingAuthority?: number;
}): number {
  const { referringDomains, backlinks, dofollowRatio = 0.7, avgLinkingAuthority = 30 } = input;

  const rd = Math.log10(Math.max(1, referringDomains) + 1) / 6; // 1M RDs -> ~1
  const bl = Math.log10(Math.max(1, backlinks) + 1) / 8;
  const quality = (avgLinkingAuthority / 100) * 0.6 + dofollowRatio * 0.4;

  const raw = rd * 0.55 + bl * 0.2 + quality * 0.25;
  // Authority scores compress at the top; mirror that curve.
  return Math.round(Math.min(100, Math.pow(raw, 0.82) * 100));
}

/** Monthly organic traffic a position is worth for a given search volume. */
export function estimatedTraffic(
  volume: number,
  position: number,
  opts?: Parameters<typeof ctrForPosition>[1],
): number {
  return Math.round(volume * ctrForPosition(position, opts));
}

/** Dollar value of that traffic if it were bought on paid search instead. */
export function trafficValue(volume: number, position: number, cpc: number): number {
  return round(estimatedTraffic(volume, position) * cpc, 2);
}

export interface OpportunityInput {
  volume: number;
  /** Current rank; 0 or >100 means unranked. */
  position: number;
  difficulty: number;
  intent: string;
  cpc?: number;
  /** How many other keywords in the project share this topic cluster. */
  clusterSize?: number;
  /** Months since the target page was last updated. */
  monthsSinceUpdate?: number;
  /** 12 monthly volumes, oldest first. */
  trend?: number[];
}

export interface OpportunityResult {
  score: number;
  band: 'quick-win' | 'high' | 'medium' | 'low';
  factors: Record<string, number>;
  rationale: string;
}

// Weights mirror the eight-factor model this workspace already scores with.
const WEIGHTS = {
  volume: 25, position: 20, intent: 20, competition: 15,
  cluster: 10, ctr: 5, freshness: 5, trend: 5,
};
const WEIGHT_TOTAL = Object.values(WEIGHTS).reduce((a, b) => a + b, 0);

const INTENT_VALUE: Record<string, number> = {
  transactional: 1, commercial: 0.85, navigational: 0.4, informational: 0.55,
};

export function opportunityScore(input: OpportunityInput): OpportunityResult {
  const {
    volume, position, difficulty, intent, cpc = 0,
    clusterSize = 1, monthsSinceUpdate = 0, trend = [],
  } = input;

  const ranked = position >= 1 && position <= 100;

  // Volume on a log scale — 100 and 1,000 searches differ far more than
  // 100,000 and 101,000 do.
  const fVolume = Math.min(1, Math.log10(Math.max(1, volume) + 1) / 5);

  // Positions 4-20 are where a push moves the most traffic.
  const fPosition = !ranked
    ? 0.2
    : position <= 3 ? 0.25
    : position <= 10 ? 1
    : position <= 20 ? 0.8
    : position <= 50 ? 0.45
    : 0.25;

  const fIntent = INTENT_VALUE[intent] ?? INTENT_VALUE[classifyIntent(intent)] ?? 0.55;
  const fCompetition = 1 - Math.min(1, difficulty / 100);
  const fCluster = Math.min(1, Math.log2(Math.max(1, clusterSize) + 1) / 4);

  // Headroom: the CTR still unclaimed between here and position 1.
  const fCtr = ranked
    ? Math.min(1, (ctrForPosition(1) - ctrForPosition(position)) / ctrForPosition(1))
    : 1;

  const fFreshness = monthsSinceUpdate <= 0 ? 0.5 : Math.min(1, monthsSinceUpdate / 18);

  const fTrend = (() => {
    if (trend.length < 4) return 0.5;
    const half = Math.floor(trend.length / 2);
    const older = trend.slice(0, half).reduce((a, b) => a + b, 0) / half || 1;
    const newer = trend.slice(half).reduce((a, b) => a + b, 0) / (trend.length - half) || 1;
    return Math.min(1, Math.max(0, 0.5 + (newer / older - 1)));
  })();

  const factors = {
    volume: fVolume, position: fPosition, intent: fIntent, competition: fCompetition,
    cluster: fCluster, ctr: fCtr, freshness: fFreshness, trend: fTrend,
  };

  const weighted =
    (fVolume * WEIGHTS.volume +
      fPosition * WEIGHTS.position +
      fIntent * WEIGHTS.intent +
      fCompetition * WEIGHTS.competition +
      fCluster * WEIGHTS.cluster +
      fCtr * WEIGHTS.ctr +
      fFreshness * WEIGHTS.freshness +
      fTrend * WEIGHTS.trend) /
    WEIGHT_TOTAL;

  // A commercial CPC premium nudges genuinely monetisable terms upward.
  const cpcBoost = cpc > 0 ? Math.min(0.06, Math.log10(cpc + 1) * 0.05) : 0;
  const score = Math.round(Math.min(100, (weighted + cpcBoost) * 100));

  const quickWin = ranked && position >= 4 && position <= 20 && difficulty <= 45;
  const band: OpportunityResult['band'] =
    quickWin && score >= 55 ? 'quick-win' : score >= 70 ? 'high' : score >= 45 ? 'medium' : 'low';

  return {
    score,
    band,
    factors: Object.fromEntries(Object.entries(factors).map(([k, v]) => [k, round(v, 3)])),
    rationale: quickWin
      ? `Ranking #${position} with difficulty ${difficulty} — reachable top-3 without new links.`
      : !ranked
        ? `Not ranking yet; ${volume.toLocaleString()} monthly searches at difficulty ${difficulty}.`
        : `Position #${position}, difficulty ${difficulty}, ${volume.toLocaleString()} monthly searches.`,
  };
}

/** Share of voice across a keyword set, weighted by search volume. */
export function shareOfVoice(
  rows: Array<{ volume: number; position: number }>,
): number {
  const totalPotential = rows.reduce((s, r) => s + r.volume * ctrForPosition(1), 0);
  if (totalPotential <= 0) return 0;
  const captured = rows.reduce((s, r) => s + r.volume * ctrForPosition(r.position), 0);
  return round(captured / totalPotential, 4);
}
