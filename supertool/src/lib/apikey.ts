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

/**
 * A fresh quota group for a standalone key.
 *
 * Generated rather than derived from the row id, because the id does not exist
 * until the row is written and a key must never be inserted without a group.
 */
export function newQuotaGroupId(): string {
  return `grp_${randomBytes(16).toString('base64url')}`;
}

/** The UTC day a quota window belongs to. */
export function utcDay(now = new Date()): string {
  return now.toISOString().slice(0, 10);
}

/**
 * Spend one request against a key group's daily budget.
 *
 * Admission and increment are one statement. The old code read the group's
 * usage, decided, and wrote back separately, so two requests arriving together
 * both read the same total and were both admitted — and because they then wrote
 * the same value, the overage left no trace.
 *
 * `ON CONFLICT DO UPDATE` takes a row lock, so concurrent callers serialize on
 * the unique index. The limit lives in the `WHERE` of that update: when the row
 * is already at the limit the update is skipped, the statement returns no rows,
 * and the refusal *is* the fact that nothing was incremented. There is no path
 * that spends the budget and then rejects.
 *
 * A `limit` of 0 means unlimited, matching `dailyQuota`. A new UTC day is a new
 * unique key, so the budget resets by insertion rather than by a reset job.
 */
export async function admitQuota(
  orgId: string,
  quotaGroupId: string,
  usageDay: string,
  limit: number,
): Promise<{ admitted: boolean; used: number }> {
  const rows = await db.$queryRaw<Array<{ used: number }>>`
    INSERT INTO "ApiQuotaCounter" ("id", "orgId", "quotaGroupId", "usageDay", "used", "updatedAt")
    VALUES (gen_random_uuid()::text, ${orgId}, ${quotaGroupId}, ${usageDay}, 1, NOW())
    ON CONFLICT ("orgId", "quotaGroupId", "usageDay")
    DO UPDATE SET "used" = "ApiQuotaCounter"."used" + 1, "updatedAt" = NOW()
      WHERE ${limit} = 0 OR "ApiQuotaCounter"."used" < ${limit}
    RETURNING "used"
  `;

  // No row means the guard refused the update: the group is at its limit and
  // nothing was spent.
  if (rows.length === 0) return { admitted: false, used: limit };
  return { admitted: true, used: Number(rows[0].used) };
}

/** Why a presented key was refused. Never returned to the caller verbatim. */
export type KeyRejection =
  | 'malformed'
  | 'unknown'
  | 'revoked'
  | 'expired'
  /** A rotated predecessor whose 24-hour overlap window has closed. */
  | 'overlap_expired'
  | 'quota'
  | 'scope';

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
  // A rotated predecessor dies when its overlap window closes. This is checked
  // where the key is presented, so the old key stops working on its own — no
  // worker has to sweep it, and there is none to be down when it matters.
  if (match.overlapExpiresAt && match.overlapExpiresAt.getTime() <= now.getTime()) {
    return { ok: false, reason: 'overlap_expired' };
  }

  const scopes = parseScopes(match.scopes);
  if (required && !scopes.includes(required)) return { ok: false, reason: 'scope' };

  // The daily budget. One statement decides and spends, so two requests
  // arriving together cannot both be admitted against the same count.
  //
  // The counter is keyed by tenant as well as by group. Group ids are unique by
  // construction, but that is an application promise; the tenant makes one
  // organization's usage arithmetically unable to reach another's, whatever a
  // group id turns out to hold.
  //
  // During a rotation overlap two keys are live at once and share this row, so
  // rotating cannot hand out a second allowance.
  const today = utcDay(now);
  const admission = await admitQuota(match.orgId, match.quotaGroupId, today, match.dailyQuota);
  if (!admission.admitted) return { ok: false, reason: 'quota' };

  // Per-key bookkeeping, written after the budget is already spent. This is
  // what the settings screen shows; it is no longer what admits anything, so a
  // failure here cannot let a request through that the counter refused.
  const sameDay = match.usageDay === today;
  await db.apiKey.update({
    where: { id: match.id },
    data: { lastUsedAt: now, usageDay: today, usageCount: sameDay ? match.usageCount + 1 : 1 },
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

/**
 * How long a rotated key keeps working.
 *
 * Long enough for someone to update an integration during a working day,
 * short enough that a leaked key is not usable for a second one.
 */
export const ROTATION_OVERLAP_MS = 24 * 60 * 60 * 1000;

export type RotationRejection = 'not_found' | 'revoked' | 'expired' | 'already_rotated';

export interface RotationSuccess {
  ok: true;
  /** Returned exactly once. Only the digest is persisted. */
  plaintext: string;
  prefix: string;
  newKeyId: string;
  previousKeyId: string;
  /** When the predecessor stops authenticating. */
  overlapExpiresAt: Date;
}

export interface RotationFailure {
  ok: false;
  reason: RotationRejection;
}

/** Thrown inside the transaction when another rotation won the race. */
class RotationConflict extends Error {}

/**
 * Replace a key, leaving the old one working for a bounded overlap.
 *
 * The shape of the problem: revoking a leaked key breaks the customer's
 * integration at the exact moment they discover the leak, so in practice
 * nobody revokes. An overlap makes the safe action the convenient one — the
 * new key works immediately, the old one keeps working while the integration
 * is updated, and it then expires whether or not anyone comes back.
 *
 * The successor inherits the predecessor's project, scopes, quota and expiry
 * and gains nothing. Rotation is a *replacement*, never an escalation: it
 * cannot widen a scope, raise a budget, or extend a key's lifetime past the
 * expiry its issuer chose.
 */
export async function rotateApiKey(params: {
  keyId: string;
  orgId: string;
  actorUserId?: string | null;
  actorRole: string;
  now?: Date;
}): Promise<RotationSuccess | RotationFailure> {
  const now = params.now ?? new Date();
  const overlapExpiresAt = new Date(now.getTime() + ROTATION_OVERLAP_MS);

  // Read first, only to say *why* a rotation was refused. The claim below is
  // what actually decides, so a key that changes between these two statements
  // still cannot be rotated twice.
  const existing = await db.apiKey.findFirst({
    where: { id: params.keyId, project: { orgId: params.orgId } },
  });

  // A key belonging to another tenant is reported as missing, not as
  // forbidden: "that key exists but is not yours" is an existence oracle.
  if (!existing) return { ok: false, reason: 'not_found' };
  if (existing.revokedAt) return { ok: false, reason: 'revoked' };
  if (existing.expiresAt && existing.expiresAt.getTime() <= now.getTime()) {
    return { ok: false, reason: 'expired' };
  }
  if (existing.overlapExpiresAt && existing.overlapExpiresAt.getTime() <= now.getTime()) {
    return { ok: false, reason: 'expired' };
  }
  if (existing.rotatedAt) return { ok: false, reason: 'already_rotated' };

  // The pair shares one budget. The successor inherits the predecessor's group
  // exactly — there is nothing to derive or fall back to, so a chain of
  // rotations keeps one allowance however long it runs.
  const quotaGroupId = existing.quotaGroupId;
  const generated = generateKey();

  try {
    return await db.$transaction(async (tx) => {
      // The claim. `rotatedAt: null` in the filter is the whole concurrency
      // story: two simultaneous rotations both try this, the second finds the
      // row already stamped, and its transaction is rolled back having created
      // nothing. The unique index on `rotatedFromId` says the same thing at the
      // storage layer, so neither path can produce two live successors.
      const claimed = await tx.apiKey.updateMany({
        where: {
          id: existing.id,
          rotatedAt: null,
          revokedAt: null,
          project: { orgId: params.orgId },
        },
        data: { rotatedAt: now, overlapExpiresAt },
      });
      if (claimed.count !== 1) throw new RotationConflict();

      const successor = await tx.apiKey.create({
        data: {
          projectId: existing.projectId,
          orgId: existing.orgId,
          label: existing.label,
          prefix: generated.prefix,
          hashedKey: generated.hashed,
          // Inherited verbatim. Nothing here is widened.
          scopes: existing.scopes,
          dailyQuota: existing.dailyQuota,
          expiresAt: existing.expiresAt,
          rotatedFromId: existing.id,
          quotaGroupId,
        },
      });

      // Identifiers only. There is no column on this table that could hold the
      // plaintext or the digest, and none is written here.
      await tx.apiKeyEvent.create({
        data: {
          projectId: existing.projectId,
          action: 'rotated',
          keyId: existing.id,
          successorKeyId: successor.id,
          actorUserId: params.actorUserId ?? null,
          actorRole: params.actorRole,
          overlapExpiresAt,
        },
      });

      return {
        ok: true as const,
        plaintext: generated.plaintext,
        prefix: generated.prefix,
        newKeyId: successor.id,
        previousKeyId: existing.id,
        overlapExpiresAt,
      };
    });
  } catch (err) {
    // Both the claim losing and the unique index firing mean the same thing:
    // somebody else already rotated this key. Fail closed either way.
    if (err instanceof RotationConflict) return { ok: false, reason: 'already_rotated' };
    if (typeof err === 'object' && err !== null && 'code' in err && (err as { code: unknown }).code === 'P2002') {
      return { ok: false, reason: 'already_rotated' };
    }
    throw err;
  }
}
