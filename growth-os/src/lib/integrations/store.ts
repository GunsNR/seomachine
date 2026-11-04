import type { Prisma } from "@prisma/client";
import { db } from "../db";
import { decryptSecret, encryptSecret } from "../crypto";
import { audit } from "../audit";

/** Provider credentials live encrypted in Integration.encryptedToken and are never returned to the browser. */
export async function saveCredential(a: { workspaceId: string; userId: string }, provider: string, secret: string, meta: Prisma.InputJsonValue) {
  const enc = encryptSecret(secret);
  await db.integration.upsert({
    where: { workspaceId_provider: { workspaceId: a.workspaceId, provider } },
    create: { workspaceId: a.workspaceId, provider, status: "not_configured", encryptedToken: enc, meta },
    update: { status: "not_configured", encryptedToken: enc, meta, note: "", lastCheckedAt: null },
  });
  await audit(a.workspaceId, a.userId, "integration.credential", "integration", provider);
}

export async function loadCredential(workspaceId: string, provider: string) {
  const i = await db.integration.findFirst({ where: { workspaceId, provider } });
  if (!i?.encryptedToken) return null;
  return { integration: i, secret: decryptSecret(i.encryptedToken), meta: (i.meta ?? {}) as Record<string, unknown> };
}

export async function setStatus(workspaceId: string, provider: string, status: "connected" | "error" | "not_configured" | "expired", note: string, meta?: Prisma.InputJsonValue) {
  await db.integration.updateMany({ where: { workspaceId, provider }, data: { status, note: note.slice(0, 500), lastCheckedAt: new Date(), ...(meta !== undefined ? { meta } : {}) } });
}

export async function disconnect(a: { workspaceId: string; userId: string }, provider: string) {
  await db.integration.updateMany({ where: { workspaceId: a.workspaceId, provider }, data: { status: "not_configured", encryptedToken: "", note: "Disconnected", meta: {} } });
  if (provider === "contentstudio") await db.destination.updateMany({ where: { workspaceId: a.workspaceId, adapter: "contentstudio" }, data: { status: "not_connected" } });
  await audit(a.workspaceId, a.userId, "integration.disconnect", "integration", provider);
}

/** fetch with a hard timeout; distinguishes "no answer" from an answer. */
export async function timedFetch(url: string, init: RequestInit & { timeoutMs?: number }): Promise<{ kind: "response"; res: Response } | { kind: "timeout" } | { kind: "network"; error: string }> {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), Number(process.env.PROVIDER_TIMEOUT_MS) || init.timeoutMs || 15000);
  try {
    const res = await fetch(url, { ...init, signal: ctl.signal });
    return { kind: "response", res };
  } catch (e) {
    if ((e as Error).name === "AbortError") return { kind: "timeout" };
    return { kind: "network", error: (e as Error).message };
  } finally {
    clearTimeout(t);
  }
}
