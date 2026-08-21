import { describe, expect, it } from 'vitest';
import { hashToken, reasonMessage } from '@/lib/password-reset';

describe('hashToken', () => {
  it('is deterministic', () => {
    expect(hashToken('abc')).toBe(hashToken('abc'));
  });

  it('never returns the token itself', () => {
    // Only the digest is stored, so a database leak yields no working links.
    const token = 'a-real-looking-reset-token-value';
    expect(hashToken(token)).not.toContain(token);
  });

  it('produces a 64-character hex digest', () => {
    expect(hashToken('x')).toMatch(/^[0-9a-f]{64}$/);
  });

  it('differs for different tokens', () => {
    expect(hashToken('one')).not.toBe(hashToken('two'));
  });
});

describe('reasonMessage', () => {
  it('distinguishes expired from used so the user knows what happened', () => {
    expect(reasonMessage('expired')).toMatch(/expired/i);
    expect(reasonMessage('used')).toMatch(/already been used/i);
  });

  it('always tells the user how to recover', () => {
    for (const reason of ['expired', 'used', 'not-found'] as const) {
      expect(reasonMessage(reason)).toMatch(/request a new one/i);
    }
  });
});
