import { systemDb } from "./db";
import { randomToken, sha256 } from "./crypto";
import type { Role } from "./rbac";

/** Session core without Next.js cookie access, so it is directly testable. */

export const SESSION_TTL_MS = 14 * 24 * 60 * 60 * 1000;

export type Ctx = {
  sessionId: string;
  userId: string;
  userName: string;
  email: string;
  role: Role;
  workspace: { id: string; name: string; kind: string; timezone: string; currency: string; pausedAt: Date | null; isFixture: boolean; parentId: string | null };
};

export async function createSession(userId: string, workspaceId: string): Promise<{ token: string; expiresAt: Date }> {
  const m = await systemDb.membership.findUnique({ where: { userId_workspaceId: { userId, workspaceId } } });
  if (!m || m.revokedAt) throw new Error("No active membership for that workspace");
  const token = randomToken();
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  await systemDb.session.create({ data: { tokenHash: sha256(token), userId, workspaceId, expiresAt } });
  return { token, expiresAt };
}

/**
 * Resolve a raw cookie token to a context. Re-checks the membership on every
 * request, so a revoked membership or disabled user loses access immediately
 * even if the session row is still unexpired.
 */
export async function resolveSession(token: string | undefined | null): Promise<Ctx | null> {
  if (!token || token.length < 20) return null;
  const s = await systemDb.session.findUnique({ where: { tokenHash: sha256(token) }, include: { user: true } });
  if (!s || s.revokedAt || s.expiresAt < new Date() || s.user.disabledAt) return null;
  const m = await systemDb.membership.findUnique({
    where: { userId_workspaceId: { userId: s.userId, workspaceId: s.workspaceId } },
    include: { workspace: true },
  });
  if (!m || m.revokedAt) return null;
  if (Date.now() - s.lastSeenAt.getTime() > 5 * 60 * 1000) {
    await systemDb.session.update({ where: { id: s.id }, data: { lastSeenAt: new Date() } });
  }
  const w = m.workspace;
  return {
    sessionId: s.id,
    userId: s.userId,
    userName: s.user.name,
    email: s.user.email,
    role: m.role as Role,
    workspace: { id: w.id, name: w.name, kind: w.kind, timezone: w.timezone, currency: w.currency, pausedAt: w.pausedAt, isFixture: w.isFixture, parentId: w.parentId },
  };
}

export async function revokeSession(sessionId: string, reason: string): Promise<void> {
  await systemDb.session.updateMany({ where: { id: sessionId, revokedAt: null }, data: { revokedAt: new Date(), revokedReason: reason } });
}

export async function revokeUserSessions(userId: string, reason: string, workspaceId?: string): Promise<number> {
  const r = await systemDb.session.updateMany({
    where: { userId, revokedAt: null, ...(workspaceId ? { workspaceId } : {}) },
    data: { revokedAt: new Date(), revokedReason: reason },
  });
  return r.count;
}

/** Switch the active workspace on an existing session after re-checking membership. */
export async function switchSessionWorkspace(sessionId: string, userId: string, workspaceId: string): Promise<void> {
  const m = await systemDb.membership.findUnique({ where: { userId_workspaceId: { userId, workspaceId } } });
  if (!m || m.revokedAt) throw new Error("You are not a member of that workspace");
  await systemDb.session.update({ where: { id: sessionId }, data: { workspaceId } });
}

export async function workspacesForUser(userId: string) {
  const ms = await systemDb.membership.findMany({
    where: { userId, revokedAt: null },
    include: { workspace: true },
    orderBy: { workspace: { name: "asc" } },
  });
  return ms
    .map((m) => ({ id: m.workspace.id, name: m.workspace.name, kind: m.workspace.kind, role: m.role, isFixture: m.workspace.isFixture }))
    .sort((a, b) => (a.kind === b.kind ? a.name.localeCompare(b.name) : a.kind === "agency" ? -1 : 1));
}
