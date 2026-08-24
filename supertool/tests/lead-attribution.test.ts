import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Referral attribution can no longer be asserted by the caller.
 *
 * The endpoint used to accept an `engine` field and honour it whenever it named
 * one of the six known engines. The doc comment claimed "a forged field cannot
 * invent a channel" — it could, for exactly the six values that mattered. The
 * API key that authorises this call lives in a WordPress settings screen on a
 * machine we do not control, so anyone holding it could mint AI-sourced leads
 * that never happened.
 *
 * Engine is now always derived from a referrer, and where that referrer came
 * from is recorded next to the conclusion. This closes a forgery hole; it does
 * **not** make attribution trustworthy. `lead_attribution` stays `demo_only`.
 */

const created: Array<Record<string, unknown>> = [];

const lead = {
  create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
    created.push(data);
    return { id: `lead_${created.length}` };
  }),
};

const apiKey = {
  findMany: vi.fn(async () => [] as unknown[]),
  update: vi.fn(async () => ({})),
};

vi.mock('@/lib/api-auth', () => ({
  requireApiKey: vi.fn(async () => ({
    project: { id: 'proj_1', orgId: 'org_1', name: 'Test', domain: 'test.example' },
    keyId: 'key_1',
    scopes: ['lead:write'],
    response: null,
  })),
  corsPreflight: vi.fn(async () => new Response(null, { status: 204 })),
  corsHeaders: vi.fn(async () => ({})),
}));

vi.mock('@/lib/db', () => ({ db: { lead, apiKey } }));

const { POST } = await import('@/app/api/v1/wordpress/lead/route');

function post(body: Record<string, unknown>, headers: Record<string, string> = {}) {
  return new Request('https://api.test/api/v1/wordpress/lead', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  created.length = 0;
  lead.create.mockClear();
});

describe('a caller cannot assert the channel', () => {
  it('ignores a forged engine field entirely', async () => {
    const res = await POST(post({ engine: 'chatgpt', email: 'a@example.com' }));
    expect(res.status).toBe(200);

    // No referrer anywhere, so there is no evidence of any engine.
    expect(created[0].engine).toBe('');
    expect(created[0].source).toBe('direct');
    expect(created[0].attributionVerified).toBe(false);
  });

  it('ignores a forged engine even when a referrer contradicts it', async () => {
    const res = await POST(
      post({ engine: 'chatgpt' }, { referer: 'https://www.perplexity.ai/search?q=x' }),
    );
    const body = await res.json();
    // Derived from the evidence, not from the claim.
    expect(body.engine).toBe('perplexity');
  });

  it('does not let a forged engine survive as a bare source label', async () => {
    await POST(post({ engine: 'grok' }));
    expect(created[0].source).not.toBe('ai');
  });
});

describe('evidence provenance is recorded, not flattened', () => {
  it('marks a header-derived attribution as verified', async () => {
    await POST(post({}, { referer: 'https://chatgpt.com/c/abc' }));
    expect(created[0].engine).toBe('chatgpt');
    expect(created[0].referrerSource).toBe('header');
    expect(created[0].attributionVerified).toBe(true);
  });

  it('marks a body-supplied referrer as unverified', async () => {
    // Still recorded — it is the only signal available for a server-side call —
    // but never as the same grade of evidence as the browser's own header.
    await POST(post({ referrer: 'https://chatgpt.com/c/abc' }));
    expect(created[0].engine).toBe('chatgpt');
    expect(created[0].referrerSource).toBe('body');
    expect(created[0].attributionVerified).toBe(false);
  });

  it('prefers the header when both are present and disagree', async () => {
    await POST(
      post({ referrer: 'https://claude.ai/chat/1' }, { referer: 'https://www.perplexity.ai/x' }),
    );
    expect(created[0].engine).toBe('perplexity');
    expect(created[0].attributionVerified).toBe(true);
  });

  it('records no referrer at all as none', async () => {
    await POST(post({ email: 'a@example.com' }));
    expect(created[0].referrerSource).toBe('none');
  });

  it('reports the verification state back to the caller', async () => {
    const body = await (await POST(post({}, { referer: 'https://chatgpt.com/c/1' }))).json();
    // So an integrator can see we did not simply believe them.
    expect(body.attributionVerified).toBe(true);
  });
});

describe('non-engine traffic', () => {
  it('classifies an ordinary referrer as organic, not ai', async () => {
    await POST(post({}, { referer: 'https://www.google.com/search?q=seo' }));
    expect(created[0].engine).toBe('');
    expect(created[0].source).toBe('organic');
  });

  it('classifies no referrer as direct', async () => {
    await POST(post({}));
    expect(created[0].source).toBe('direct');
  });

  it('never invents an engine for an unrecognised referrer', async () => {
    await POST(post({}, { referer: 'https://some-blog.example/post' }));
    expect(created[0].engine).toBe('');
    expect(created[0].attributionVerified).toBe(false);
  });
});

describe('input validation', () => {
  it('rejects a malformed payload', async () => {
    const res = await POST(
      new Request('https://api.test/api/v1/wordpress/lead', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: 'not json',
      }),
    );
    expect(res.status).toBe(400);
    expect(lead.create).not.toHaveBeenCalled();
  });

  it('rejects an invalid email rather than storing it', async () => {
    const res = await POST(post({ email: 'not-an-email' }));
    expect(res.status).toBe(400);
  });
});
