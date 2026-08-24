import 'server-only';
import { createHash } from 'node:crypto';
import bcrypt from 'bcryptjs';
import { SignJWT, jwtVerify } from 'jose';
import { cookies } from 'next/headers';
import { db } from './db';
import { normalizeRole, type Role } from './rbac';

const COOKIE = 'supertool_session';
const MAX_AGE_SECONDS = 60 * 60 * 24 * 14;

/**
 * Signing secret. In production this must come from the environment; the
 * development fallback is deliberately obvious so a missing secret is caught
 * before it ships rather than silently signing tokens with a known key.
 */
function secret(): Uint8Array {
  const value = process.env.AUTH_SECRET;
  if (!value) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('AUTH_SECRET must be set in production.');
    }
    return new TextEncoder().encode('dev-only-insecure-secret-do-not-use-in-production');
  }
  if (value.length < 32) throw new Error('AUTH_SECRET must be at least 32 characters.');
  return new TextEncoder().encode(value);
}

export interface SessionUser {
  id: string;
  email: string;
  name: string;
  orgId: string;
  /** Role within `orgId`. Read from Membership, never from the cookie alone. */
  role: Role;
  /** Server-side session id. Present on every session issued from Phase 2 on. */
  sid?: string;
}

/**
 * A one-way fingerprint of the client IP, for the account's session list.
 *
 * Hashed rather than stored: showing someone their own sessions does not
 * require retaining a plaintext address for every login.
 */
function hashIp(ip: string): string {
  if (!ip) return '';
  return createHash('sha256').update(ip).digest('hex').slice(0, 16);
}

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, 12);
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

export interface SessionContext {
  userAgent?: string;
  ip?: string;
}

/**
 * Issue a session.
 *
 * The cookie is still a signed JWT, but it now carries `sid` — a row in the
 * Session table that is checked on every request. Before Phase 2 the token was
 * the whole truth, so a copy taken before logout stayed valid for the rest of
 * its fourteen days and nothing could stop it.
 */
export async function createSession(user: SessionUser, context: SessionContext = {}): Promise<void> {
  const expiresAt = new Date(Date.now() + MAX_AGE_SECONDS * 1000);

  const record = await db.session.create({
    data: {
      userId: user.id,
      orgId: user.orgId,
      expiresAt,
      userAgent: (context.userAgent ?? '').slice(0, 200),
      ipHash: hashIp(context.ip ?? ''),
    },
    select: { id: true },
  });

  const token = await new SignJWT({ ...user, sid: record.id })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(`${MAX_AGE_SECONDS}s`)
    .setSubject(user.id)
    .sign(secret());

  (await cookies()).set(COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: MAX_AGE_SECONDS,
  });
}

/**
 * End the current session.
 *
 * Revokes the server-side record *before* clearing the cookie, so a token
 * captured a moment earlier is already dead by the time the browser forgets it.
 */
export async function destroySession(): Promise<void> {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;

  if (token) {
    try {
      const { payload } = await jwtVerify(token, secret());
      const sid = (payload as { sid?: string }).sid;
      if (sid) await revokeSession(sid, 'logout');
    } catch {
      // A malformed cookie has no session to revoke. Clearing it is enough.
    }
  }

  jar.delete(COOKIE);
}

/** Revoke one session. Idempotent; an already-revoked session keeps its reason. */
export async function revokeSession(sessionId: string, reason: string): Promise<void> {
  await db.session.updateMany({
    where: { id: sessionId, revokedAt: null },
    data: { revokedAt: new Date(), revokedReason: reason },
  });
}

/**
 * Revoke every session for a user.
 *
 * Called on password change and password reset. A password change that leaves
 * old sessions alive does not evict whoever prompted the change.
 */
export async function revokeAllSessions(userId: string, reason: string): Promise<number> {
  const result = await db.session.updateMany({
    where: { userId, revokedAt: null },
    data: { revokedAt: new Date(), revokedReason: reason },
  });
  return result.count;
}

/** Live sessions for the account screen, newest first. */
export async function listSessions(userId: string) {
  return db.session.findMany({
    where: { userId, revokedAt: null, expiresAt: { gt: new Date() } },
    orderBy: { lastSeenAt: 'desc' },
    select: { id: true, createdAt: true, lastSeenAt: true, userAgent: true, ipHash: true },
  });
}

/**
 * The signed-in user, or null. Never throws on a malformed cookie.
 *
 * Two checks beyond the signature:
 *
 *   1. The session row must exist, be unrevoked and unexpired. This is what
 *      makes logout and password-change actually end a session.
 *   2. The role is read from the Membership row, not taken from the token. A
 *      token minted while the user was an admin must not keep admin rights
 *      after they are demoted.
 */
export async function getSession(): Promise<SessionUser | null> {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) return null;

  let claims: SessionUser;
  try {
    const { payload } = await jwtVerify(token, secret());
    claims = payload as unknown as SessionUser;
  } catch {
    return null;
  }

  const { id, email, name, orgId, sid } = claims;
  if (!id || !email || !orgId) return null;

  // Sessions issued before Phase 2 carry no sid. They are not honoured: an
  // unrevocable session is exactly what this change exists to remove, and the
  // cost is that everyone signs in again once.
  if (!sid) return null;

  const record = await db.session.findUnique({
    where: { id: sid },
    select: { id: true, userId: true, revokedAt: true, expiresAt: true },
  });

  if (!record || record.userId !== id) return null;
  if (record.revokedAt) return null;
  if (record.expiresAt.getTime() <= Date.now()) return null;

  const membership = await db.membership.findFirst({
    where: { userId: id, orgId },
    select: { role: true },
  });
  // Membership removed while the token was still valid: access ends now.
  if (!membership) return null;

  return { id, email, name, orgId, role: normalizeRole(membership.role), sid };
}

/**
 * Update `lastSeenAt`, best-effort.
 *
 * Separate from `getSession` so a read never blocks on a write, and so a
 * failure here can never sign someone out.
 */
export async function touchSession(sessionId: string): Promise<void> {
  await db.session
    .updateMany({ where: { id: sessionId, revokedAt: null }, data: { lastSeenAt: new Date() } })
    .catch(() => undefined);
}

/**
 * Look up a user by credentials. Runs a hash comparison even when the user is
 * absent so the response time does not reveal whether an email is registered.
 */
const DUMMY_HASH = '$2b$12$abcdefghijklmnopqrstuuMDpHvJ8pIlbmH8VfEB4XG9nWjOxHKO';

export async function authenticate(email: string, password: string): Promise<SessionUser | null> {
  const user = await db.user.findUnique({
    where: { email: email.toLowerCase().trim() },
    include: { memberships: { take: 1, orderBy: { id: 'asc' } } },
  });

  const ok = await verifyPassword(password, user?.passwordHash ?? DUMMY_HASH);
  if (!user || !ok) return null;

  const membership = user.memberships[0];
  if (!membership) return null;

  return {
    id: user.id,
    email: user.email,
    name: user.name,
    orgId: membership.orgId,
    role: normalizeRole(membership.role),
  };
}

/** Resolve the active project for a session, honouring an explicit id. */
export async function resolveProject(orgId: string, projectId?: string) {
  if (projectId) {
    const project = await db.project.findFirst({ where: { id: projectId, orgId } });
    if (project) return project;
  }
  return db.project.findFirst({ where: { orgId }, orderBy: { createdAt: 'asc' } });
}
