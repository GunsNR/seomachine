import { describe, expect, it } from 'vitest';
import { buildLine, redactString, redactValue, requestId } from '@/lib/observability';

/**
 * Redaction at the logging boundary.
 *
 * A log line is storage. Gate 0 established that a credential never reaches
 * storage, display or export, and a log aggregator has different retention and
 * different access control from the database — so a secret that leaks here
 * leaks further than one that leaks into a row.
 */

describe('redactString', () => {
  it('removes provider key formats', () => {
    for (const key of [
      'sk-abcdefghijklmnopqrstuv',
      'sk_live_abcdefghijklmnop',
      'rlst_AbCdEfGhIjKlMnOpQr',
      'xai-abcdefghijklmnopqrst',
      'pplx-abcdefghijklmnopqrs',
      'whsec_abcdefghijklmnopqr',
    ]) {
      const out = redactString(`provider said: ${key} is invalid`);
      expect(out, key).toContain('[redacted-key]');
      expect(out, key).not.toContain(key);
    }
  });

  it('removes bearer tokens and JWTs', () => {
    expect(redactString('Authorization: Bearer abc123def456ghi')).toContain('Bearer [redacted]');

    const jwt = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U';
    const out = redactString(`token=${jwt}`);
    expect(out).not.toContain('dozjgNryP4J3');
  });

  it('removes credentials from query strings', () => {
    expect(redactString('GET /v1/data?api_key=supersecret&x=1')).not.toContain('supersecret');
    expect(redactString('POST /login?password=hunter2')).not.toContain('hunter2');
  });

  it('removes basic-auth credentials embedded in a URL', () => {
    // A WordPress application password lives in exactly this shape.
    const out = redactString('connecting to https://admin:app-pass-123@site.example/wp-json');
    expect(out).not.toContain('app-pass-123');
    expect(out).toContain('[redacted]@');
  });

  it('leaves ordinary text alone', () => {
    const plain = 'measurement run 4 finished with 12 observations';
    expect(redactString(plain)).toBe(plain);
  });
});

describe('redactValue', () => {
  it('redacts by key name regardless of the value', () => {
    const out = redactValue({ password: 'anything', apiKey: 'x', token: 'y' }) as Record<string, unknown>;
    expect(out.password).toBe('[redacted]');
    expect(out.apiKey).toBe('[redacted]');
    expect(out.token).toBe('[redacted]');
  });

  it('is case-insensitive about key names', () => {
    const out = redactValue({ APIKey: 'x', Password: 'y', AUTHORIZATION: 'z' }) as Record<string, unknown>;
    expect(Object.values(out)).toEqual(['[redacted]', '[redacted]', '[redacted]']);
  });

  it('recurses, because the secret is usually not at the top level', () => {
    const out = redactValue({
      request: { provider: 'openai', headers: { authorization: 'Bearer secret-value' } },
    }) as { request: { headers: { authorization: string } } };
    expect(out.request.headers.authorization).toBe('[redacted]');
  });

  it('redacts inside an Error message and drops the stack', () => {
    const err = new Error('rejected key sk-abcdefghijklmnop');
    const out = redactValue(err) as { name: string; message: string; stack?: string };
    expect(out.message).toContain('[redacted-key]');
    // A stack trace leaks absolute paths and module layout.
    expect(out.stack).toBeUndefined();
  });

  it('stops recursing rather than following a deep or cyclic structure forever', () => {
    let deep: Record<string, unknown> = { value: 'end' };
    for (let i = 0; i < 20; i++) deep = { nested: deep };
    expect(JSON.stringify(redactValue(deep))).toContain('[truncated]');
  });

  it('caps array length so one enormous payload cannot flood the log', () => {
    const out = redactValue(Array.from({ length: 500 }, (_, i) => i)) as unknown[];
    expect(out.length).toBeLessThanOrEqual(50);
  });

  it('passes primitives through untouched', () => {
    expect(redactValue(42)).toBe(42);
    expect(redactValue(true)).toBe(true);
    expect(redactValue(null)).toBe(null);
  });
});

describe('buildLine', () => {
  it('carries level, event and an ISO timestamp', () => {
    const line = buildLine('info', 'run.started', { orgId: 'org_1' });
    expect(line.level).toBe('info');
    expect(line.event).toBe('run.started');
    expect(line.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(line.orgId).toBe('org_1');
  });

  it('redacts fields on the way in, not at the call site', () => {
    // The call site is exactly where someone forgets.
    const line = buildLine('error', 'provider.failed', {
      apiKey: 'sk-abcdefghijklmnop',
      detail: 'Bearer abcdefghijklmno rejected',
    });
    expect(line.apiKey).toBe('[redacted]');
    expect(String(line.detail)).toContain('[redacted]');
  });

  it('serializes to JSON without throwing', () => {
    expect(() => JSON.stringify(buildLine('warn', 'x', { err: new Error('boom') }))).not.toThrow();
  });
});

describe('requestId', () => {
  it('reuses a platform-set id so a trace is not split in two', () => {
    const req = new Request('https://x.test', { headers: { 'x-request-id': 'req-abc' } });
    expect(requestId(req)).toBe('req-abc');
  });

  it('falls back to other known platform headers', () => {
    expect(requestId(new Request('https://x.test', { headers: { 'cf-ray': 'ray-1' } }))).toBe('ray-1');
  });

  it('generates one when nothing upstream provided it', () => {
    const id = requestId(new Request('https://x.test'));
    expect(id).toMatch(/^[0-9a-f-]{36}$/);
  });
});
