import 'server-only';
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

/**
 * Authenticated encryption for credentials held at rest.
 *
 * WordPress application passwords are reusable write credentials for a
 * customer's site, so they must not sit in the database in plaintext. AES-256-GCM
 * gives confidentiality and integrity, so a tampered ciphertext fails to
 * decrypt rather than silently yielding wrong bytes.
 *
 * The key is derived from ENCRYPTION_KEY, falling back to AUTH_SECRET so a
 * single-secret deployment still works. Rotating either invalidates stored
 * credentials, which then have to be re-entered — a deliberate trade-off
 * against carrying a key-management system.
 */

const ALGORITHM = 'aes-256-gcm';
const IV_BYTES = 12;
const PREFIX = 'v1';

function key(): Buffer {
  const secret = process.env.ENCRYPTION_KEY || process.env.AUTH_SECRET;
  if (!secret) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('ENCRYPTION_KEY or AUTH_SECRET must be set to store credentials.');
    }
    return createHash('sha256').update('dev-only-insecure-encryption-key').digest();
  }
  // SHA-256 gives a uniform 32-byte key from a secret of any length.
  return createHash('sha256').update(secret).digest();
}

/** Returns "v1:<iv>:<tag>:<ciphertext>", all base64url. */
export function encryptSecret(plaintext: string): string {
  if (!plaintext) return '';

  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, key(), iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();

  return [PREFIX, iv.toString('base64url'), tag.toString('base64url'), ciphertext.toString('base64url')].join(':');
}

/**
 * Reverses encryptSecret. Returns '' when the value is empty, malformed, or
 * fails authentication — callers treat that as "no usable credential" rather
 * than crashing a page render.
 */
export function decryptSecret(stored: string): string {
  if (!stored) return '';

  const parts = stored.split(':');
  if (parts.length !== 4 || parts[0] !== PREFIX) return '';

  try {
    const decipher = createDecipheriv(ALGORITHM, key(), Buffer.from(parts[1], 'base64url'));
    decipher.setAuthTag(Buffer.from(parts[2], 'base64url'));
    return Buffer.concat([
      decipher.update(Buffer.from(parts[3], 'base64url')),
      decipher.final(),
    ]).toString('utf8');
  } catch {
    return '';
  }
}

/** True when a stored value is in the encrypted envelope format. */
export function isEncrypted(value: string): boolean {
  return value.startsWith(`${PREFIX}:`) && value.split(':').length === 4;
}

/** Show only the last few characters, for confirming which credential is set. */
export function maskSecret(plaintext: string, visible = 4): string {
  if (!plaintext) return '';
  if (plaintext.length <= visible) return '•'.repeat(plaintext.length);
  return `${'•'.repeat(Math.min(12, plaintext.length - visible))}${plaintext.slice(-visible)}`;
}
