import { describe, expect, it } from 'vitest';
import { decryptSecret, encryptSecret, isEncrypted, maskSecret } from '@/lib/crypto';

describe('encryptSecret / decryptSecret', () => {
  it('round-trips a value', () => {
    const secret = 'abcd EFGH 1234 wxyz';
    expect(decryptSecret(encryptSecret(secret))).toBe(secret);
  });

  it('produces different ciphertext each time for the same input', () => {
    // A fresh IV per call, so identical credentials are not linkable in the DB.
    expect(encryptSecret('same')).not.toBe(encryptSecret('same'));
  });

  it('does not leak the plaintext into the envelope', () => {
    expect(encryptSecret('hunter2-application-password')).not.toContain('hunter2');
  });

  it('round-trips unicode and long values', () => {
    const secret = `${'é🔐'.repeat(200)}`;
    expect(decryptSecret(encryptSecret(secret))).toBe(secret);
  });

  it('returns empty for empty input rather than an envelope', () => {
    expect(encryptSecret('')).toBe('');
    expect(decryptSecret('')).toBe('');
  });

  it('refuses a tampered ciphertext instead of returning wrong bytes', () => {
    const envelope = encryptSecret('original value');
    const parts = envelope.split(':');
    // Flip a character in the ciphertext segment.
    parts[3] = parts[3].startsWith('A') ? `B${parts[3].slice(1)}` : `A${parts[3].slice(1)}`;
    expect(decryptSecret(parts.join(':'))).toBe('');
  });

  it('refuses a tampered auth tag', () => {
    const parts = encryptSecret('original value').split(':');
    parts[2] = parts[2].startsWith('A') ? `B${parts[2].slice(1)}` : `A${parts[2].slice(1)}`;
    expect(decryptSecret(parts.join(':'))).toBe('');
  });

  it('returns empty for malformed or legacy plaintext values', () => {
    for (const bad of ['not-an-envelope', 'v1:only:three', 'v2:a:b:c']) {
      expect(decryptSecret(bad)).toBe('');
    }
  });
});

describe('isEncrypted', () => {
  it('recognises the envelope format', () => {
    expect(isEncrypted(encryptSecret('x'))).toBe(true);
  });
  it('rejects a plaintext value', () => {
    expect(isEncrypted('plain-application-password')).toBe(false);
  });
});

describe('maskSecret', () => {
  it('reveals only the tail', () => {
    const masked = maskSecret('abcdefghijklmnop');
    expect(masked.endsWith('mnop')).toBe(true);
    expect(masked).not.toContain('abcdefgh');
  });
  it('fully masks a very short value', () => {
    expect(maskSecret('ab')).toBe('••');
  });
  it('returns empty for empty input', () => {
    expect(maskSecret('')).toBe('');
  });
});
