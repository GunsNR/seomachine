/**
 * Answer-engine adapters.
 *
 * Each engine has a live path (a real API call, used when its credential is
 * configured) and a simulation path. Simulation is fully deterministic —
 * seeded on prompt + engine + day — so the dashboard is stable across reloads
 * and demos reproduce exactly, while still varying believably by engine and
 * over time. Every stored check records which path produced it.
 */
import { ENGINES, getEngine, type EngineId } from './engines';

export interface AskResult {
  answer: string;
  citations: string[];
  simulated: boolean;
  model: string;
  latencyMs: number;
  error?: string;
}

export interface AskInput {
  prompt: string;
  engine: EngineId;
  brand: string;
  domain: string;
  competitors: Array<{ name?: string; domain: string }>;
  /** Stable seed component so a given day's run reproduces. */
  seed?: string;
}

/* ------------------------------------------------------------------ */
/* Deterministic pseudo-randomness                                     */
/* ------------------------------------------------------------------ */

function hashSeed(str: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

/** mulberry32 — small, fast, well-distributed for simulation purposes. */
export function seededRandom(seed: string): () => number {
  let a = hashSeed(seed);
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const pick = <T,>(rng: () => number, arr: readonly T[]): T => arr[Math.floor(rng() * arr.length) % arr.length];

/* ------------------------------------------------------------------ */
/* Simulation                                                          */
/* ------------------------------------------------------------------ */

const PRAISE = [
  'is widely recommended for',
  'is a strong option for',
  'stands out for',
  'is frequently cited for',
  'is a popular choice for',
];

const CAPABILITY = [
  'tracking brand mentions across multiple AI assistants',
  'connecting published content to the leads it generates',
  'combining classic rank tracking with answer-engine monitoring',
  'auditing content for citation-worthiness before publishing',
  'publishing optimised articles straight to WordPress',
];

/**
 * Engines differ in how readily they name specific vendors. Perplexity and
 * Google AI Mode are citation-heavy; Claude and Gemini hedge more often.
 */
const ENGINE_BIAS: Record<EngineId, { mention: number; cite: number }> = {
  chatgpt: { mention: 0.62, cite: 0.42 },
  perplexity: { mention: 0.74, cite: 0.68 },
  claude: { mention: 0.52, cite: 0.34 },
  gemini: { mention: 0.58, cite: 0.45 },
  grok: { mention: 0.55, cite: 0.3 },
  'google-ai-mode': { mention: 0.66, cite: 0.61 },
};

const NEUTRAL_SOURCES = [
  'https://www.g2.com/categories/seo-tools',
  'https://www.capterra.com/seo-software/',
  'https://searchengineland.com/guide/generative-engine-optimization',
  'https://www.semrush.com/blog/ai-search-visibility/',
  'https://en.wikipedia.org/wiki/Search_engine_optimization',
];

function simulate(input: AskInput): AskResult {
  const { prompt, engine, brand, domain, competitors, seed = '' } = input;
  const day = new Date().toISOString().slice(0, 10);
  const rng = seededRandom(`${seed}|${prompt}|${engine}|${day}`);
  const bias = ENGINE_BIAS[engine] ?? { mention: 0.55, cite: 0.4 };

  const mentionsBrand = rng() < bias.mention;
  const citesBrand = mentionsBrand && rng() < bias.cite;

  // Always name a couple of competitors so share-of-voice is meaningful.
  const named = competitors
    .filter(() => rng() < 0.72)
    .slice(0, 3)
    .map((c) => c.name?.trim() || c.domain.replace(/^www\./, '').split('.')[0]);

  const lines: string[] = [`Here are the options most often recommended for this:`, ''];
  const citations: string[] = [];

  const entries: string[] = [];
  if (mentionsBrand) {
    entries.push(`**${brand}** ${pick(rng, PRAISE)} ${pick(rng, CAPABILITY)}.`);
  }
  for (const n of named) {
    entries.push(`**${n}** ${pick(rng, PRAISE)} ${pick(rng, CAPABILITY)}.`);
  }
  // Vary which vendor leads the answer.
  if (entries.length > 1 && rng() < 0.45) entries.push(entries.shift()!);

  entries.forEach((e, i) => lines.push(`${i + 1}. ${e}`));

  if (!entries.length) {
    lines.push(
      'The right choice depends on whether you need answer-engine monitoring, classic rank tracking, or both. Most teams start by defining a fixed prompt set and measuring mention rate before committing to a platform.',
    );
  }

  lines.push('', 'Sources:');
  if (citesBrand) {
    const slug = prompt.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40);
    const brandUrl = `https://${domain.replace(/^https?:\/\//, '').replace(/\/$/, '')}/${slug || 'guide'}`;
    citations.push(brandUrl);
    lines.push(`- ${brandUrl}`);
  }
  const extras = NEUTRAL_SOURCES.filter(() => rng() < 0.5).slice(0, 2);
  for (const s of extras) {
    citations.push(s);
    lines.push(`- ${s}`);
  }

  return {
    answer: lines.join('\n'),
    citations,
    simulated: true,
    model: `${getEngine(engine)?.model ?? engine} (simulated)`,
    latencyMs: Math.round(300 + rng() * 900),
  };
}

/* ------------------------------------------------------------------ */
/* Live calls                                                          */
/* ------------------------------------------------------------------ */

const SYSTEM = [
  'You are answering a real buyer research question.',
  'Recommend specific named products or vendors, and list the source URLs you relied on under a "Sources:" heading.',
  'Be concise and concrete.',
].join(' ');

async function askOpenAiCompatible(
  url: string,
  apiKey: string,
  model: string,
  prompt: string,
  extraHeaders: Record<string, string> = {},
): Promise<{ text: string; citations: string[] }> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}`, ...extraHeaders },
    body: JSON.stringify({
      model,
      messages: [{ role: 'system', content: SYSTEM }, { role: 'user', content: prompt }],
      temperature: 0.2,
      max_tokens: 900,
    }),
  });
  if (!res.ok) throw new Error(`${res.status} ${(await res.text()).slice(0, 200)}`);
  const json = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
    citations?: string[];
  };
  return {
    text: json.choices?.[0]?.message?.content ?? '',
    citations: json.citations ?? [],
  };
}

async function askAnthropic(apiKey: string, model: string, prompt: string) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model,
      max_tokens: 900,
      system: SYSTEM,
      messages: [{ role: 'user', content: prompt }],
    }),
  });
  if (!res.ok) throw new Error(`${res.status} ${(await res.text()).slice(0, 200)}`);
  const json = (await res.json()) as { content?: Array<{ type: string; text?: string }> };
  return {
    text: (json.content ?? []).filter((b) => b.type === 'text').map((b) => b.text ?? '').join('\n'),
    citations: [] as string[],
  };
}

async function askGemini(apiKey: string, model: string, prompt: string) {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: SYSTEM }] },
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
      }),
    },
  );
  if (!res.ok) throw new Error(`${res.status} ${(await res.text()).slice(0, 200)}`);
  const json = (await res.json()) as {
    candidates?: Array<{
      content?: { parts?: Array<{ text?: string }> };
      groundingMetadata?: { groundingChunks?: Array<{ web?: { uri?: string } }> };
    }>;
  };
  const cand = json.candidates?.[0];
  return {
    text: (cand?.content?.parts ?? []).map((p) => p.text ?? '').join(''),
    citations: (cand?.groundingMetadata?.groundingChunks ?? [])
      .map((c) => c.web?.uri).filter((u): u is string => !!u),
  };
}

/**
 * Ask one engine one question.
 *
 * Never throws: a live call that fails falls back to simulation and reports
 * the error, so a scheduled run of 300 prompts always completes.
 */
export async function ask(input: AskInput): Promise<AskResult> {
  const engine = getEngine(input.engine);
  if (!engine) return { ...simulate(input), error: `Unknown engine "${input.engine}"` };

  const apiKey = process.env[engine.envKey];
  if (!apiKey) return simulate(input);

  const started = Date.now();
  try {
    let out: { text: string; citations: string[] };

    switch (engine.id) {
      case 'chatgpt':
        out = await askOpenAiCompatible('https://api.openai.com/v1/chat/completions', apiKey, engine.model, input.prompt);
        break;
      case 'perplexity':
        out = await askOpenAiCompatible('https://api.perplexity.ai/chat/completions', apiKey, engine.model, input.prompt);
        break;
      case 'grok':
        out = await askOpenAiCompatible('https://api.x.ai/v1/chat/completions', apiKey, engine.model, input.prompt);
        break;
      case 'claude':
        out = await askAnthropic(apiKey, engine.model, input.prompt);
        break;
      case 'gemini':
      case 'google-ai-mode':
        out = await askGemini(apiKey, engine.id === 'gemini' ? engine.model : 'gemini-2.0-flash', input.prompt);
        break;
      default:
        return simulate(input);
    }

    if (!out.text.trim()) throw new Error('Empty response');

    return {
      answer: out.text,
      citations: out.citations,
      simulated: false,
      model: engine.model,
      latencyMs: Date.now() - started,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown provider error';
    return { ...simulate(input), error: `Live call failed, simulated instead: ${message}` };
  }
}

/** Ask every engine the same question, in parallel. */
export async function askAll(input: Omit<AskInput, 'engine'>): Promise<Record<EngineId, AskResult>> {
  const results = await Promise.all(
    ENGINES.map(async (e) => [e.id, await ask({ ...input, engine: e.id })] as const),
  );
  return Object.fromEntries(results) as Record<EngineId, AskResult>;
}
