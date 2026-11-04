"use server";
import { z } from "zod";
import { requirePermission } from "@/lib/auth";
import { runAction, str } from "@/lib/actions";
import { db } from "@/lib/db";
import { createPiece, decide, editPiece, markPostedByHand, schedule, submitForReview } from "@/lib/content/publish";
import { templateVariants } from "@/lib/content/templates";
import { PLATFORMS, VariantSchema, AssetSchema, type Platform } from "@/lib/content/variants";
import { BrandProfileSchema } from "@/lib/brand";
import { parseLocalInput } from "@/lib/time";
import { slugify } from "@/lib/normalize";
import { randomToken } from "@/lib/crypto";
import { aiStatus } from "@/lib/ai/provider";
import { aiCaptions } from "@/lib/ai/tasks";

const actor = (c: { workspace: { id: string }; userId: string; role: string }) => ({ workspaceId: c.workspace.id, userId: c.userId, role: c.role });
const list = (s: string) => s.split(/[,\n]/).map((x) => x.trim()).filter(Boolean);

export async function newDraftAction(f: FormData) {
  const ctx = await requirePermission("content.write");
  await runAction("/app/content/new", async () => {
    const brand = await db.brand.findFirst({ where: { workspaceId: ctx.workspace.id, id: str(f, "brandId") } });
    if (!brand?.currentVersionId) throw new Error("Pick a brand with an approved profile.");
    const bv = await db.brandVersion.findFirst({ where: { workspaceId: ctx.workspace.id, id: brand.currentVersionId } });
    const profile = BrandProfileSchema.parse(bv!.profile);
    const platforms = f.getAll("platforms").map(String).filter((p): p is Platform => (PLATFORMS as readonly string[]).includes(p));
    if (!platforms.length) throw new Error("Pick at least one platform.");
    const q = str(f, "question");
    const destinationUrl = str(f, "destinationUrl");
    if (!q || !destinationUrl) throw new Error("Add the audience question and the page this should send people to.");
    try { new URL(destinationUrl); } catch { throw new Error("The destination must be a full web address (https://…)."); }
    const sourceUrl = str(f, "sourceUrl");
    const sourceIds: string[] = [];
    if (sourceUrl) {
      try { new URL(sourceUrl); } catch { throw new Error("The source must be a full web address."); }
      const src = await db.researchSource.create({ data: { workspaceId: ctx.workspace.id, brandId: brand.id, url: sourceUrl, title: str(f, "sourceTitle") || sourceUrl, retrievedAt: new Date(), excerpt: str(f, "sourceNote"), evidence: "discovery" } });
      sourceIds.push(src.id);
    }
    const contentKey = `${slugify(q).slice(0, 40)}-${randomToken(3).toLowerCase()}`;
    const brief = await db.contentBrief.create({ data: { workspaceId: ctx.workspace.id, brandId: brand.id, brandVersionId: bv!.id, objective: str(f, "objective") || "Leads", audienceQuestion: q, cta: str(f, "cta") || "Get in touch", destinationUrl, campaignKey: slugify(str(f, "campaign") || "general"), contentKey, sourceIds } });
    const t = templateVariants(profile, brief, platforms);
    if (t.blocked.length) throw new Error(`Draft not created: ${t.blocked.join("; ")}.`);
    let variants = t.variants;
    let generator: "template" | "ai" = "template";
    let note = "Draft created from the brand template (not AI).";
    if (aiStatus().live) {
      const sources = sourceIds.length ? await db.researchSource.findMany({ where: { workspaceId: ctx.workspace.id, id: { in: sourceIds } } }) : [];
      const ai = await aiCaptions({ workspaceId: ctx.workspace.id, brandVersionId: bv!.id, profile, brief, platforms, sources: sources.map((s) => ({ url: s.url, excerpt: s.excerpt })) });
      if ("variants" in ai) { variants = ai.variants; generator = "ai"; note = "AI draft created from approved brand facts. Check every claim before sending it for review."; }
      else note = `AI draft not used — ${ai.error} A template draft was created instead.`;
    }
    const piece = await createPiece(actor(ctx), { brandId: brand.id, briefId: brief.id, title: q.slice(0, 120), variants, asset: t.asset, generator });
    return { to: `/app/content/${piece.id}`, ok: note };
  });
}

export async function savePieceAction(f: FormData) {
  const ctx = await requirePermission("content.write");
  const id = str(f, "pieceId");
  await runAction(`/app/content/${id}`, async () => {
    const platforms = f.getAll("platform").map(String);
    const variants = platforms.map((p) => VariantSchema.parse({ platform: p, caption: str(f, `${p}_caption`), hook: str(f, `${p}_hook`), hashtags: list(str(f, `${p}_hashtags`)).map((h) => h.replace(/^#/, "")), mentions: list(str(f, `${p}_mentions`)), internalTags: list(str(f, `${p}_internal`)), title: str(f, `${p}_title`) }));
    const slides = z.array(z.object({ heading: z.string(), body: z.string() })).parse([0, 1, 2, 3, 4].map((i) => ({ heading: str(f, `slide${i}_heading`), body: str(f, `slide${i}_body`) })).filter((s) => s.heading));
    const asset = slides.length ? AssetSchema.parse({ kind: slides.length > 1 ? "carousel" : "single", slides, footer: str(f, "footer"), license: str(f, "license") || "Original — generated from brand text only" }) : null;
    const r = await editPiece(actor(ctx), id, { title: str(f, "title"), variants, asset });
    return r.changed ? "Saved as a new version. Any earlier approval no longer applies." : "No changes to save";
  });
}

export async function submitAction(f: FormData) {
  const ctx = await requirePermission("content.write");
  const id = str(f, "pieceId");
  await runAction(`/app/content/${id}`, async () => { await submitForReview(actor(ctx), id); return "Sent for review"; });
}

export async function decideAction(f: FormData) {
  const ctx = await requirePermission("content.approve");
  const id = str(f, "pieceId");
  const to = str(f, "returnTo").startsWith("/portal") ? "/portal/approvals" : `/app/content/${id}`;
  await runAction(to, async () => {
    const decision = str(f, "decision") === "rejected" ? "rejected" : "approved";
    if (decision === "rejected" && !str(f, "note")) throw new Error("Add a short note saying what to change.");
    const when = str(f, "scheduleAt");
    await decide(actor(ctx), id, { decision, destinationIds: f.getAll("destinationIds").map(String), scheduleAt: when ? parseLocalInput(when, ctx.workspace.timezone) : null, note: str(f, "note") });
    return decision === "approved" ? "Approved for the selected destinations and time" : "Sent back with your note";
  });
}

export async function markPostedAction(f: FormData) {
  const ctx = await requirePermission("content.write");
  const id = str(f, "pieceId");
  await runAction(`/app/content/${id}`, async () => { await markPostedByHand(actor(ctx), str(f, "publicationId"), str(f, "url")); return "Recorded as posted by hand"; });
}

export async function scheduleAction(f: FormData) {
  const ctx = await requirePermission("content.approve");
  const id = str(f, "pieceId");
  await runAction(`/app/content/${id}`, async () => { const ids = await schedule(actor(ctx), id); return `Queued for ${ids.length} destination${ids.length > 1 ? "s" : ""}. The worker re-checks the approval before each one.`; });
}
