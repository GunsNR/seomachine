import 'server-only';
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { db } from './db';

const PREFIX = 'rlst';

/**
 * Project API keys, used by the WordPress plugin.
 *
 * The plaintext key is shown once at creation and never stored; only a SHA-256
 * digest is persisted. Keys are high-entropy random bytes, so a fast digest is
 * appropriate here — unlike a password, there is nothing to brute-force.
 */
export function generateKey(): { plaintext: string; prefix: string; hashed: string } {
  const body = randomBytes(24).toString('base64url');
  const plaintext = `${PREFIX}_${body}`;
  return { plaintext, prefix: plaintext.slice(0, 12), hashed: hashKey(plaintext) };
}

export function hashKey(plaintext: string): string {
  return createHash('sha256').update(plaintext).digest('hex');
}

/** Constant-time comparison of two hex digests. */
function digestsMatch(a: string, b: string): boolean {
  const bufA = Buffer.from(a, 'hex');
  const bufB = Buffer.from(b, 'hex');
  if (bufA.length !== bufB.length || bufA.length === 0) return false;
  return timingSafeEqual(bufA, bufB);
}

/** Resolve a presented key to its project, or null. Updates lastUsedAt. */
export async function authenticateApiKey(presented: string) {
  const trimmed = presented.trim();
  if (!trimmed.startsWith(`${PREFIX}_`) || trimmed.length < 20) return null;

  const digest = hashKey(trimmed);
  // Narrow by prefix first so this is an indexed lookup, not a table scan.
  const candidates = await db.apiKey.findMany({
    where: { prefix: trimmed.slice(0, 12) },
    include: { project: true },
  });

  const match = candidates.find((c) => digestsMatch(c.hashedKey, digest));
  if (!match) return null;

  await db.apiKey.update({ where: { id: match.id }, data: { lastUsedAt: new Date() } });
  return match.project;
}
