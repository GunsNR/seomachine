import { buildRender, sitemapEntries, siteBase } from "@/lib/site/public";
import { requestOrigin } from "@/app/lib-origin";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ site: string; slug?: string[] }> }) {
  const { site, slug = [] } = await params;
  const origin = await requestOrigin();
  if (slug.length === 1 && slug[0] === "sitemap.xml") {
    const urls = await sitemapEntries(site, origin);
    if (!urls) return new Response("Not found", { status: 404 });
    const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls.map((u) => `<url><loc>${u}</loc></url>`).join("")}</urlset>`;
    return new Response(xml, { headers: { "content-type": "application/xml; charset=utf-8" } });
  }
  if (slug.length === 1 && slug[0] === "robots.txt") {
    return new Response(`User-agent: *\nAllow: /\nSitemap: ${siteBase(origin, site)}/sitemap.xml\n`, { headers: { "content-type": "text/plain; charset=utf-8" } });
  }
  if (slug.length > 1) return new Response("Not found", { status: 404 });
  const r = await buildRender({ siteSlug: site, pageSlug: slug[0] ?? "home", which: "published", origin, mode: "public" });
  if (!r) return new Response("<!doctype html><title>Page not found</title><p>This page isn't published.</p>", { status: 404, headers: { "content-type": "text/html; charset=utf-8", "x-robots-tag": "noindex" } });
  return new Response(r.html, { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "public, max-age=60" } });
}
