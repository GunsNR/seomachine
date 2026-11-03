import { describe, it, expect, beforeEach } from "vitest";
import { db } from "@/lib/db";
import { resetDb, makeWorkspace, makeBrand, profile } from "./helpers";
import { templatePage, heroChecks } from "@/lib/site/sections";
import { applyChange, loadPage, proposeChange, publishVersion, rollbackTo, saveVersion, StaleVersionError } from "@/lib/site/pages";
import { buildRender, sitemapEntries } from "@/lib/site/public";
import { startCrawl, parseHtml } from "@/lib/seo/crawl";
import { proposePatchForFinding } from "@/lib/seo/patches";
import { runDueJobs } from "@/lib/jobs/queue";
import { handlers } from "@/lib/jobs/handlers";
import { auditPages, shingles } from "@/lib/seo/rules";
import { applyPatch } from "@/lib/site/patch";

beforeEach(resetDb);

async function siteWithHome() {
  const W = await makeWorkspace();
  const p = profile();
  const { brand } = await makeBrand(W.ws.id, W.user.id, p);
  const site = await db.site.create({ data: { workspaceId: W.ws.id, brandId: brand.id, name: "Harbor Line", slug: `harbor-${Date.now()}`, theme: p.theme } });
  const t = templatePage(p, "home");
  const page = await db.page.create({ data: { workspaceId: W.ws.id, siteId: site.id, slug: "home", kind: "home", draftVersion: 1, publishedVersion: 1 } });
  await db.pageVersion.create({ data: { workspaceId: W.ws.id, pageId: page.id, version: 1, sections: t.sections, meta: { ...t.meta, title: "x".repeat(65) }, origin: "template", createdById: W.user.id } });
  return { ...W, site, page, p };
}

describe("acceptance 10 — stale patches are rejected; approved patches roll back and recheck (REQ-WEB-04, REQ-SEO-04)", () => {
  it("rejects a change made against an outdated version instead of overwriting a human edit", async () => {
    const S = await siteWithHome();
    const ch = await proposeChange(S.actor, S.page.id, 1, [{ op: "set", path: "sections.hero.headline", value: "AI headline" }], "ai_edit", "shorter");
    const { doc } = await loadPage(S.ws.id, S.page.id);
    await saveVersion(S.actor, S.page.id, 1, { ...doc, sections: doc.sections.map((s) => (s.type === "hero" ? { ...s, headline: "Human edit" } : s)) }, "human");
    await expect(applyChange(S.actor, ch.id)).rejects.toBeInstanceOf(StaleVersionError);
    expect((await db.pageChange.findFirstOrThrow({ where: { workspaceId: S.ws.id, id: ch.id } })).status).toBe("stale");
    const after = await loadPage(S.ws.id, S.page.id);
    expect(after.doc.sections.find((s) => s.type === "hero")).toMatchObject({ headline: "Human edit" });
  });

  it("concurrent saves on the same base: exactly one wins", async () => {
    const S = await siteWithHome();
    const { doc } = await loadPage(S.ws.id, S.page.id);
    const rs = await Promise.allSettled([saveVersion(S.actor, S.page.id, 1, doc, "human"), saveVersion(S.actor, S.page.id, 1, doc, "human")]);
    expect(rs.filter((r) => r.status === "fulfilled")).toHaveLength(1);
  });

  it("audit → patch → approve → publish → recheck resolves; rollback restores the old version", async () => {
    const S = await siteWithHome();
    await startCrawl(S.actor, { siteId: S.site.id });
    await runDueJobs(handlers);
    const finding = await db.seoFinding.findFirstOrThrow({ where: { workspaceId: S.ws.id, rule: "title_long" } });
    expect(finding.pageId).toBe(S.page.id);
    expect(finding.impactHypothesis).not.toMatch(/guarantee[sd]? (rank|#1)/i);
    const change = await proposePatchForFinding(S.actor, finding.id);
    const v = await applyChange(S.actor, change.id);
    await publishVersion(S.actor, S.page.id, v);
    await startCrawl(S.actor, { siteId: S.site.id });
    await runDueJobs(handlers);
    expect((await db.seoFinding.findFirstOrThrow({ where: { workspaceId: S.ws.id, id: finding.id } })).status).toBe("resolved");

    const rolled = await rollbackTo(S.actor, S.page.id, 1, true);
    const page = await db.page.findFirstOrThrow({ where: { workspaceId: S.ws.id, id: S.page.id } });
    expect(page.publishedVersion).toBe(rolled);
    const html = (await buildRender({ siteSlug: S.site.slug, pageSlug: "home", which: "published", origin: "http://x", mode: "public" }))!.html;
    expect(html).toContain("x".repeat(65));
    expect((await db.pageChange.findFirstOrThrow({ where: { workspaceId: S.ws.id, id: change.id } })).status).toBe("rolled_back");
  });

  it("previews are noindex; drafts never reach the public site or sitemap", async () => {
    const S = await siteWithHome();
    await db.page.create({ data: { workspaceId: S.ws.id, siteId: S.site.id, slug: "draft-only", kind: "landing", draftVersion: 1, publishedVersion: null } });
    const preview = (await buildRender({ siteSlug: S.site.slug, pageSlug: "home", which: "draft", origin: "http://x", mode: "preview" }))!.html;
    expect(preview).toContain('content="noindex, nofollow"');
    expect(await buildRender({ siteSlug: S.site.slug, pageSlug: "draft-only", which: "published", origin: "http://x", mode: "public" })).toBeNull();
    expect(await sitemapEntries(S.site.slug, "http://x")).toEqual([`http://x/s/${S.site.slug}`]);
  });

  it("only approved facts render as proof; unreviewed statistics never appear", async () => {
    const S = await siteWithHome();
    const html = (await buildRender({ siteSlug: S.site.slug, pageSlug: "home", which: "published", origin: "http://x", mode: "public" }))!.html;
    expect(html).toContain("Licensed master plumber");
    expect(html).not.toContain("99%");
    const checks = heroChecks(templatePage(S.p, "home").sections, S.p);
    expect(checks.find((c) => c.label === "Proof is verified")?.pass).toBe(true);
  });

  it("escapes content and keeps structured data consistent with visible text", () => {
    const p = profile("<script>alert(1)</script> Co");
    const t = templatePage(p, "home");
    const page = applyPatch(t, [{ op: "set", path: "sections.hero.headline", value: '"><img src=x onerror=alert(1)>' }]);
    expect(page.sections[0]).toMatchObject({ headline: '"><img src=x onerror=alert(1)>' });
    const cp = parseHtml("http://x/s/a/", 200, `<html><head><title>T</title></head><body><h1>A</h1></body></html>`, "http://x");
    expect(cp.h1).toEqual(["A"]);
  });
});

describe("SEO rules (REQ-SEO-02)", () => {
  const base = { status: 200, title: "Water heater repair in Lakewood | Harbor", description: "d", h1: ["H"], canonical: "", noindex: false, wordCount: 400, internalLinks: [], schemaTypes: ["LocalBusiness"], inSitemap: true, textHash: "" };
  it("flags near-duplicate city pages and broken internal links", () => {
    const text = Array.from({ length: 80 }, (_, i) => `step ${i} we check the tank valve and flue`).join(" ");
    const f = auditPages([
      { ...base, url: "http://x/a", canonical: "http://x/a", shingles: shingles(text + " Lakewood"), internalLinks: ["http://x/gone"] },
      { ...base, url: "http://x/b", canonical: "http://x/b", title: "Other title", shingles: shingles(text + " Brick") },
      { ...base, url: "http://x/gone", status: 404 },
    ]);
    expect(f.map((x) => x.rule)).toEqual(expect.arrayContaining(["near_duplicate", "broken_internal_link", "error_status"]));
  });
});
