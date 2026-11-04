"use server";
import bcrypt from "bcryptjs";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { systemDb } from "@/lib/db";
import { clearSessionCookie, getContext, setSessionCookie } from "@/lib/auth";
import { createSession, revokeSession, switchSessionWorkspace, workspacesForUser } from "@/lib/session";
import { hit } from "@/lib/rate-limit";
import { sha256 } from "@/lib/crypto";
import { isStaff } from "@/lib/rbac";
import { signFlash } from "@/lib/flash";
import { clientIp } from "@/lib/client-ip";

// Constant-time-ish failure path: compare against a real hash when the user is unknown.
const DUMMY_HASH = bcrypt.hashSync("not-a-real-password-placeholder", 10);

export async function loginAction(form: FormData) {
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  const password = String(form.get("password") ?? "");
  const ip = clientIp(await headers());
  if (!(await hit(`login:${sha256(ip)}`, 20, 15 * 60_000)) || !(await hit(`login-acct:${sha256(email)}`, 8, 15 * 60_000))) {
    redirect("/login?error=" + signFlash("Too many attempts. Wait 15 minutes and try again."));
  }
  const user = await systemDb.user.findUnique({ where: { email } });
  const ok = await bcrypt.compare(password, user?.passwordHash ?? DUMMY_HASH);
  if (!user || !ok || user.disabledAt) redirect("/login?error=" + signFlash("That email and password don't match an account."));
  const list = await workspacesForUser(user.id);
  if (!list.length) redirect("/login?error=" + signFlash("Your account isn't a member of any workspace yet. Ask the workspace owner for an invitation."));
  const first = list.find((w) => w.kind === "agency" && isStaff(w.role)) ?? list[0]!;
  const { token, expiresAt } = await createSession(user.id, first.id);
  await setSessionCookie(token, expiresAt);
  redirect(isStaff(first.role) ? "/app" : "/portal");
}

export async function logoutAction() {
  const ctx = await getContext();
  if (ctx) await revokeSession(ctx.sessionId, "logout");
  await clearSessionCookie();
  redirect("/login");
}

export async function switchWorkspaceAction(form: FormData) {
  const ctx = await getContext();
  if (!ctx) redirect("/login");
  const id = String(form.get("workspaceId") ?? "");
  await switchSessionWorkspace(ctx.sessionId, ctx.userId, id);
  const m = await systemDb.membership.findUnique({ where: { userId_workspaceId: { userId: ctx.userId, workspaceId: id } } });
  redirect(m && isStaff(m.role) ? "/app" : "/portal");
}
