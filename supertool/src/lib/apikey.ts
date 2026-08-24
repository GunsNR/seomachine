import 'server-only';
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { db } from './db';

const PREFIX = 'rlst';

/**
 * What a key is allowed to do.
 *
 * Before Phase 2 a key was all-or-nothing: the WordPress plugin needs to read
 * visibility data and post a lead, and the same key could also publish content.
 * A key pasted into a plugin settings screen lives on a machine we do not
 * control, so its blast radius should be the narrowest thing that works.
 */
export type ApiScope =
  | 'visibility:read'
  | 'citations:read'
  | 'lead:write'
  | 'publish:write';

export const API_SCOPES: readonly ApiScope[] = [
  'visibility:read',
  'citations:read',
  'lead:write',
  'publish:write',
] as const;

/**
 * Scopes granted to a key that predates scoping.
 *
 * Read-only plus the lead endpoint the plugin depends on — deliberately NOT
 * `publish:write`. An existing installation keeps working; it does not keep a
 * privilege it may never have needed. A key that genuinely publishes must be
 * reissued, which is the correct amount of friction for granting write access.
 */
export const LEGACY_SCOPES: readonly ApiScope[] = [
  'visibility:read',
  'citations:read',
  'lead:write',
] as const;

export function parseScopes(raw: string): readonly ApiScope[] {
  if (!raw.trim()) return LEGACY_SCOPES;
  const parts = raw.split(',').map((p) => p.trim()).filter(Boolean);
  return parts.filter((p): p is ApiScope => (API_SCOPES as readonly string[]).includes(p));
}

export function serializeScopes(scopes: readonly ApiScope[]): string {
  return [...new Set(scopes)].join(',');
}

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

/** The UTC day a quota window belongs to. */
export function utcDay(now = new Date()): string {
  return now.toISOString().slice(0, 10);
}

/** Why a presented key was refused. Never returned to the caller verbatim. */
export type KeyRejection = 'malformed' | 'unknown' | 'revoked' | 'expired' | 'quota' | 'scope';

export interface KeyAuthSuccess {
  ok: true;
  project: { id: string; orgId: string; name: string; domain: string };
  keyId: string;
  scopes: readonly ApiScope[];
}

export interface KeyAuthFailure {
  ok: false;
  reason: KeyRejection;
}

export type KeyAuthResult = KeyAuthSuccess | KeyAuthFailure;

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

/**
 * Resolve a presented key, enforcing revocation, expiry, scope and quota.
 *
 * Order matters: revocation and expiry are checked before the quota is
 * incremented, so a dead key cannot consume a live key's budget.
 */
export async function authenticateApiKey(
  presented: string,
  required?: ApiScope,
  now = new Date(),
): Promise<KeyAuthResult> {
  const trimmed = presented.trim();
  if (!trimmed.startsWith(`${PREFIX}_`) || trimmed.length < 20) {
    return { ok: false, reason: 'malformed' };
  }

  const digest = hashKey(trimmed);
  // Narrow by prefix first so this is an indexed lookup, not a table scan.
  const candidates = await db.apiKey.findMany({
    where: { prefix: trimmed.slice(0, 12) },
    include: { project: true },
  });

  const match = candidates.find((c) => digestsMatch(c.hashedKey, digest));
  if (!match) return { ok: false, reason: 'unknown' };

  if (match.revokedAt) return { ok: false, reason: 'revoked' };
  if (match.expiresAt && match.expiresAt.getTime() <= now.getTime()) {
    return { ok: false, reason: 'expired' };
  }

  const scopes = parseScopes(match.scopes);
  if (required && !scopes.includes(required)) return { ok: false, reason: 'scope' };

  // Rolling daily budget. A new UTC day resets the counter in the same write
  // that increments it, so there is no separate reset job to fall behind.
  const today = utcDay(now);
  const sameDay = match.usageDay === today;
  const nextCount = sameDay ? match.usageCount + 1 : 1;

  if (match.dailyQuota > 0 && nextCount > match.dailyQuota) {
    return { ok: false, reason: 'quota' };
  }

  await db.apiKey.update({
    where: { id: match.id },
    data: { lastUsedAt: now, usageDay: today, usageCount: nextCount },
  });

  return {
    ok: true,
    keyId: match.id,
    scopes,
    project: {
      id: match.project.id,
      orgId: match.project.orgId,
      name: match.project.name,
      domain: match.project.domain,
    },
  };
}

/** Revoke a key. Scoped by project so one tenant cannot revoke another's key. */
export async function revokeApiKey(keyId: string, projectId: string): Promise<boolean> {
  const result = await db.apiKey.updateMany({
    where: { id: keyId, projectId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
  return result.count === 1;
}
