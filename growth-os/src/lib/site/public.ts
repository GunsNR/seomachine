import { db, systemDb } from "../db";
import { BrandProfileSchema, ThemeSchema } from "../brand";
import { MetaSchema, SectionsSchema } from "./sections";
import { renderPageHtml, type RenderInput } from "./render";

export function siteBase(origin: string, siteSlug: string) {
  return `${origin.replace(/\/$/, "")}/s/${siteSlug}`;
}

const LABEL: Record<string, string> = { home: "Home", service: "Services", about: "About", contact: "Contact", landing: "Offer", area: "Areas", blog: "Blog" };

/**
 * Build render input for a page. which="published" for the public site,
 * "draft" or an explicit version for preview. Public resolution starts from
 * the globally unique site slug (systemDb), then every read is re-scoped to
 * that site's workspace.
 */
export async function buildRender(opts: { siteSlug: string; pageSlug: string; which: "published" | "draft" | number; origin: string; mode: RenderInput["mode"]; workspaceId?: string }): Promise<{ html: string; workspaceId: string; pageId: string; version: number } | null> {
  const site = await systemDb.site.findUnique({ where: { slug: opts.siteSlug } });
  if (!site || (opts.workspaceId && site.workspaceId !== opts.workspaceId)) return null;
  const ws = site.workspaceId;
  const page = await db.page.findFirst({ where: { workspaceId: ws, siteId: site.id, slug: opts.pageSlug || "home" } });
  if (!page) return null;
  const versionNo = opts.which === "published" ? page.publishedVersion : opts.which === "draft" ? page.draftVersion : opts.which;
  if (versionNo === null || versionNo === undefined) return null;
  const v = await db.pageVersion.findFirst({ where: { workspaceId: ws, pageId: page.id, version: versionNo } });
  const brand = await db.brand.findFirst({ where: { workspaceId: ws, id: site.brandId } });
  const bv = brand?.currentVersionId ? await db.brandVersion.findFirst({ where: { workspaceId: ws, id: brand.currentVersionId } }) : null;
  if (!v || !bv) return null;
  const profile = BrandProfileSchema.parse(bv.profile);
  const navPages = (await db.page.findMany({ where: { workspaceId: ws, siteId: site.id, publishedVersion: { not: null } }, orderBy: { createdAt: "asc" } }))
    .map((p) => ({ slug: p.slug, label: LABEL[p.kind] ?? p.slug }));
  const html = renderPageHtml({
    siteSlug: site.slug, siteName: site.name, baseUrl: siteBase(opts.origin, site.slug), pageSlug: page.slug,
    sections: SectionsSchema.parse(v.sections), meta: MetaSchema.parse(v.meta), brand: profile, theme: ThemeSchema.parse(site.theme),
    mode: opts.mode, formAction: opts.mode === "export" ? `${(process.env.APP_ORIGIN || opts.origin).replace(/\/$/, "")}/api/forms/${site.slug}` : `/api/forms/${site.slug}`, navPages,
  });
  return { html, workspaceId: ws, pageId: page.id, version: versionNo };
}

/** Published, indexable pages for the per-site sitemap. Drafts and noindex pages are never listed. */
export async function sitemapEntries(siteSlug: string, origin: string): Promise<string[] | null> {
  const site = await systemDb.site.findUnique({ where: { slug: siteSlug } });
  if (!site) return null;
  const pages = await db.page.findMany({ where: { workspaceId: site.workspaceId, siteId: site.id, publishedVersion: { not: null } } });
  const out: string[] = [];
  for (const p of pages) {
    const v = await db.pageVersion.findFirst({ where: { workspaceId: site.workspaceId, pageId: p.id, version: p.publishedVersion! } });
    if (v && !MetaSchema.parse(v.meta).noindex) out.push(p.slug === "home" ? siteBase(origin, siteSlug) : `${siteBase(origin, siteSlug)}/${p.slug}`);
  }
  return out;
}
