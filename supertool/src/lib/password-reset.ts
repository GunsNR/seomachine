import 'server-only';
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { db } from './db';

/**
 * Password reset tokens.
 *
 * The token is high-entropy random bytes sent only in the email; the database
 * holds just a SHA-256 digest, so a database leak yields no working reset
 * links. Tokens are single-use and expire in an hour.
 */

const TTL_MS = 60 * 60 * 1000;

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/** Issues a token, invalidating any outstanding ones for the same user. */
export async function issueResetToken(userId: string): Promise<string> {
  const token = randomBytes(32).toString('base64url');

  // A new request should retire earlier links, so a forwarded old email
  // cannot still be used.
  await db.passwordResetToken.updateMany({
    where: { userId, usedAt: null },
    data: { usedAt: new Date() },
  });

  await db.passwordResetToken.create({
    data: {
      userId,
      tokenHash: hashToken(token),
      expiresAt: new Date(Date.now() + TTL_MS),
    },
  });

  return token;
}

export interface TokenCheck {
  valid: boolean;
  userId?: string;
  reason?: 'not-found' | 'expired' | 'used';
}

/** Validates a presented token without consuming it. */
export async function checkResetToken(token: string): Promise<TokenCheck> {
  if (!token || token.length < 20) return { valid: false, reason: 'not-found' };

  const record = await db.passwordResetToken.findUnique({
    where: { tokenHash: hashToken(token) },
  });
  if (!record) return { valid: false, reason: 'not-found' };

  // Constant-time compare of the digests, for consistency with how other
  // secrets in this codebase are checked.
  const a = Buffer.from(record.tokenHash, 'hex');
  const b = Buffer.from(hashToken(token), 'hex');
  if (a.length !== b.length || !timingSafeEqual(a, b)) return { valid: false, reason: 'not-found' };

  if (record.usedAt) return { valid: false, reason: 'used' };
  if (record.expiresAt.getTime() < Date.now()) return { valid: false, reason: 'expired' };

  return { valid: true, userId: record.userId };
}

/** Marks a token spent. Call inside the same transaction as the password write. */
export async function consumeResetToken(token: string): Promise<void> {
  await db.passwordResetToken.updateMany({
    where: { tokenHash: hashToken(token), usedAt: null },
    data: { usedAt: new Date() },
  });
}

/** Housekeeping: drop tokens that can no longer be used. */
export async function pruneExpiredTokens(): Promise<number> {
  const result = await db.passwordResetToken.deleteMany({
    where: { expiresAt: { lt: new Date(Date.now() - 86_400_000) } },
  });
  return result.count;
}

export function reasonMessage(reason: TokenCheck['reason']): string {
  if (reason === 'expired') return 'That reset link has expired. Request a new one.';
  if (reason === 'used') return 'That reset link has already been used. Request a new one.';
  return 'That reset link is not valid. Request a new one.';
}
