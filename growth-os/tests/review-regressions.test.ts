import { describe, it, expect, beforeEach } from "vitest";
import { db, systemDb } from "@/lib/db";
import { resetDb, makeWorkspace, makeBrand, touch, profile } from "./helpers";
import { createPiece, decide, schedule } from "@/lib/content/publish";
import { intakeLead } from "@/lib/crm/intake";
import { recordPayment, netCollections } from "@/lib/crm/ops";
import { advanceRun } from "@/lib/workflows/engine";
import { templatePage } from "@/lib/site/sections";
import { startCrawl, executeCrawl } from "@/lib/seo/crawl";
import { runDueJobs } from "@/lib/jobs/queue";
import { handlers } from "@/lib/jobs/handlers";
import { outcomeReport } from "@/lib/reports";
import { auditPages } from "@/lib/seo/rules";

beforeEach(resetDb);

describe("code-review regressions", () => {
  it("sending content back revokes the earlier approval so it can't be scheduled", async () => {
    const W = await makeWorkspace();
    const { brand } = await makeBrand(W.ws.id, W.user.id);
    const d = await db.destination.create({ data: { workspaceId: W.ws.id, brandId: brand.id, platform: "linkedin", label: "LI", adapter: "dry_run", status: "connected" } });
    const p = await createPiece(W.actor, { brandId: brand.id, title: "T", variants: [{ platform: "linkedin", caption: "x", hook: "", hashtags: [], mentions: [], internalTags: [], title: "" }], asset: null, generator: "human" });
    await decide(W.actor, p.id, { decision: "approved", destinationIds: [d.id], scheduleAt: null });
    await decide(W.actor, p.id, { decision: "rejected", destinationIds: [], scheduleAt: null, note: "Wrong offer" });
    await expect(schedule(W.actor, p.id)).rejects.toThrow(/Approve this version first/);
  });

  it("a double-submitted manual payment is recorded once", async () => {
    const W = await makeWorkspace();
    const r = await intakeLead({ workspaceId: W.ws.id, formKey: "f", idempotencyKey: "k", input: { email: "a@example.test", message: "m" }, touch: touch(), channel: "form" });
    const args = { kind: "payment" as const, amountMinor: 5000, currency: "USD", receivedAt: new Date(), idempotencyKey: "form-abc123" };
    const [a, b] = await Promise.all([recordPayment(W.actor, r.opportunityId!, args), recordPayment(W.actor, r.opportunityId!, args)]);
    expect([a.duplicate, b.duplicate].filter(Boolean)).toHaveLength(1);
    expect((await netCollections(W.ws.id, new Date(Date.now() - 3600_000), new Date(Date.now() + 3600_000))).USD?.net).toBe(5000);
  });

  it("a failing step effect un-claims the step so the retry runs it", async () => {
    const W = await makeWorkspace();
    await db.workflow.create({ data: { workspaceId: W.ws.id, name: "f", trigger: "form_submitted", enabled: true, versions: { create: { workspaceId: W.ws.id, version: 1, definition: { steps: [{ type: "create_task", title: "Call", dueInMinutes: 5 }] } } } } });
    await intakeLead({ workspaceId: W.ws.id, formKey: "f", idempotencyKey: "k", input: { email: "b@example.test", message: "m" }, touch: touch(), channel: "form" });
    const run = await db.workflowRun.findFirstOrThrow({ where: { workspaceId: W.ws.id } });
    // A real database error during the step's effect: a temporary trigger rejects task inserts.
    await systemDb.$executeRawUnsafe(`CREATE OR REPLACE FUNCTION gos_test_fail() RETURNS trigger AS $$ BEGIN RAISE EXCEPTION 'transient'; END $$ LANGUAGE plpgsql`);
    await systemDb.$executeRawUnsafe(`CREATE TRIGGER gos_test_fail BEFORE INSERT ON "Task" FOR EACH ROW WHEN (NEW."workflowRunId" IS NOT NULL) EXECUTE FUNCTION gos_test_fail()`);
    try {
      await expect(advanceRun(W.ws.id, run.id, 0)).rejects.toThrow(/transient/);
    } finally {
      await systemDb.$executeRawUnsafe(`DROP TRIGGER IF EXISTS gos_test_fail ON "Task"`);
    }
    expect((await db.workflowRun.findFirstOrThrow({ where: { workspaceId: W.ws.id, id: run.id } })).stepIndex).toBe(0);
    expect((await advanceRun(W.ws.id, run.id, 0)).state).toBe("completed");
    expect(await db.task.count({ where: { workspaceId: W.ws.id, workflowRunId: run.id } })).toBe(1);
  });

  it("duplicate crawl jobs run the crawl once; dismissed findings stay dismissed", async () => {
    const W = await makeWorkspace();
    const p = profile();
    const { brand } = await makeBrand(W.ws.id, W.user.id, p);
    const site = await db.site.create({ data: { workspaceId: W.ws.id, brandId: brand.id, name: "S", slug: `s-${Date.now()}`, theme: p.theme } });
    const t = templatePage(p, "home");
    const page = await db.page.create({ data: { workspaceId: W.ws.id, siteId: site.id, slug: "home", kind: "home", draftVersion: 1, publishedVersion: 1 } });
    await db.pageVersion.create({ data: { workspaceId: W.ws.id, pageId: page.id, version: 1, sections: t.sections, meta: t.meta, origin: "template", createdById: W.user.id } });
    const run = await startCrawl(W.actor, { siteId: site.id });
    await Promise.all([executeCrawl(W.ws.id, run.id), executeCrawl(W.ws.id, run.id)]);
    expect(await db.crawlPage.count({ where: { workspaceId: W.ws.id, runId: run.id } })).toBe(1);
    const f = await db.seoFinding.findFirstOrThrow({ where: { workspaceId: W.ws.id } });
    await db.seoFinding.update({ where: { id: f.id, workspaceId: W.ws.id }, data: { status: "dismissed" } });
    const before = await db.seoFinding.count({ where: { workspaceId: W.ws.id, rule: f.rule } });
    await startCrawl(W.actor, { siteId: site.id });
    await runDueJobs(handlers);
    expect(await db.seoFinding.count({ where: { workspaceId: W.ws.id, rule: f.rule } })).toBe(before);
  });

  it("a resubmission is not counted as a new submission in reports", async () => {
    const W = await makeWorkspace();
    const input = { email: "c@example.test", service: "X", message: "same" };
    await intakeLead({ workspaceId: W.ws.id, formKey: "f", idempotencyKey: "k1", input, touch: touch(), channel: "form" });
    await intakeLead({ workspaceId: W.ws.id, formKey: "f", idempotencyKey: "k2", input, touch: touch(), channel: "form" });
    const r = await outcomeReport(W.ws.id, new Date(Date.now() - 3600_000), new Date(Date.now() + 3600_000), null);
    expect(r.counts.submissions).toBe(1);
    expect(r.counts.duplicatesIgnored).toBe(1);
  });

  it("unreachable pages are reported as an audit gap, not silence", () => {
    const f = auditPages([{ url: "https://x.test/", status: 0, title: "", description: "", h1: [], canonical: "", noindex: false, wordCount: 0, internalLinks: [], schemaTypes: [], inSitemap: false, textHash: "" }]);
    expect(f.map((x) => x.rule)).toContain("fetch_failed");
  });
});
