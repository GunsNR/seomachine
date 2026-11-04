import { getContext } from "@/lib/auth";
import { db, systemDb } from "@/lib/db";
import { buildRender } from "@/lib/site/public";
import { requestOrigin } from "@/app/lib-origin";

export const dynamic = "force-dynamic";

/** Private preview: signed-in members of the page's own workspace only, never indexed. */
export async function GET(req: Request, { params }: { params: Promise<{ pageId: string }> }) {
  const ctx = await getContext();
  if (!ctx) return new Response("Sign in to preview.", { status: 401, headers: { "x-robots-tag": "noindex" } });
  const { pageId } = await params;
  const page = await db.page.findFirst({ where: { workspaceId: ctx.workspace.id, id: pageId } });
  if (!page) return new Response("Not found in this workspace.", { status: 404, headers: { "x-robots-tag": "noindex" } });
  const site = await systemDb.site.findFirst({ where: { id: page.siteId, workspaceId: ctx.workspace.id } });
  const v = Number(new URL(req.url).searchParams.get("v"));
  const r = await buildRender({ siteSlug: site!.slug, pageSlug: page.slug, which: Number.isInteger(v) && v > 0 ? v : "draft", origin: await requestOrigin(), mode: "preview", workspaceId: ctx.workspace.id });
  if (!r) return new Response("That version doesn't exist.", { status: 404 });
  return new Response(r.html, { headers: { "content-type": "text/html; charset=utf-8", "x-robots-tag": "noindex, nofollow", "cache-control": "private, no-store" } });
}
