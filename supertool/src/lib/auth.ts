import 'server-only';
import bcrypt from 'bcryptjs';
import { SignJWT, jwtVerify } from 'jose';
import { cookies } from 'next/headers';
import { db } from './db';

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
}

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, 12);
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

export async function createSession(user: SessionUser): Promise<void> {
  const token = await new SignJWT({ ...user })
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

export async function destroySession(): Promise<void> {
  (await cookies()).delete(COOKIE);
}

/** The signed-in user, or null. Never throws on a malformed cookie. */
export async function getSession(): Promise<SessionUser | null> {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret());
    const { id, email, name, orgId } = payload as unknown as SessionUser;
    if (!id || !email || !orgId) return null;
    return { id, email, name, orgId };
  } catch {
    return null;
  }
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

  const orgId = user.memberships[0]?.orgId;
  if (!orgId) return null;

  return { id: user.id, email: user.email, name: user.name, orgId };
}

/** Resolve the active project for a session, honouring an explicit id. */
export async function resolveProject(orgId: string, projectId?: string) {
  if (projectId) {
    const project = await db.project.findFirst({ where: { id: projectId, orgId } });
    if (project) return project;
  }
  return db.project.findFirst({ where: { orgId }, orderBy: { createdAt: 'asc' } });
}
