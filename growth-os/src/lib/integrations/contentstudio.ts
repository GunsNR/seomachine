import { z } from "zod";
import { redact } from "../crypto";
import { loadCredential, setStatus, timedFetch } from "./store";
import type { PublishAdapter, PublishRequest, PublishResponse } from "../content/adapters";

/**
 * ContentStudio publishing adapter.
 * Verified 2026-11-03 against https://api.contentstudio.io/guide and
 * docs.contentstudio.io: header `X-API-Key`, `GET /api/v1/workspaces`,
 * `GET /api/v1/workspaces/{id}/accounts`, `POST /api/v1/workspaces/{id}/posts`
 * returning `{ data: { id } }`, errors `{ status: false, message }`.
 * Not documented: an idempotency key or a reliable way to find a post we
 * created. So after an unclear result this adapter never auto-resends — the
 * publication is marked for a human to check in ContentStudio.
 * Not yet live verified: needs an approved plan and a real key.
 */

/** This adapter sends text only. These platforms accept text-only posts; Instagram, TikTok and YouTube need media. */
export const CS_TEXT_PLATFORMS = ["facebook", "linkedin", "google_business"] as const;

export function csBase() {
  return (process.env.CONTENTSTUDIO_API_BASE || "https://api.contentstudio.io").replace(/\/$/, "");
}

const CreateResp = z.object({ data: z.object({ id: z.union([z.string(), z.number()]).transform(String) }).passthrough() }).passthrough();

/** ContentStudio expects "YYYY-MM-DD HH:mm:ss". We send UTC; confirm on the first live run that the workspace treats it as UTC. */
export function csTime(d: Date) {
  return d.toISOString().replace("T", " ").slice(0, 19);
}

export async function testContentStudio(workspaceId: string): Promise<{ ok: boolean; message: string }> {
  const cred = await loadCredential(workspaceId, "contentstudio");
  if (!cred) return { ok: false, message: "Add an API key first." };
  const csWorkspace = String(cred.meta.csWorkspaceId ?? "");
  if (!csWorkspace) return { ok: false, message: "Add the ContentStudio workspace ID." };
  const r = await timedFetch(`${csBase()}/api/v1/workspaces/${encodeURIComponent(csWorkspace)}/accounts`, { headers: { "X-API-Key": cred.secret, accept: "application/json" }, timeoutMs: 10000 });
  if (r.kind !== "response") {
    await setStatus(workspaceId, "contentstudio", "error", "ContentStudio didn't answer.");
    return { ok: false, message: "ContentStudio didn't answer. Try again in a minute." };
  }
  if (r.res.status === 401 || r.res.status === 403) {
    await setStatus(workspaceId, "contentstudio", "error", "Key rejected.");
    return { ok: false, message: "ContentStudio rejected the key. Check it was copied fully (it starts with cs_)." };
  }
  if (!r.res.ok) {
    await setStatus(workspaceId, "contentstudio", "error", `HTTP ${r.res.status}`);
    return { ok: false, message: `ContentStudio returned an error (${r.res.status}). Check the workspace ID.` };
  }
  const body = (await r.res.json().catch(() => null)) as { data?: unknown[] } | null;
  const n = Array.isArray(body?.data) ? body!.data.length : 0;
  await setStatus(workspaceId, "contentstudio", "connected", `Verified ${new Date().toISOString().slice(0, 10)}: ${n} account(s) visible.`, { ...cred.meta, verifiedAt: new Date().toISOString(), accounts: Array.isArray(body?.data) ? (body!.data as Record<string, unknown>[]).slice(0, 50).map((a) => ({ id: String(a.id ?? a._id ?? ""), name: String(a.name ?? a.platform_name ?? a.platform ?? "") })) : [] });
  return { ok: true, message: `Connected. ${n} social account(s) visible in that ContentStudio workspace.` };
}

export async function contentStudioAdapter(workspaceId: string, accountId: string): Promise<PublishAdapter | null> {
  const cred = await loadCredential(workspaceId, "contentstudio");
  if (!cred || cred.integration.status !== "connected" || !accountId) return null;
  const csWorkspace = String(cred.meta.csWorkspaceId ?? "");
  return {
    name: "contentstudio",
    safeToRetryWhenNotFound: false,
    async publish(req: PublishRequest): Promise<PublishResponse> {
      if (!(CS_TEXT_PLATFORMS as readonly string[]).includes(req.platform)) return { kind: "rejected", reason: `${req.platform} needs an image or video, which this connection doesn't send yet. Post it by hand.`, permanent: true };
      // Only documented publish_type values ("draft", "scheduled") are used; "post now" is a
      // schedule two minutes ahead, because ContentStudio requires a future time.
      const when = req.scheduleAt && req.scheduleAt.getTime() > Date.now() + 120_000 ? req.scheduleAt : new Date(Date.now() + 120_000);
      const body = {
        content: { text: req.caption },
        accounts: [accountId],
        post_type: "feed",
        scheduling: { publish_type: "scheduled", scheduled_at: csTime(when) },
      };
      const r = await timedFetch(`${csBase()}/api/v1/workspaces/${encodeURIComponent(csWorkspace)}/posts`, { method: "POST", headers: { "X-API-Key": cred.secret, "content-type": "application/json", accept: "application/json" }, body: JSON.stringify(body), timeoutMs: 20000 });
      if (r.kind === "timeout" || r.kind === "network") return { kind: "timeout" };
      const json = (await r.res.json().catch(() => null)) as unknown;
      if (r.res.status === 401 || r.res.status === 403) {
        await setStatus(workspaceId, "contentstudio", "expired", "Key rejected while publishing.");
        return { kind: "rejected", reason: "ContentStudio rejected the API key. Reconnect it in Settings → Integrations.", permanent: true };
      }
      if (r.res.status === 429) return { kind: "rejected", reason: "ContentStudio rate limit reached (monthly or per-day). Try later.", permanent: false };
      if (!r.res.ok) return { kind: "rejected", reason: redact(`ContentStudio refused the post: ${String((json as { message?: string })?.message ?? r.res.status)}`), permanent: r.res.status < 500 };
      const parsed = CreateResp.safeParse(json);
      if (!parsed.success) return { kind: "timeout" }; // accepted but unreadable: treat as unknown, never resend
      // Acceptance only: ContentStudio does not return a public post URL at creation.
      return { kind: "accepted", providerRef: parsed.data.data.id };
    },
    async lookup() {
      // No documented lookup by our key. Report not-found; safeToRetryWhenNotFound=false stops any resend.
      return { found: false };
    },
  };
}
