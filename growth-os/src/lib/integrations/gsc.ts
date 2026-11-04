import { db } from "../db";
import { parseCsv } from "../crm/intake";
import { randomToken } from "../crypto";
import { audit } from "../audit";

/**
 * Search Console CSV import (the documented manual fallback until the API
 * adapter exists). Accepts the Performance report's "Pages" or "Queries"
 * export. Figures are kept exactly as exported with their period and import
 * time; position is GSC's average position, not a rank.
 */
export type GscImport = { importId: string; rows: number; skipped: number; kind: "pages" | "queries" };

const num = (s: string | undefined) => {
  const v = Number(String(s ?? "").replace(/[,%\s]/g, ""));
  return Number.isFinite(v) ? v : NaN;
};

export async function importGscCsv(a: { workspaceId: string; userId: string }, input: { property: string; periodStart: Date; periodEnd: Date; csv: string }): Promise<GscImport> {
  if (!/^(https?:\/\/|sc-domain:)/.test(input.property)) throw new Error("Use the property exactly as Search Console shows it (https://… or sc-domain:…).");
  if (!(input.periodEnd > input.periodStart)) throw new Error("The period end must be after its start.");
  const rows = parseCsv(input.csv);
  if (!rows.length) throw new Error("That file has no rows.");
  const first = rows[0]!;
  const pageKey = ["top_pages", "page", "pages", "url"].find((k) => k in first);
  const queryKey = ["top_queries", "query", "queries"].find((k) => k in first);
  if (!pageKey && !queryKey) throw new Error("This doesn't look like a Search Console Pages or Queries export (no “Top pages” or “Top queries” column).");
  if (!("clicks" in first) || !("impressions" in first)) throw new Error("The export needs Clicks and Impressions columns.");
  const importId = `gsc_${randomToken(6)}`;
  let skipped = 0;
  const data = rows.slice(0, 50_000).flatMap((r) => {
    const clicks = num(r.clicks);
    const impressions = num(r.impressions);
    const position = num(r.position);
    if (!Number.isFinite(clicks) || !Number.isFinite(impressions)) { skipped++; return []; }
    return [{ workspaceId: a.workspaceId, property: input.property, page: pageKey ? r[pageKey]! : "", query: queryKey ? r[queryKey]! : "", clicks: Math.round(clicks), impressions: Math.round(impressions), position: Number.isFinite(position) ? position : null, periodStart: input.periodStart, periodEnd: input.periodEnd, source: "csv_import", importId, importedById: a.userId }];
  });
  for (let i = 0; i < data.length; i += 1000) await db.gscRow.createMany({ data: data.slice(i, i + 1000) });
  await audit(a.workspaceId, a.userId, "gsc.import", "workspace", a.workspaceId, { importId, rows: data.length, skipped });
  return { importId, rows: data.length, skipped, kind: pageKey ? "pages" : "queries" };
}

const pathOf = (u: string) => {
  try { return new URL(u).pathname.replace(/\/$/, "") || "/"; } catch { return u; }
};

/**
 * Impressions and clicks for a page path from the most recent import, matched
 * by path. Owned pages are served at /s/<site>/<slug>; their public path is
 * /<slug>. Returns null when there is no data — never zero.
 */
export function hostOf(property: string): string {
  if (property.startsWith("sc-domain:")) return property.slice(10).toLowerCase().replace(/^www\./, "");
  try { return new URL(property).hostname.toLowerCase().replace(/^www\./, ""); } catch { return ""; }
}

/** Data is only ever matched to the site whose domain is the import's property — never across brands. */
export async function gscForPaths(workspaceId: string, paths: string[], host: string) {
  const h = host.toLowerCase().replace(/^www\./, "");
  if (!h) return null;
  const imports = await db.gscRow.findMany({ where: { workspaceId, page: { not: "" } }, orderBy: { importedAt: "desc" }, distinct: ["importId"], take: 20 });
  const latest = imports.find((r) => hostOf(r.property) === h);
  if (!latest) return null;
  const rows = await db.gscRow.findMany({ where: { workspaceId, importId: latest.importId, page: { not: "" } } });
  const byPath = new Map<string, { clicks: number; impressions: number; position: number | null }>();
  for (const r of rows) byPath.set(pathOf(r.page), { clicks: r.clicks, impressions: r.impressions, position: r.position });
  const out: Record<string, { clicks: number; impressions: number; position: number | null } | null> = {};
  for (const p of paths) out[p] = byPath.get(p.replace(/\/$/, "") || "/") ?? null;
  return { importId: latest.importId, property: latest.property, periodStart: latest.periodStart, periodEnd: latest.periodEnd, importedAt: latest.importedAt, byPath: out };
}

/** Map an owned-site URL (…/s/<site>/<slug>) to its public path (/<slug>). */
export function publicPathFor(url: string, siteSlug: string) {
  const p = pathOf(url);
  const rest = p.replace(new RegExp(`^/s/${siteSlug.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`), "");
  return rest || "/";
}
