/**
 * Keyword metric estimation for when no data provider is connected.
 *
 * These are **modelled** figures, not measured ones, and the UI labels them as
 * such. They exist so the product is usable and internally consistent out of
 * the box — the opportunity score needs a volume and a difficulty to rank
 * against — not to pretend we have Semrush's index.
 *
 * The model is deterministic (hashed on the phrase) so the same keyword always
 * produces the same estimate, and driven by real linguistic signals: head
 * terms are shorter and higher-volume, commercial modifiers carry higher CPC,
 * question phrasing skews informational and long-tail.
 */
import { classifyIntent } from './keywords';
import { round } from './text';

function hash(str: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

/** Deterministic value in [0,1) derived from a phrase and a salt. */
function jitter(phrase: string, salt: string): number {
  return (hash(`${phrase}|${salt}`) % 10_000) / 10_000;
}

const HIGH_CPC = /\b(software|platform|tool|agency|service|consultant|pricing|cost|buy|hire|insurance|lawyer|attorney|crm|saas)\b/i;
const QUESTION = /^(how|what|why|when|where|which|who|can|does|is|are|should|do)\b/i;

export interface KeywordEstimate {
  volume: number;
  difficulty: number;
  cpc: number;
  trend: number[];
  /** Always 'estimated' here; a connected provider would return 'measured'. */
  source: 'estimated';
}

export function estimateKeyword(phrase: string, _domain = ''): KeywordEstimate {
  const words = phrase.trim().split(/\s+/).filter(Boolean);
  const wordCount = Math.max(1, words.length);
  const intent = classifyIntent(phrase);

  // Volume decays sharply with phrase length — the long tail is long and thin.
  const base = 12_000 / Math.pow(wordCount, 1.85);
  const spread = 0.35 + jitter(phrase, 'vol') * 1.3;
  const volume = Math.max(10, Math.round((base * spread) / 10) * 10);

  // Difficulty rises with commercial value and falls with specificity.
  const intentWeight =
    intent === 'transactional' ? 20 : intent === 'commercial' ? 14 : intent === 'navigational' ? 4 : 0;
  const lengthRelief = Math.min(34, (wordCount - 1) * 9);
  const difficulty = Math.max(
    1,
    Math.min(100, Math.round(42 + intentWeight - lengthRelief + jitter(phrase, 'kd') * 26)),
  );

  // CPC tracks commercial intent and vertical, not volume.
  const cpcBase =
    intent === 'transactional' ? 6.5 : intent === 'commercial' ? 4.2 : intent === 'navigational' ? 0.9 : 1.6;
  const vertical = HIGH_CPC.test(phrase) ? 2.1 : 1;
  const cpc = round(Math.max(0.1, cpcBase * vertical * (0.45 + jitter(phrase, 'cpc') * 1.5)), 2);

  // Twelve months with a mild trend and seasonality, anchored on volume.
  const direction = (jitter(phrase, 'dir') - 0.45) * 0.5;
  const trend = Array.from({ length: 12 }, (_, i) => {
    const drift = 1 + direction * (i / 11);
    const season = 1 + Math.sin((i / 12) * Math.PI * 2 + jitter(phrase, 'phase') * 6) * 0.12;
    const noise = 0.94 + jitter(phrase, `m${i}`) * 0.12;
    return Math.max(0, Math.round(volume * drift * season * noise));
  });

  return {
    volume,
    difficulty,
    cpc,
    trend,
    source: 'estimated',
  };
}

/** True when a third-party keyword data provider is configured. */
export function hasKeywordProvider(): boolean {
  return Boolean(
    process.env.DATAFORSEO_LOGIN ||
      process.env.SEMRUSH_API_KEY ||
      process.env.GOOGLE_SEARCH_CONSOLE_CREDENTIALS,
  );
}

export const QUESTION_RE = QUESTION;
