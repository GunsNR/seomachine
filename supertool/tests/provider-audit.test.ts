import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ENGINES,
  ENGINE_IDS,
  DEMO_ENGINE_IDS,
  MEASURABLE_ENGINE_IDS,
  blockedOnDocsOnly,
  blockedOnGrounding,
  getEngine,
  isEngineAvailable,
  isEngineLive,
  unavailableEngines,
} from '@/lib/ai/engines';
import { ask } from '@/lib/ai/providers';

/**
 * The Gate 1 provider audit, as enforceable assertions.
 *
 * The rule under test: a surface is measurable only when a compliant API
 * exists, the adapter enables that vendor's web retrieval, AND the model has
 * been confirmed against the vendor's own current documentation. Any one of
 * those failing forces `unavailable` with a stated reason.
 *
 * The reason this matters more than it looks: asking an UNGROUNDED model
 * "which SEO tool is best" measures what it absorbed during training, not what
 * a search returns today. Reporting that as AI search visibility is a real
 * number about the wrong thing — the same category of error as answering
 * Google AI Mode with Gemini.
 */

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

describe('every engine states its audit position', () => {
  it('records a grounding status and a documentation verification state', () => {
    for (const e of ENGINES) {
      expect(['enabled', 'intrinsic', 'absent'], e.id).toContain(e.grounding);
      expect(['verified', 'unverified'], e.id).toContain(e.docs.state);
      if (e.docs.state === 'unverified') {
        // An unverified surface must say why, not merely be flagged.
        expect(e.docs.reason.length, e.id).toBeGreaterThan(20);
      }
    }
  });

  it('derives availability rather than letting it be hand-set', () => {
    for (const e of ENGINES) {
      const shouldBeAvailable =
        e.accessMethod === 'official-api' &&
        e.grounding !== 'absent' &&
        e.docs.state === 'verified';
      expect(e.availability === 'available', e.id).toBe(shouldBeAvailable);
    }
  });

  it('gives every unavailable surface a reason a human can act on', () => {
    for (const e of ENGINES) {
      if (e.availability === 'unavailable') {
        expect(e.unavailableReason, e.id).toBeTruthy();
        expect(e.unavailableReason!.length, e.id).toBeGreaterThan(40);
      }
    }
  });
});

describe('ungrounded adapters are not sold as AI search measurement', () => {
  it('marks every adapter that makes a plain completion call unavailable', () => {
    for (const id of blockedOnGrounding()) {
      expect(isEngineAvailable(id), id).toBe(false);
      expect(getEngine(id)!.unavailableReason, id).toMatch(/does not enable web retrieval/i);
    }
  });

  it('identifies the specific adapters that never request retrieval', () => {
    // Determined by reading the adapter code, which needs no network access:
    // none of these four passes a web-search tool or search parameter.
    const ungrounded = blockedOnGrounding();
    expect(ungrounded).toContain('chatgpt');
    expect(ungrounded).toContain('claude');
    expect(ungrounded).toContain('gemini');
    expect(ungrounded).toContain('grok');
  });

  it('does not accuse an intrinsically retrieving surface of being ungrounded', () => {
    expect(blockedOnGrounding()).not.toContain('perplexity');
    expect(getEngine('perplexity')!.grounding).toBe('intrinsic');
  });
});

describe('unverified documentation blocks measurement', () => {
  it('reports which engines are blocked on documentation alone', () => {
    for (const id of blockedOnDocsOnly()) {
      const e = getEngine(id)!;
      expect(e.grounding, id).not.toBe('absent');
      expect(e.docs.state, id).toBe('unverified');
      expect(isEngineAvailable(id), id).toBe(false);
    }
  });

  it('never records a third-party source as documentation verification', () => {
    for (const e of ENGINES) {
      if (e.docs.state === 'verified') {
        // Only a first-party vendor domain counts. A blog post, a search
        // snippet or model recollection is not verification.
        expect(e.docs.source, e.id).toMatch(
          /^https:\/\/([a-z0-9-]+\.)*(openai|anthropic|google|googleapis|x\.ai|perplexity)\.[a-z.]+\//,
        );
      }
    }
  });
});

describe('provider non-substitution', () => {
  it('never routes one product to another vendor endpoint', async () => {
    // Every credential present, so nothing is skipped for lack of a key.
    for (const k of CREDENTIALS) process.env[k] = 'test-key-not-real';
    const fetchSpy = vi.fn(async () => new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', fetchSpy);

    for (const id of ENGINE_IDS) {
      const r = await ask({
        prompt: 'Which AI SEO platform should I use?',
        engine: id,
        brand: 'SuperTool',
        domain: 'example.com',
        competitors: [],
      });
      expect(r.status, id).toBe('unavailable');
      expect(r.answer, id).toBe('');
    }

    // No engine is measurable, so no provider is contacted at all.
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('keeps Google AI Mode unmapped to any other vendor', () => {
    const e = getEngine('google-ai-mode')!;
    expect(e.envKey).toBeNull();
    expect(e.model).toBeNull();
    expect(e.accessMethod).toBe('none');
    expect(e.unavailableReason).toMatch(/Gemini/);
    expect(MEASURABLE_ENGINE_IDS).not.toContain('google-ai-mode');
    // Not even the demo workspace fabricates this surface.
    expect(DEMO_ENGINE_IDS).not.toContain('google-ai-mode');
  });

  it('reports every surface as unavailable while the audit stands', () => {
    expect(MEASURABLE_ENGINE_IDS).toHaveLength(0);
    expect(unavailableEngines()).toHaveLength(ENGINE_IDS.length);
    expect(ENGINE_IDS).toHaveLength(6);
  });

  it('never reports an unavailable surface as live, whatever the credential', () => {
    for (const k of CREDENTIALS) process.env[k] = 'test-key-not-real';
    for (const id of ENGINE_IDS) {
      expect(isEngineLive(id), id).toBe(false);
    }
  });
});

describe('grounding and model provenance on results', () => {
  it('reports grounding as not requested when no call was made', async () => {
    const r = await ask({
      prompt: 'x',
      engine: 'chatgpt',
      brand: 'B',
      domain: 'b.com',
      competitors: [],
    });
    expect(r.groundingRequested).toBe(false);
    expect(r.groundingConfirmed).toBe(false);
    // Never inferred from the request — absent means absent.
    expect(r.modelReturned).toBe('');
    expect(r.inputTokens).toBe(0);
    expect(r.outputTokens).toBe(0);
  });

  it('carries no grounding claim on a demo observation', async () => {
    const r = await ask({
      prompt: 'x',
      engine: 'chatgpt',
      brand: 'B',
      domain: 'b.com',
      competitors: [],
      mode: 'demo',
    });
    expect(r.status).toBe('simulated');
    // Sample text is not a retrieval, and must never claim to be one.
    expect(r.groundingRequested).toBe(false);
    expect(r.groundingConfirmed).toBe(false);
    expect(r.model).toContain('simulated');
  });
});
