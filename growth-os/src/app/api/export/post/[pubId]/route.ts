import { z } from "zod";
import { getContext } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { db } from "@/lib/db";
import { VariantSchema, AssetSchema, PLATFORM_LABEL } from "@/lib/content/variants";
import { requestOrigin } from "@/app/lib-origin";

/** Manual hand-off package: the exact approved text for one destination, plus image links. */
export async function GET(_req: Request, { params }: { params: Promise<{ pubId: string }> }) {
  const ctx = await getContext();
  if (!ctx || !can(ctx.role, "content.write")) return new Response("Not allowed", { status: 403 });
  const { pubId } = await params;
  const pub = await db.publication.findFirst({ where: { workspaceId: ctx.workspace.id, id: pubId } });
  if (!pub) return new Response("Not found", { status: 404 });
  const [v, d] = await Promise.all([db.contentVersion.findFirst({ where: { workspaceId: ctx.workspace.id, id: pub.versionId } }), db.destination.findFirst({ where: { workspaceId: ctx.workspace.id, id: pub.destinationId } })]);
  if (!v || !d) return new Response("Not found", { status: 404 });
  const variant = z.array(VariantSchema).parse(v.variants).find((x) => x.platform === d.platform);
  const asset = v.asset ? AssetSchema.parse(v.asset) : null;
  const origin = await requestOrigin();
  const text = [
    `POST PACKAGE — ${PLATFORM_LABEL[d.platform as keyof typeof PLATFORM_LABEL] ?? d.platform} — ${d.label}`,
    `Approved version: ${v.version} (do not edit before posting; edits need re-approval)`,
    "",
    variant?.title ? `TITLE\n${variant.title}\n` : "",
    "CAPTION",
    variant?.caption ?? "(no variant for this platform)",
    variant?.hashtags.length ? `\nHASHTAGS\n${variant.hashtags.map((h) => `#${h.replace(/^#/, "")}`).join(" ")}` : "",
    variant?.mentions.length ? `\nMENTIONS\n${variant.mentions.join(" ")}` : "",
    asset ? `\nIMAGES (SVG, open while signed in, then save)\n${asset.slides.map((_, i) => `${origin}/api/assets/${v.id}?slide=${i}&download=1`).join("\n")}\nImage source: ${asset.license}` : "",
    "",
    "After posting, paste the post's link in Growth OS → Content → this post → “Mark as posted”.",
  ].filter((x) => x !== "").join("\n");
  return new Response(text, { headers: { "content-type": "text/plain; charset=utf-8", "content-disposition": `attachment; filename="post-${d.platform}-v${v.version}.txt"`, "cache-control": "no-store" } });
}
