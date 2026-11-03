import { getContext } from "@/lib/auth";
import { db } from "@/lib/db";
import { AssetSchema } from "@/lib/content/variants";
import { slideSvg } from "@/lib/content/svg";
import { ThemeSchema } from "@/lib/brand";

/** Branded slide export (SVG, 1080×1350), in the content's own brand theme. Members of the workspace only. */
export async function GET(req: Request, { params }: { params: Promise<{ versionId: string }> }) {
  const ctx = await getContext();
  if (!ctx) return new Response("Sign in first.", { status: 401 });
  const { versionId } = await params;
  const v = await db.contentVersion.findFirst({ where: { workspaceId: ctx.workspace.id, id: versionId } });
  if (!v?.asset) return new Response("Not found", { status: 404 });
  const piece = await db.contentPiece.findFirst({ where: { workspaceId: ctx.workspace.id, id: v.pieceId } });
  const site = piece ? await db.site.findFirst({ where: { workspaceId: ctx.workspace.id, brandId: piece.brandId } }) : null;
  const theme = ThemeSchema.parse(site?.theme ?? { primary: "#14212b", primaryInk: "#ffffff", surface: "#ffffff", ink: "#14212b", muted: "#4b5a66" });
  const i = Math.max(0, Number(new URL(req.url).searchParams.get("slide") ?? 0) || 0);
  const svg = slideSvg(AssetSchema.parse(v.asset), i, theme);
  const download = new URL(req.url).searchParams.has("download");
  return new Response(svg, { headers: { "content-type": "image/svg+xml", "cache-control": "private, max-age=60", "content-security-policy": "default-src 'none'; style-src 'unsafe-inline'", ...(download ? { "content-disposition": `attachment; filename="slide-${i + 1}.svg"` } : {}) } });
}
