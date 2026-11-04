import { getContext } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { db } from "@/lib/db";
import { buildRender } from "@/lib/site/public";

/** Download a page as a standalone HTML file (the content/code export path). */
export async function GET(req: Request, { params }: { params: Promise<{ pageId: string }> }) {
  const ctx = await getContext();
  if (!ctx || !can(ctx.role, "site.write")) return new Response("Not allowed", { status: 403 });
  const { pageId } = await params;
  const page = await db.page.findFirst({ where: { workspaceId: ctx.workspace.id, id: pageId }, include: { site: true } });
  if (!page) return new Response("Not found", { status: 404 });
  const origin = new URL(req.url).searchParams.get("origin") || "https://example.com";
  const r = await buildRender({ siteSlug: page.site.slug, pageSlug: page.slug, which: page.publishedVersion ?? "draft", origin: /^https:\/\/[a-z0-9.-]+$/i.test(origin) ? origin : "https://example.com", mode: "export", workspaceId: ctx.workspace.id });
  if (!r) return new Response("Not found", { status: 404 });
  return new Response(r.html, { headers: { "content-type": "text/html; charset=utf-8", "content-disposition": `attachment; filename="${page.slug}.html"` } });
}
