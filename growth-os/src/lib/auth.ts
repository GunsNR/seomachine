import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { resolveSession, type Ctx } from "./session";
import { assertCan, isStaff, type Permission } from "./rbac";

export const SESSION_COOKIE = "gos_session";

export async function getContext(): Promise<Ctx | null> {
  const jar = await cookies();
  return resolveSession(jar.get(SESSION_COOKIE)?.value);
}

/** For pages: redirect to login when signed out; send clients to the portal. */
export async function requireStaffPage(permission?: Permission): Promise<Ctx> {
  const ctx = await getContext();
  if (!ctx) redirect("/login");
  if (!isStaff(ctx.role)) redirect("/portal");
  if (permission) assertCan(ctx.role, permission);
  return ctx;
}

export async function requirePortalPage(): Promise<Ctx> {
  const ctx = await getContext();
  if (!ctx) redirect("/login");
  assertCan(ctx.role, "portal.view");
  return ctx;
}

/** For server actions / route handlers: throws instead of redirecting. */
export async function requirePermission(permission: Permission): Promise<Ctx> {
  const ctx = await getContext();
  if (!ctx) throw new Error("Your session has ended. Sign in again.");
  assertCan(ctx.role, permission);
  return ctx;
}

export async function setSessionCookie(token: string, expiresAt: Date) {
  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: expiresAt,
  });
}

export async function clearSessionCookie() {
  const jar = await cookies();
  jar.delete(SESSION_COOKIE);
}
