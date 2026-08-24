/**
 * Answer-surface adapters.
 *
 * Every call returns an explicit status. There is no silent fallback: a live
 * call that fails is recorded as `failed` with an error category, a surface
 * with no credential is `unavailable`, and simulated text is produced *only*
 * for a workspace explicitly running in demo mode. A customer workspace can
 * therefore never be handed a plausible-looking simulated answer in place of a
 * real one, and a run with mixed outcomes can never be summarised as live.
 */
import { getEngine, type Engine, type EngineId } from './engines';

/** Provenance of a single observation. */
export type CheckStatus =
  /** A real provider call succeeded. */
  | 'live'
  /** Deterministic sample text, produced only in an explicit demo workspace. */
  | 'simulated'
  /** A real provider call was attempted and did not succeed. */
  | 'failed'
  /** No call was attempted: no compliant source, or no credential. */
  | 'unavailable';

/** Why a call could not produce an observation. '' when it did. */
export type ErrorCategory =
  | ''
  | 'auth'
  | 'rate_limit'
  | 'quota'
  | 'timeout'
  | 'network'
  | 'empty_response'
  | 'http_error'
  | 'no_credential'
  | 'surface_unavailable'
  | 'unsupported_engine'
  | 'unknown';

/** Whether a workspace is measuring reality or showing sample data. */
export type DataMode = 'live' | 'demo';

export interface AskResult {
  status: CheckStatus;
  /** Empty string whenever status is `failed` or `unavailable`. */
  answer: string;
  citations: string[];
  /** Exact model asked, or '' when no call was made. */
  model: string;
  /**
   * The model identifier the provider said it used. Empty when the provider
   * does not return one — never inferred from the request, because a silent
   * model substitution is exactly what this field exists to catch.
   */
  modelReturned: string;
  /** Whether the request enabled the vendor's web-retrieval tool. */
  groundingRequested: boolean;
  /** Whether the response actually carried retrieval evidence. */
  groundingConfirmed: boolean;
  /** 0 means "not reported by the provider", not "none used". */
  inputTokens: number;
  outputTokens: number;
  latencyMs: number;
  errorCategory: ErrorCategory;
  /** Operator-facing detail. Never contains a credential. */
  error?: string;
}

export interface AskInput {
  prompt: string;
  engine: EngineId;
  brand: string;
  domain: string;
  competitors: Array<{ name?: string; domain: string }>;
  /** Stable seed component so a demo workspace reproduces exactly. */
  seed?: string;
  /**
   * `live` (the default) never simulates. `demo` always simulates and never
   * spends a provider credit — the two paths are mutually exclusive on
   * purpose, so demo data cannot leak into a real measurement or vice versa.
   */
  mode?: DataMode;
}

/** True when this observation carries an answer that can be analysed. */
export function isObserved(status: CheckStatus): boolean {
  return status === 'live' || status === 'simulated';
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
/* Simulation — demo workspaces and tests only                         */
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
 * Sample bias per surface. These are arbitrary shape parameters for demo text,
 * not measured behaviour of any assistant, and nothing derived from them is
 * ever presented as a finding.
 */
const ENGINE_BIAS: Record<string, { mention: number; cite: number }> = {
  chatgpt: { mention: 0.62, cite: 0.42 },
  perplexity: { mention: 0.74, cite: 0.68 },
  claude: { mention: 0.52, cite: 0.34 },
  gemini: { mention: 0.58, cite: 0.45 },
  grok: { mention: 0.55, cite: 0.3 },
};

const NEUTRAL_SOURCES = [
  'https://www.g2.com/categories/seo-tools',
  'https://www.capterra.com/seo-software/',
  'https://searchengineland.com/guide/generative-engine-optimization',
  'https://www.semrush.com/blog/ai-search-visibility/',
  'https://en.wikipedia.org/wiki/Search_engine_optimization',
];

export function simulate(input: AskInput): AskResult {
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
    status: 'simulated',
    answer: lines.join('\n'),
    citations,
    model: `${getEngine(engine)?.model ?? engine} (simulated sample)`,
    modelReturned: '',
    groundingRequested: false,
    groundingConfirmed: false,
    inputTokens: 0,
    outputTokens: 0,
    latencyMs: Math.round(300 + rng() * 900),
    errorCategory: '',
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

/** Carries the HTTP status so the failure can be categorised honestly. */
class ProviderError extends Error {
  constructor(message: string, readonly httpStatus?: number) {
    super(message);
    this.name = 'ProviderError';
  }
}

/** Never let a credential reach a stored error string or a log line. */
function redact(text: string): string {
  return text
    .replace(/([?&]key=)[^&\s]+/gi, '$1[redacted]')
    .replace(/\b(sk|pplx|xai|AIza)[-_A-Za-z0-9]{12,}/g, '[redacted]');
}

export function categorizeError(err: unknown): ErrorCategory {
  if (err instanceof ProviderError && err.httpStatus) {
    const s = err.httpStatus;
    if (s === 401 || s === 403) return 'auth';
    if (s === 429) return 'rate_limit';
    if (s === 402) return 'quota';
    if (s === 408 || s === 504) return 'timeout';
    return 'http_error';
  }
  const message = err instanceof Error ? err.message.toLowerCase() : '';
  if (message.includes('empty response')) return 'empty_response';
  if (message.includes('abort') || message.includes('timeout')) return 'timeout';
  if (message.includes('fetch') || message.includes('network') || message.includes('econn')) return 'network';
  return 'unknown';
}

async function readError(res: Response): Promise<never> {
  const body = await res.text().catch(() => '');
  throw new ProviderError(`${res.status} ${redact(body).slice(0, 200)}`, res.status);
}

/**
 * What every adapter returns.
 *
 * `modelReturned`, token counts and `groundedEvidence` are optional because not
 * every provider reports them. Absent means absent — never substituted with the
 * requested value or with a zero that would read as a measurement.
 */
export interface ProviderResponse {
  text: string;
  citations: string[];
  modelReturned?: string;
  inputTokens?: number;
  outputTokens?: number;
  /** Retrieval evidence in the response beyond the citation list. */
  groundedEvidence?: boolean;
}

async function askOpenAiCompatible(
  url: string,
  apiKey: string,
  model: string,
  prompt: string,
  extraHeaders: Record<string, string> = {},
): Promise<ProviderResponse> {
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
  if (!res.ok) await readError(res);
  const json = (await res.json()) as {
    model?: string;
    choices?: Array<{ message?: { content?: string } }>;
    citations?: string[];
    usage?: { prompt_tokens?: number; completion_tokens?: number };
  };
  return {
    text: json.choices?.[0]?.message?.content ?? '',
    citations: json.citations ?? [],
    modelReturned: json.model ?? '',
    inputTokens: json.usage?.prompt_tokens ?? 0,
    outputTokens: json.usage?.completion_tokens ?? 0,
  };
}

async function askAnthropic(apiKey: string, model: string, prompt: string): Promise<ProviderResponse> {
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
  if (!res.ok) await readError(res);
  const json = (await res.json()) as {
    model?: string;
    content?: Array<{ type: string; text?: string }>;
    usage?: { input_tokens?: number; output_tokens?: number };
  };
  return {
    text: (json.content ?? []).filter((b) => b.type === 'text').map((b) => b.text ?? '').join('\n'),
    // No web search tool is passed, so no citations can come back. This empty
    // array means "we never searched", not "the search found nothing".
    citations: [] as string[],
    modelReturned: json.model ?? '',
    inputTokens: json.usage?.input_tokens ?? 0,
    outputTokens: json.usage?.output_tokens ?? 0,
  };
}

async function askGemini(apiKey: string, model: string, prompt: string): Promise<ProviderResponse> {
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
  if (!res.ok) await readError(res);
  const json = (await res.json()) as {
    modelVersion?: string;
    candidates?: Array<{
      content?: { parts?: Array<{ text?: string }> };
      groundingMetadata?: { groundingChunks?: Array<{ web?: { uri?: string } }> };
    }>;
    usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
  };
  const cand = json.candidates?.[0];
  const chunks = cand?.groundingMetadata?.groundingChunks ?? [];
  return {
    text: (cand?.content?.parts ?? []).map((p) => p.text ?? '').join(''),
    // No google_search tool is requested, so groundingMetadata is always empty.
    // Parsing it anyway is harmless; treating the empty result as "no citations
    // found" would not be, which is why the engine is marked unavailable.
    citations: chunks.map((c) => c.web?.uri).filter((u): u is string => !!u),
    modelReturned: json.modelVersion ?? '',
    inputTokens: json.usageMetadata?.promptTokenCount ?? 0,
    outputTokens: json.usageMetadata?.candidatesTokenCount ?? 0,
    groundedEvidence: chunks.length > 0,
  };
}

function notObserved(
  status: 'failed' | 'unavailable',
  errorCategory: ErrorCategory,
  error: string,
  latencyMs = 0,
): AskResult {
  return {
    status,
    answer: '',
    citations: [],
    model: '',
    modelReturned: '',
    groundingRequested: false,
    groundingConfirmed: false,
    inputTokens: 0,
    outputTokens: 0,
    latencyMs,
    errorCategory,
    error,
  };
}

/**
 * Ask one surface one question.
 *
 * Never throws, and never substitutes one kind of answer for another. The four
 * outcomes are distinct and all of them are recordable.
 */
/**
 * Execute one live provider call against an already-authorised engine.
 *
 * Split out from `ask()` so that policy — which surfaces this product is
 * willing to call at all — is separate from mechanics. `ask()` owns the policy;
 * this owns the request, the response parsing and the honest failure
 * categorisation. Tests exercise the mechanics here without having to defeat
 * the policy, which must stay strict.
 */
export async function askEngine(
  engine: Engine,
  apiKey: string,
  prompt: string,
): Promise<AskResult> {
  const surface = engine.name;
  const model = engine.model;

  if (!model) {
    return notObserved('unavailable', 'surface_unavailable', `${surface} has no model configured.`);
  }

  // Known with certainty from the adapter code, not guessed: 'intrinsic' means
  // the model retrieves as part of answering, 'enabled' means we pass a tool.
  const groundingRequested = engine.grounding === 'enabled' || engine.grounding === 'intrinsic';

  const started = Date.now();
  try {
    let out: ProviderResponse;

    switch (engine.id) {
      case 'chatgpt':
        out = await askOpenAiCompatible('https://api.openai.com/v1/chat/completions', apiKey, model, prompt);
        break;
      case 'perplexity':
        out = await askOpenAiCompatible('https://api.perplexity.ai/chat/completions', apiKey, model, prompt);
        break;
      case 'grok':
        out = await askOpenAiCompatible('https://api.x.ai/v1/chat/completions', apiKey, model, prompt);
        break;
      case 'claude':
        out = await askAnthropic(apiKey, model, prompt);
        break;
      case 'gemini':
        out = await askGemini(apiKey, model, prompt);
        break;
      default:
        return notObserved(
          'unavailable',
          'unsupported_engine',
          `${surface} has no adapter wired up.`,
        );
    }

    if (!out.text.trim()) throw new ProviderError('Empty response');

    return {
      status: 'live',
      answer: out.text,
      citations: out.citations,
      model,
      modelReturned: out.modelReturned ?? '',
      groundingRequested,
      // Evidence of retrieval in the response itself, not an assumption.
      groundingConfirmed: groundingRequested && (out.citations.length > 0 || out.groundedEvidence === true),
      inputTokens: out.inputTokens ?? 0,
      outputTokens: out.outputTokens ?? 0,
      latencyMs: Date.now() - started,
      errorCategory: '',
    };
  } catch (err) {
    const message = err instanceof Error ? redact(err.message) : 'Unknown provider error';
    return notObserved('failed', categorizeError(err), `${surface} call failed: ${message}`, Date.now() - started);
  }
}

/**
 * Ask one surface one question.
 *
 * Never throws, and never substitutes one kind of answer for another. The four
 * outcomes are distinct and all of them are recordable.
 */
export async function ask(input: AskInput): Promise<AskResult> {
  const engine = getEngine(input.engine);
  if (!engine) {
    return notObserved('unavailable', 'unsupported_engine', `Unknown answer surface "${input.engine}".`);
  }

  const surface = engine.name;

  // A demo workspace never spends a provider credit and never touches a live
  // endpoint, so demo rows and real rows can never be confused for each other.
  //
  // Demo text is allowed for a surface whose adapter is merely unfinished,
  // because it is labelled sample data and is never a measurement. It is NOT
  // allowed for a surface with no public API at all — simulating that would
  // fabricate a product capability rather than demonstrate a screen.
  if (input.mode === 'demo') {
    if (!engine.simulatableInDemo) {
      return notObserved(
        'unavailable',
        'surface_unavailable',
        engine.unavailableReason ?? `${surface} has no compliant source and is not measured.`,
      );
    }
    return simulate(input);
  }

  // Policy gate. An unavailable surface is never called, whatever credentials
  // are present, and the reason travels with the observation.
  if (engine.availability !== 'available') {
    return notObserved(
      'unavailable',
      'surface_unavailable',
      engine.unavailableReason ?? `${surface} has no compliant source and is not measured.`,
    );
  }

  const apiKey = engine.envKey ? process.env[engine.envKey] : undefined;
  if (!apiKey) {
    return notObserved(
      'unavailable',
      'no_credential',
      `${surface} is not measured because ${engine.envKey} is not configured.`,
    );
  }

  return askEngine(engine, apiKey, input.prompt);
}

/**
 * Ask every registered surface the same question, in parallel.
 *
 * Unavailable surfaces are included in the result so the caller can report
 * them honestly as gaps rather than omitting them, but they never produce an
 * answer.
 */
export async function askAll(input: Omit<AskInput, 'engine'>): Promise<Record<EngineId, AskResult>> {
  const { ENGINES } = await import('./engines');
  const results = await Promise.all(
    ENGINES.map(async (e) => [e.id, await ask({ ...input, engine: e.id })] as const),
  );
  return Object.fromEntries(results) as Record<EngineId, AskResult>;
}
