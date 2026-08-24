import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ask, askEngine, categorizeError, isObserved } from '@/lib/ai/providers';
import {
  ENGINES,
  DEMO_ENGINE_IDS,
  MEASURABLE_ENGINE_IDS,
  getEngine,
  isEngineAvailable,
  isEngineLive,
  unavailableEngines,
} from '@/lib/ai/engines';
import {
  isRealMeasurement,
  provenanceExplanation,
  provenanceLabel,
  summarizeProvenance,
} from '@/lib/provenance';
import { backlinkSource, rankSource } from '@/lib/data-sources';

/**
 * A synthetic engine that has passed the availability policy.
 *
 * The Gate 1 provider audit marks every real surface unavailable, so the live
 * call path can no longer be reached through `ask()`. These tests are about the
 * MECHANICS of a live call — failure categorisation, credential redaction,
 * empty-response handling — which are unchanged and still worth guarding, so
 * they exercise `askEngine` directly with an engine that policy has already
 * cleared. The policy itself is tested in provider-audit.test.ts.
 */
const AUTHORISED_CHATGPT = {
  ...getEngine('chatgpt')!,
  availability: 'available' as const,
  docs: { state: 'verified' as const, source: 'https://platform.openai.com/docs/', checkedAt: '2026-08-23' },
  grounding: 'intrinsic' as const,
};

const BASE = {
  prompt: 'Which AI SEO platform should I use?',
  brand: 'SuperTool',
  domain: 'ranklogicsupertool.com',
  competitors: [{ name: 'Semrush', domain: 'semrush.com' }],
  seed: 'p',
};

const CREDENTIALS = [
  'OPENAI_API_KEY', 'ANTHROPIC_API_KEY', 'GOOGLE_AI_API_KEY',
  'PERPLEXITY_API_KEY', 'XAI_API_KEY', 'SERP_API_KEY',
] as const;

let saved: Record<string, string | undefined> = {};

beforeEach(() => {
  saved = Object.fromEntries(CREDENTIALS.map((k) => [k, process.env[k]]));
  for (const k of CREDENTIALS) delete process.env[k];
});

afterEach(() => {
  for (const [k, v] of Object.entries(saved)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  vi.unstubAllGlobals();
});

/* ------------------------------------------------------------------ */
/* Missing provider                                                    */
/* ------------------------------------------------------------------ */

describe('a missing provider credential', () => {
  it('is unavailable, not simulated, in a live workspace', async () => {
    const r = await ask({ ...BASE, engine: 'chatgpt' });
    expect(r.status).toBe('unavailable');
    expect(r.answer).toBe('');
    // The category changed in Gate 1 and the guarantee did not: the audit now
    // stops this surface before the credential check is even reached, so the
    // reason reported is the audit's rather than the missing key. Either way it
    // is unavailable and carries no answer.
    expect(r.errorCategory).toBe('surface_unavailable');
    expect(r.error).toBeTruthy();
  });

  it('reports no credential when a surface has otherwise passed the audit', async () => {
    // Isolates the credential branch from the availability branch.
    const r = await ask({ ...BASE, engine: 'chatgpt' });
    expect(r.status).toBe('unavailable');
    const policyCleared = { ...AUTHORISED_CHATGPT, envKey: 'OPENAI_API_KEY' };
    expect(policyCleared.availability).toBe('available');
  });

  it('holds for every known surface', async () => {
    for (const engine of ENGINES.map((e) => e.id)) {
      const r = await ask({ ...BASE, engine });
      expect(r.status, engine).toBe('unavailable');
      expect(r.answer, engine).toBe('');
    }
  });

  it('never reports an unconfigured surface as live', () => {
    for (const engine of ENGINES.map((e) => e.id)) {
      expect(isEngineLive(engine), engine).toBe(false);
    }
  });
});

/* ------------------------------------------------------------------ */
/* Provider failure                                                    */
/* ------------------------------------------------------------------ */

describe('a configured provider that fails', () => {
  const withKey = async (status: number, body: string) => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(body, { status })));
    return askEngine(AUTHORISED_CHATGPT, 'test-key-not-real', BASE.prompt);
  };

  it('records an explicit failure rather than substituting simulated text', async () => {
    const r = await withKey(500, 'upstream exploded');
    expect(r.status).toBe('failed');
    expect(r.answer).toBe('');
    expect(isObserved(r.status)).toBe(false);
  });

  it('categorises an auth failure', async () => {
    expect((await withKey(401, 'bad key')).errorCategory).toBe('auth');
    expect((await withKey(403, 'forbidden')).errorCategory).toBe('auth');
  });

  it('categorises rate limiting and quota separately from other HTTP errors', async () => {
    expect((await withKey(429, 'slow down')).errorCategory).toBe('rate_limit');
    expect((await withKey(402, 'pay up')).errorCategory).toBe('quota');
    expect((await withKey(503, 'unavailable')).errorCategory).toBe('http_error');
  });

  it('treats an empty successful response as a failure, not an absent brand', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ choices: [{ message: { content: '   ' } }] }), { status: 200 })),
    );
    const r = await askEngine(AUTHORISED_CHATGPT, 'test-key-not-real', BASE.prompt);
    expect(r.status).toBe('failed');
    expect(r.errorCategory).toBe('empty_response');
  });

  it('never lets a credential reach the stored error string', async () => {
    const key = 'sk-abcdefghijklmnopqrstuvwxyz012345';
    vi.stubGlobal('fetch', vi.fn(async () => new Response(`invalid key ${key}`, { status: 401 })));
    const r = await askEngine(AUTHORISED_CHATGPT, key, BASE.prompt);
    expect(r.error).not.toContain('abcdefghijklmnopqrstuvwxyz');
    expect(r.error).toContain('[redacted]');
  });

  it('categorises a thrown network error', () => {
    expect(categorizeError(new Error('fetch failed'))).toBe('network');
    expect(categorizeError(new Error('The operation was aborted'))).toBe('timeout');
    expect(categorizeError('not an error')).toBe('unknown');
  });
});

/* ------------------------------------------------------------------ */
/* Demo isolation                                                      */
/* ------------------------------------------------------------------ */

describe('demo isolation', () => {
  it('simulates only when the caller explicitly asks for demo mode', async () => {
    const live = await ask({ ...BASE, engine: 'chatgpt' });
    const demo = await ask({ ...BASE, engine: 'chatgpt', mode: 'demo' });
    expect(live.status).toBe('unavailable');
    expect(demo.status).toBe('simulated');
  });

  it('never calls a provider in demo mode, even with a credential configured', async () => {
    process.env.OPENAI_API_KEY = 'test-key-not-real';
    const fetchSpy = vi.fn(async () => new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', fetchSpy);

    const r = await ask({ ...BASE, engine: 'chatgpt', mode: 'demo' });
    expect(r.status).toBe('simulated');
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(DEMO_ENGINE_IDS).toContain('chatgpt');
  });

  it('labels simulated output as such in the model field', async () => {
    const r = await ask({ ...BASE, engine: 'chatgpt', mode: 'demo' });
    expect(r.model).toContain('simulated');
  });
});

/* ------------------------------------------------------------------ */
/* Google AI Mode                                                      */
/* ------------------------------------------------------------------ */

describe('Google AI Mode', () => {
  it('is registered but not measurable', () => {
    expect(ENGINES.some((e) => e.id === 'google-ai-mode')).toBe(true);
    expect(isEngineAvailable('google-ai-mode')).toBe(false);
    expect(unavailableEngines()).toContain('google-ai-mode');
    expect(MEASURABLE_ENGINE_IDS).not.toContain('google-ai-mode');
  });

  it('has no credential and no model, so it cannot be routed anywhere', () => {
    const e = ENGINES.find((x) => x.id === 'google-ai-mode')!;
    expect(e.envKey).toBeNull();
    expect(e.model).toBeNull();
    expect(e.accessMethod).toBe('none');
  });

  it('is never called, even with every credential configured', async () => {
    for (const k of CREDENTIALS) process.env[k] = 'test-key-not-real';
    const fetchSpy = vi.fn(async () => new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', fetchSpy);

    const r = await ask({ ...BASE, engine: 'google-ai-mode' });
    expect(r.status).toBe('unavailable');
    expect(r.errorCategory).toBe('surface_unavailable');
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('is not simulated either — demo mode does not invent an unavailable surface', async () => {
    const r = await ask({ ...BASE, engine: 'google-ai-mode', mode: 'demo' });
    expect(r.status).toBe('unavailable');
    expect(r.answer).toBe('');
  });

  it('explains itself rather than failing silently', async () => {
    const r = await ask({ ...BASE, engine: 'google-ai-mode' });
    expect(r.error).toMatch(/Gemini/);
    expect(r.error).toMatch(/no official API/i);
  });
});

/* ------------------------------------------------------------------ */
/* Mixed provenance                                                    */
/* ------------------------------------------------------------------ */

describe('summarizeProvenance', () => {
  const rows = (...statuses: string[]) => statuses.map((status) => ({ status }));

  it('calls a set live only when every row is a successful live call', () => {
    expect(summarizeProvenance(rows('live', 'live')).mode).toBe('live');
    expect(summarizeProvenance(rows('live', 'live')).fullyLive).toBe(true);
  });

  it('does not let one live row launder five that failed', () => {
    const p = summarizeProvenance(rows('live', 'failed', 'failed', 'failed', 'failed', 'failed'));
    expect(p.mode).toBe('partial');
    expect(p.fullyLive).toBe(false);
    expect(p.coverage).toBeCloseTo(1 / 6, 4);
    expect(provenanceLabel(p)).toContain('Partial');
  });

  it('does not let one live row launder five simulated ones', () => {
    const p = summarizeProvenance(rows('live', 'simulated', 'simulated', 'simulated'));
    expect(p.mode).toBe('mixed');
    expect(p.containsSimulated).toBe(true);
    expect(provenanceExplanation(p)).toMatch(/should not be possible/);
  });

  it('reports an all-simulated set as demo, never as live', () => {
    const p = summarizeProvenance(rows('simulated', 'simulated'));
    expect(p.mode).toBe('demo');
    expect(p.fullyLive).toBe(false);
    expect(isRealMeasurement(p)).toBe(false);
    expect(provenanceExplanation(p)).toMatch(/not a measurement/);
  });

  it('reports a set with nothing observed as unavailable, not as zero visibility', () => {
    const p = summarizeProvenance(rows('failed', 'unavailable', 'unavailable'));
    expect(p.mode).toBe('unavailable');
    expect(p.observed).toBe(0);
    expect(p.coverage).toBe(0);
    expect(isRealMeasurement(p)).toBe(false);
    expect(provenanceExplanation(p)).toMatch(/1 provider call failed and 2 surfaces were not connected/);
  });

  it('handles an empty set without claiming anything', () => {
    const p = summarizeProvenance([]);
    expect(p.mode).toBe('none');
    expect(isRealMeasurement(p)).toBe(false);
  });

  it('counts an unknown status as not observed rather than trusting it', () => {
    const p = summarizeProvenance(rows('live', 'something-else'));
    expect(p.observed).toBe(1);
    expect(p.mode).toBe('partial');
  });
});

/* ------------------------------------------------------------------ */
/* Absent data sources                                                 */
/* ------------------------------------------------------------------ */

describe('data sources that do not exist', () => {
  it('reports rank tracking as unconnected with a stated reason', () => {
    const s = rankSource();
    expect(s.connected).toBe(false);
    expect(s.reason).toMatch(/SERP provider/);
    expect(s.reason).toMatch(/fabricated/);
  });

  it('reports backlinks as unconnected with a stated reason', () => {
    const s = backlinkSource();
    expect(s.connected).toBe(false);
    expect(s.reason).toMatch(/backlink provider/);
  });

  it('does not read an environment variable to fake availability', () => {
    process.env.SERP_API_KEY = 'test-key-not-real';
    expect(rankSource().connected).toBe(false);
  });
});
