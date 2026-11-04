"use server";
import { requirePermission } from "@/lib/auth";
import { runAction, str } from "@/lib/actions";
import { db } from "@/lib/db";
import { startCrawl } from "@/lib/seo/crawl";
import { proposePatchForFinding } from "@/lib/seo/patches";
import { runDueJobs } from "@/lib/jobs/queue";
import { handlers } from "@/lib/jobs/handlers";

const actor = (c: { workspace: { id: string }; userId: string; role: string }) => ({ workspaceId: c.workspace.id, userId: c.userId, role: c.role });

export async function startCrawlAction(f: FormData) {
  const ctx = await requirePermission("seo.write");
  await runAction("/app/seo", async () => {
    const siteId = str(f, "siteId");
    if (siteId) {
      await startCrawl(actor(ctx), { siteId });
    } else {
      if (f.get("authorized") !== "on") throw new Error("Confirm you're authorized to audit that site.");
      await startCrawl(actor(ctx), { rootUrl: str(f, "rootUrl"), maxPages: 25 });
    }
    // Local development convenience: run due jobs inline. In production the worker does it.
    if (process.env.NODE_ENV !== "production") {
      await runDueJobs(handlers, { max: 10 });
      return "Audit finished. Findings below are from this crawl.";
    }
    return "Audit queued. Results appear here when the background worker finishes it — refresh in a few seconds.";
  });
}

export async function proposePatchAction(f: FormData) {
  const ctx = await requirePermission("seo.write");
  const id = str(f, "findingId");
  await runAction(`/app/seo/${id}`, async () => {
    const ch = await proposePatchForFinding(actor(ctx), id);
    await db.seoFinding.update({ where: { id, workspaceId: ctx.workspace.id }, data: { status: "patch_proposed" } });
    return { to: `/app/websites/${ch.pageId}`, ok: "Patch proposed against the current draft. Review the before/after, apply, publish, then re-run the audit to verify." };
  });
}

export async function dismissAction(f: FormData) {
  const ctx = await requirePermission("seo.write");
  await runAction("/app/seo", async () => { await db.seoFinding.updateMany({ where: { workspaceId: ctx.workspace.id, id: str(f, "findingId") }, data: { status: "dismissed" } }); return "Dismissed"; });
}
