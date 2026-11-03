import * as cheerio from "cheerio";
import { db } from "../db";
import { sha256, redact } from "../crypto";
import { auditPages, shingles, type CrawledPage } from "./rules";
import { buildRender, sitemapEntries, siteBase } from "../site/public";
import { safeGet } from "../net";
import { enqueue } from "../jobs/queue";

export const MAX_CRAWL_PAGES = 50;
/** Origin used for owned-site crawls. Rendering is in-process — no network request. */
export const OWNED_ORIGIN = "https://owned.invalid";

export function parseHtml(url: string, status: number, html: string, origin: string): CrawledPage {
  const $ = cheerio.load(html);
  const robots = ($('meta[name="robots"]').attr("content") ?? "").toLowerCase();
  $("script,style,noscript").remove();
  const text = $("body").text().replace(/\s+/g, " ").trim();
  const links = new Set<string>();
  $("a[href]").each((_, a) => {
    try {
      const u = new URL($(a).attr("href")!, url);
      if (u.origin === new URL(origin).origin) links.add(u.toString().replace(/#.*$/, ""));
    } catch { /* ignore malformed */ }
  });
  const $$ = cheerio.load(html);
  const schemaTypes: string[] = [];
  $$('script[type="application/ld+json"]').each((_, s) => {
    try {
      const j = JSON.parse($$(s).text());
      if (j["@type"]) schemaTypes.push(String(j["@type"]));
    } catch { /* invalid JSON-LD is itself a signal, reported as missing */ }
  });
  return {
    url, status, title: $$("title").first().text().trim(), description: ($$('meta[name="description"]').attr("content") ?? "").trim(),
    h1: $$("h1").map((_, h) => $$(h).text().trim()).get(), canonical: ($$('link[rel="canonical"]').attr("href") ?? "").trim(),
    noindex: robots.includes("noindex"), wordCount: text ? text.split(" ").length : 0, internalLinks: [...links], schemaTypes,
    inSitemap: false, textHash: sha256(text), shingles: shingles(text),
  };
}

export async function startCrawl(a: { workspaceId: string; userId: string }, input: { siteId?: string; rootUrl?: string; maxPages?: number }) {
  const maxPages = Math.min(Math.max(1, input.maxPages ?? 25), MAX_CRAWL_PAGES);
  let mode = "live";
  let rootUrl = input.rootUrl ?? "";
  if (input.siteId) {
    const site = await db.site.findFirst({ where: { workspaceId: a.workspaceId, id: input.siteId } });
    if (!site) throw new Error("Unknown site.");
    mode = "owned_preview";
    rootUrl = siteBase(OWNED_ORIGIN, site.slug);
  } else {
    const u = new URL(rootUrl);
    if (!["http:", "https:"].includes(u.protocol)) throw new Error("Enter an http(s) address.");
  }
  const run = await db.crawlRun.create({ data: { workspaceId: a.workspaceId, siteId: input.siteId, rootUrl, mode, maxPages } });
  await enqueue("seo.crawl", a.workspaceId, { id: run.id }, { idempotencyKey: `crawl:${run.id}` });
  return run;
}

async function crawlOwned(workspaceId: string, siteId: string, maxPages: number): Promise<CrawledPage[]> {
  const site = await db.site.findFirst({ where: { workspaceId, id: siteId } });
  if (!site) throw new Error("Unknown site.");
  const pages = await db.page.findMany({ where: { workspaceId, siteId, publishedVersion: { not: null } }, take: maxPages });
  const sitemap = new Set(((await sitemapEntries(site.slug, OWNED_ORIGIN)) ?? []).map((u) => u.replace(/\/$/, "")));
  const out: CrawledPage[] = [];
  for (const p of pages) {
    const r = await buildRender({ siteSlug: site.slug, pageSlug: p.slug, which: "published", origin: OWNED_ORIGIN, mode: "public", workspaceId });
    if (!r) continue;
    const url = p.slug === "home" ? siteBase(OWNED_ORIGIN, site.slug) : `${siteBase(OWNED_ORIGIN, site.slug)}/${p.slug}`;
    const cp = parseHtml(url, 200, r.html, OWNED_ORIGIN);
    cp.inSitemap = sitemap.has(url.replace(/\/$/, ""));
    out.push(cp);
  }
  // Linked-but-unpublished pages behave as 404 on the public site.
  const seen = new Set(out.map((p) => p.url.replace(/\/$/, "")));
  for (const l of new Set(out.flatMap((p) => p.internalLinks))) {
    const n = l.replace(/[#?].*$/, "").replace(/\/$/, "");
    if (!seen.has(n) && n.startsWith(siteBase(OWNED_ORIGIN, site.slug))) { out.push({ url: l, status: 404, title: "", description: "", h1: [], canonical: "", noindex: false, wordCount: 0, internalLinks: [], schemaTypes: [], inSitemap: false, textHash: "" }); seen.add(n); }
  }
  return out;
}

async function crawlLive(rootUrl: string, maxPages: number): Promise<CrawledPage[]> {
  const origin = new URL(rootUrl).origin;
  const queue = [rootUrl];
  const seen = new Set<string>();
  const out: CrawledPage[] = [];
  let sitemap = new Set<string>();
  try {
    const sm = await safeGet(`${origin}/sitemap.xml`, { maxBytes: 2_000_000 });
    if (sm.status === 200) sitemap = new Set([...sm.body.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]!.trim().replace(/\/$/, "")));
  } catch { /* no sitemap is a finding in itself, not a crash */ }
  while (queue.length && out.length < maxPages) {
    const url = queue.shift()!;
    if (seen.has(url)) continue;
    seen.add(url);
    try {
      const r = await safeGet(url);
      if (!r.contentType.includes("html")) continue;
      const cp = parseHtml(r.url, r.status, r.body, origin);
      cp.inSitemap = sitemap.has(r.url.replace(/\/$/, ""));
      out.push(cp);
      for (const l of cp.internalLinks) if (!seen.has(l) && queue.length < maxPages * 3) queue.push(l);
    } catch (e) {
      out.push({ url, status: 0, title: "", description: "", h1: [], canonical: "", noindex: false, wordCount: 0, internalLinks: [], schemaTypes: [], inSitemap: false, textHash: "", ...{ error: redact(String(e)) } } as CrawledPage);
    }
  }
  return out;
}

/** Worker handler. Writes pages and findings; resolves earlier open findings that no longer reproduce. */
export async function executeCrawl(workspaceId: string, runId: string) {
  const run = await db.crawlRun.findFirst({ where: { workspaceId, id: runId } });
  if (!run || run.status === "completed") return;
  await db.crawlRun.update({ where: { id: run.id, workspaceId }, data: { status: "running", startedAt: new Date() } });
  try {
    const pages = run.mode === "owned_preview" && run.siteId ? await crawlOwned(workspaceId, run.siteId, run.maxPages) : await crawlLive(run.rootUrl, run.maxPages);
    const now = new Date();
    const pageBySlug = run.siteId ? await db.page.findMany({ where: { workspaceId, siteId: run.siteId } }) : [];
    const site = run.siteId ? await db.site.findFirst({ where: { workspaceId, id: run.siteId } }) : null;
    const pageIdFor = (url: string) => {
      if (!site) return undefined;
      const slug = url.replace(siteBase(OWNED_ORIGIN, site.slug), "").replace(/^\//, "").replace(/\/$/, "") || "home";
      return pageBySlug.find((p) => p.slug === slug)?.id;
    };
    const findings = auditPages(pages, { intent: (u) => (/(contact|estimate|book|request)/.test(u) ? "conversion" : "discovery") });
    await db.$transaction(async (tx) => {
      for (const p of pages) {
        await tx.crawlPage.create({ data: { workspaceId, runId, url: p.url, status: p.status, title: p.title, description: p.description, h1: p.h1, canonical: p.canonical, noindex: p.noindex, wordCount: p.wordCount, internalLinks: p.internalLinks.slice(0, 200), schemaTypes: p.schemaTypes, inSitemap: p.inSitemap, textHash: p.textHash } });
      }
      const scopeRuns = (await tx.crawlRun.findMany({ where: { workspaceId, rootUrl: run.rootUrl }, select: { id: true } })).map((r) => r.id);
      const priorOpen = await tx.seoFinding.findMany({ where: { workspaceId, status: { in: ["open", "patch_proposed"] }, runId: { in: scopeRuns } } });
      const key = (rule: string, urls: string[]) => `${rule}|${[...urls].sort().join(",")}`;
      const current = new Set(findings.map((f) => key(f.rule, f.urls)));
      // A finding that no longer reproduces is resolved — this is the post-change verification.
      for (const f of priorOpen) if (!current.has(key(f.rule, f.urls))) await tx.seoFinding.update({ where: { id: f.id, workspaceId }, data: { status: "resolved" } });
      const stillOpen = new Set(priorOpen.filter((x) => current.has(key(x.rule, x.urls))).map((x) => key(x.rule, x.urls)));
      for (const f of findings) {
        if (stillOpen.has(key(f.rule, f.urls))) continue;
        await tx.seoFinding.create({ data: { workspaceId, runId, rule: f.rule, severity: f.severity, urls: f.urls, finding: f.finding, evidence: f.evidence as object, dataFreshness: now, businessIntent: f.businessIntent, proposedChange: f.proposedChange, impactHypothesis: f.impactHypothesis, effort: f.effort, risk: f.risk, verification: f.verification, pageId: pageIdFor(f.urls[0]!) } });
      }
    });
    await db.crawlRun.update({ where: { id: run.id, workspaceId }, data: { status: "completed", pagesCrawled: pages.length, finishedAt: new Date() } });
  } catch (e) {
    await db.crawlRun.update({ where: { id: run.id, workspaceId }, data: { status: "failed", error: redact(e instanceof Error ? e.message : String(e)), finishedAt: new Date() } });
  }
}
