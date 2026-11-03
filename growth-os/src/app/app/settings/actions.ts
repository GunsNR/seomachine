"use server";
import { requirePermission } from "@/lib/auth";
import { runAction, str } from "@/lib/actions";
import { db, systemDb } from "@/lib/db";
import { audit } from "@/lib/audit";
import { randomToken, sha256 } from "@/lib/crypto";
import { revokeUserSessions } from "@/lib/session";
import { normalizeEmail } from "@/lib/normalize";
import { cookies } from "next/headers";

/** One-time links are shown once from a short-lived cookie so they never land in URLs, history or access logs. */
async function stashLink(path: string) {
  (await cookies()).set("gos_once_link", path, { httpOnly: true, sameSite: "strict", secure: process.env.NODE_ENV === "production", path: "/app/settings", maxAge: 120 });
}

export async function pauseAction(f: FormData) {
  const ctx = await requirePermission("workspace.pause");
  await runAction("/app/settings", async () => {
    const pause = str(f, "pause") === "on";
    await systemDb.workspace.update({ where: { id: ctx.workspace.id }, data: { pausedAt: pause ? new Date() : null, pausedBy: pause ? ctx.userId : null } });
    await audit(ctx.workspace.id, ctx.userId, pause ? "workspace.pause" : "workspace.resume", "workspace", ctx.workspace.id);
    return pause ? "Paused. Nothing will be sent or posted from this workspace until you resume." : "Resumed. Held steps will continue at their next check.";
  });
}

export async function toggleWorkflowAction(f: FormData) {
  const ctx = await requirePermission("settings.manage");
  await runAction("/app/settings", async () => {
    const id = str(f, "workflowId");
    const enabled = str(f, "enabled") === "on";
    await db.workflow.update({ where: { id, workspaceId: ctx.workspace.id }, data: { enabled } });
    if (!enabled) {
      const flows = await db.workflowVersion.findMany({ where: { workspaceId: ctx.workspace.id, workflowId: id }, select: { id: true } });
      await db.workflowRun.updateMany({ where: { workspaceId: ctx.workspace.id, workflowVersionId: { in: flows.map((x) => x.id) }, status: { in: ["running", "waiting"] } }, data: { status: "stopped", stopReason: "workflow_disabled" } });
    }
    await audit(ctx.workspace.id, ctx.userId, enabled ? "workflow.enable" : "workflow.disable", "workflow", id);
    return enabled ? "Workflow on for new triggers" : "Workflow off. In-flight runs were stopped.";
  });
}

export async function inviteAction(f: FormData) {
  const ctx = await requirePermission("members.manage");
  await runAction("/app/settings#members", async () => {
    const email = normalizeEmail(str(f, "email"));
    if (!email) throw new Error("Enter a valid email address.");
    const role = ["admin", "member", "client"].includes(str(f, "role")) ? str(f, "role") : "member";
    const token = randomToken();
    await systemDb.authToken.create({ data: { kind: "invite", tokenHash: sha256(token), email, workspaceId: ctx.workspace.id, role, createdById: ctx.userId, expiresAt: new Date(Date.now() + 7 * 86400000) } });
    await audit(ctx.workspace.id, ctx.userId, "member.invite", "workspace", ctx.workspace.id, { role });
    await stashLink(`/invite/${token}`);
    return "Invitation created. Copy the link shown below and send it yourself (valid 7 days, single use).";
  });
}

export async function resetLinkAction(f: FormData) {
  const ctx = await requirePermission("members.manage");
  await runAction("/app/settings#members", async () => {
    const m = await systemDb.membership.findFirst({ where: { workspaceId: ctx.workspace.id, userId: str(f, "userId"), revokedAt: null }, include: { user: true } });
    if (!m) throw new Error("That person isn't a member here.");
    const token = randomToken();
    await systemDb.authToken.create({ data: { kind: "reset", tokenHash: sha256(token), email: m.user.email, createdById: ctx.userId, expiresAt: new Date(Date.now() + 60 * 60000) } });
    await audit(ctx.workspace.id, ctx.userId, "member.reset_link", "user", m.userId);
    await stashLink(`/reset/${token}`);
    return "Reset link created. Copy the link shown below and send it to them (valid 1 hour, single use).";
  });
}

export async function revokeMemberAction(f: FormData) {
  const ctx = await requirePermission("members.manage");
  await runAction("/app/settings#members", async () => {
    const userId = str(f, "userId");
    if (userId === ctx.userId) throw new Error("You can't remove yourself.");
    await systemDb.membership.updateMany({ where: { workspaceId: ctx.workspace.id, userId }, data: { revokedAt: new Date() } });
    const n = await revokeUserSessions(userId, "membership_revoked", ctx.workspace.id);
    await audit(ctx.workspace.id, ctx.userId, "member.revoke", "user", userId, { sessions: n });
    return "Access removed. Their sessions here ended immediately.";
  });
}

export async function budgetAction(f: FormData) {
  const ctx = await requirePermission("live.toggle");
  await runAction("/app/settings#ai", async () => {
    const usd = Number(str(f, "usd"));
    if (!Number.isFinite(usd) || usd < 0 || usd > 500) throw new Error("Enter a monthly cap between $0 and $500.");
    await systemDb.workspace.update({ where: { id: ctx.workspace.id }, data: { aiMonthlyCapMicros: Math.round(usd * 1_000_000) } });
    await audit(ctx.workspace.id, ctx.userId, "ai.budget", "workspace", ctx.workspace.id, { usd });
    return `AI cap set to $${usd.toFixed(2)} per month. AI still stays off until it's switched on server-side.`;
  });
}

export async function retryJobAction(f: FormData) {
  const ctx = await requirePermission("settings.manage");
  await runAction("/app/settings#health", async () => {
    const r = await systemDb.job.updateMany({ where: { id: str(f, "jobId"), workspaceId: ctx.workspace.id, status: "dead" }, data: { status: "queued", attempts: 0, runAfter: new Date(), lastError: "" } });
    return r.count ? "Re-queued. The worker will retry it." : "That job can't be retried.";
  });
}

export async function unsuppressAction(f: FormData) {
  const ctx = await requirePermission("settings.manage");
  await runAction("/app/settings#automation", async () => {
    await db.suppression.deleteMany({ where: { workspaceId: ctx.workspace.id, id: str(f, "id"), reason: { not: "opt_out" } } });
    return "Removed (opt-outs can't be removed here).";
  });
}
