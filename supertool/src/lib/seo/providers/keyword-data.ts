import 'server-only';
import { classifyIntent } from '../keywords';
import { estimateKeyword } from '../estimate';

/**
 * Keyword metrics, from a real provider where one is configured.
 *
 * Every row carries its own `source`, so the UI can state whether a number was
 * measured or modelled rather than presenting both as fact. A provider failure
 * degrades to the model instead of failing the request — a user adding
 * keywords should not be blocked by someone else's API being down.
 */

export interface KeywordMetrics {
  phrase: string;
  volume: number;
  difficulty: number;
  cpc: number;
  intent: string;
  /** 12 monthly volumes, oldest first. */
  trend: number[];
  source: 'measured' | 'estimated';
  provider?: string;
}

export function activeProvider(): 'dataforseo' | null {
  return process.env.DATAFORSEO_LOGIN && process.env.DATAFORSEO_PASSWORD ? 'dataforseo' : null;
}

export function providerConfigured(): boolean {
  return activeProvider() !== null;
}

/**
 * Fetches metrics for a batch of phrases.
 * Always returns one row per input, in the same order.
 */
export async function fetchKeywordMetrics(
  phrases: string[],
  opts: { locationCode?: number; languageCode?: string } = {},
): Promise<KeywordMetrics[]> {
  const unique = [...new Set(phrases.map((p) => p.trim().toLowerCase()).filter(Boolean))];
  if (!unique.length) return [];

  const provider = activeProvider();
  if (!provider) return unique.map(modelled);

  try {
    const measured = await fetchFromDataForSeo(unique, opts);
    // Fill any phrase the provider had no data for.
    return unique.map((phrase) => measured.get(phrase) ?? modelled(phrase));
  } catch (err) {
    console.error('keyword-data: provider failed, falling back to the model', err);
    return unique.map(modelled);
  }
}

function modelled(phrase: string): KeywordMetrics {
  const estimate = estimateKeyword(phrase);
  return {
    phrase,
    volume: estimate.volume,
    difficulty: estimate.difficulty,
    cpc: estimate.cpc,
    intent: classifyIntent(phrase),
    trend: estimate.trend,
    source: 'estimated',
  };
}

/* ------------------------------------------------------------------ */
/* DataForSEO                                                          */
/* ------------------------------------------------------------------ */

interface DfsMonthlySearch {
  year: number;
  month: number;
  search_volume: number | null;
}

interface DfsKeywordResult {
  keyword?: string;
  search_volume?: number | null;
  cpc?: number | null;
  competition_index?: number | null;
  monthly_searches?: DfsMonthlySearch[] | null;
}

const DFS_ENDPOINT =
  'https://api.dataforseo.com/v3/keywords_data/google_ads/search_volume/live';

async function fetchFromDataForSeo(
  phrases: string[],
  opts: { locationCode?: number; languageCode?: string },
): Promise<Map<string, KeywordMetrics>> {
  const auth = Buffer.from(
    `${process.env.DATAFORSEO_LOGIN}:${process.env.DATAFORSEO_PASSWORD}`,
  ).toString('base64');

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 25_000);

  try {
    const res = await fetch(DFS_ENDPOINT, {
      method: 'POST',
      headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify([
        {
          // The API caps a task at 1000 keywords.
          keywords: phrases.slice(0, 1000),
          location_code: opts.locationCode ?? 2840, // United States
          language_code: opts.languageCode ?? 'en',
          search_partners: false,
        },
      ]),
    });

    if (!res.ok) {
      throw new Error(`DataForSEO returned HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
    }

    const payload = (await res.json()) as {
      status_code?: number;
      status_message?: string;
      tasks?: Array<{ status_code?: number; status_message?: string; result?: DfsKeywordResult[] | null }>;
    };

    // DataForSEO returns HTTP 200 with an error status inside the body.
    if (payload.status_code && payload.status_code !== 20000) {
      throw new Error(`DataForSEO error ${payload.status_code}: ${payload.status_message ?? ''}`);
    }

    const out = new Map<string, KeywordMetrics>();

    for (const task of payload.tasks ?? []) {
      if (task.status_code && task.status_code !== 20000) {
        console.error(`keyword-data: task error ${task.status_code}: ${task.status_message ?? ''}`);
        continue;
      }
      for (const row of task.result ?? []) {
        const phrase = (row.keyword ?? '').trim().toLowerCase();
        if (!phrase) continue;
        out.set(phrase, toMetrics(phrase, row));
      }
    }

    return out;
  } finally {
    clearTimeout(timer);
  }
}

function toMetrics(phrase: string, row: DfsKeywordResult): KeywordMetrics {
  const volume = Math.max(0, Math.round(row.search_volume ?? 0));

  // A zero-volume row means the provider genuinely has no data, not that the
  // term has no demand. Model it rather than showing a misleading zero.
  if (volume === 0) return modelled(phrase);

  const cpc = Math.max(0, Math.round((row.cpc ?? 0) * 100) / 100);

  // competition_index is 0-100 paid competition, which correlates with but is
  // not the same as organic difficulty. Blend it toward the modelled organic
  // figure rather than presenting it as keyword difficulty outright.
  const paidCompetition = Math.max(0, Math.min(100, Math.round(row.competition_index ?? 0)));
  const organicModel = estimateKeyword(phrase).difficulty;
  const difficulty = Math.round(paidCompetition * 0.45 + organicModel * 0.55);

  const monthly = (row.monthly_searches ?? [])
    .filter((m): m is DfsMonthlySearch => !!m)
    .sort((a, b) => a.year - b.year || a.month - b.month)
    .map((m) => Math.max(0, Math.round(m.search_volume ?? 0)));

  // Pad or trim to exactly twelve points so the sparkline is consistent.
  const trend =
    monthly.length >= 12
      ? monthly.slice(-12)
      : [...Array.from({ length: 12 - monthly.length }, () => volume), ...monthly];

  return {
    phrase,
    volume,
    difficulty: Math.max(1, Math.min(100, difficulty)),
    cpc,
    intent: classifyIntent(phrase),
    trend,
    source: 'measured',
    provider: 'dataforseo',
  };
}
