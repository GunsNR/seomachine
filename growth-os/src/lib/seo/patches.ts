import { db } from "../db";
import { BrandProfileSchema, approvedFacts } from "../brand";
import { loadPage, proposeChange } from "../site/pages";
import type { PatchOp } from "../site/patch";

type Actor = { workspaceId: string; userId: string; role: string };

/**
 * Turn an owned-site finding into a reviewable patch against the page's
 * current draft. External sites get a written proposal only — no write path.
 */
export async function proposePatchForFinding(a: Actor, findingId: string) {
  const f = await db.seoFinding.findFirst({ where: { workspaceId: a.workspaceId, id: findingId } });
  if (!f) throw new Error("Unknown finding.");
  if (!f.pageId) throw new Error("This finding is on a site we don't host. Use the written proposal instead.");
  const { page, doc } = await loadPage(a.workspaceId, f.pageId);
  const site = await db.site.findFirst({ where: { workspaceId: a.workspaceId, id: page.siteId } });
  const brand = site ? await db.brand.findFirst({ where: { workspaceId: a.workspaceId, id: site.brandId } }) : null;
  const bv = brand?.currentVersionId ? await db.brandVersion.findFirst({ where: { workspaceId: a.workspaceId, id: brand.currentVersionId } }) : null;
  const profile = bv ? BrandProfileSchema.parse(bv.profile) : null;
  const service = (profile && approvedFacts(profile, "service")[0]?.text) ?? doc.sections.find((s) => s.type === "hero")?.["headline" as never] ?? "Services";
  const area = profile?.serviceAreas[0] ?? "";
  const name = profile?.businessName ?? site?.name ?? "";
  let ops: PatchOp[] = [];
  switch (f.rule) {
    case "title_missing":
    case "title_long":
    case "title_duplicate": {
      const title = `${service}${area ? ` in ${area}` : ""} | ${name}`;
      ops = [{ op: "set", path: "meta.title", value: title.length > 60 ? `${service} | ${name}`.slice(0, 60) : title }];
      break;
    }
    case "description_missing":
      ops = [{ op: "set", path: "meta.description", value: `${name} provides ${String(service).toLowerCase()}${area ? ` in ${area}` : ""}. ${profile?.offers[0] ?? "Request a free estimate."}`.slice(0, 160) }];
      break;
    case "schema_missing":
      ops = [{ op: "set", path: "meta.schemaType", value: profile?.industry === "healthcare" ? "MedicalBusiness" : "LocalBusiness" }];
      break;
    case "canonical_missing":
    case "canonical_unknown_target":
      ops = [{ op: "set", path: "meta.canonicalPath", value: "" }];
      break;
    case "noindex_in_sitemap":
      ops = [{ op: "set", path: "meta.noindex", value: false }];
      break;
    default:
      throw new Error("This finding needs a human rewrite. The proposal describes what to change.");
  }
  return proposeChange(a, f.pageId, page.draftVersion, ops, "seo_patch", `${f.finding} ${f.proposedChange}`, f.id);
}
