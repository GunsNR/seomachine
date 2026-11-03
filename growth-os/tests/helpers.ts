import bcrypt from "bcryptjs";
import { systemDb, db } from "@/lib/db";
import { AGENCY_STAGES, CLIENT_STAGES } from "@/lib/crm/pipelines";
import { touchFromRequest } from "@/lib/attribution";
import type { BrandProfile } from "@/lib/brand";

export async function resetDb() {
  const tables = await systemDb.$queryRaw<{ tablename: string }[]>`SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename <> '_prisma_migrations'`;
  await systemDb.$executeRawUnsafe(`TRUNCATE ${tables.map((t) => `"${t.tablename}"`).join(", ")} CASCADE`);
}

let n = 0;
export async function makeWorkspace(kind: "agency" | "client" = "client", role: "owner" | "member" | "client" = "owner") {
  n++;
  const ws = await systemDb.workspace.create({ data: { kind, name: `WS ${n}`, slug: `ws-${n}-${Date.now()}`, isFixture: true } });
  const user = await systemDb.user.create({ data: { email: `u${n}-${Date.now()}@example.test`, name: `User ${n}`, passwordHash: await bcrypt.hash("pw-123456789", 4) } });
  await systemDb.membership.create({ data: { userId: user.id, workspaceId: ws.id, role } });
  await db.pipeline.create({ data: { workspaceId: ws.id, name: "Sales", kind, stages: kind === "agency" ? AGENCY_STAGES : CLIENT_STAGES, isDefault: true } });
  return { ws, user, actor: { workspaceId: ws.id, userId: user.id, role } };
}

export const touch = (content = "", source = "google", medium = "organic") =>
  touchFromRequest({ landingPage: `https://example.test/plumbing?utm_source=${source}&utm_medium=${medium}&utm_campaign=fall&utm_content=${content}` });

export function profile(name = "Harbor Line Plumbing", over: Partial<BrandProfile> = {}): BrandProfile {
  return {
    businessName: name, industry: "home_services", voice: "Plain and practical.", audience: "Homeowners", offers: ["Free estimates on repiping"],
    serviceAreas: ["Lakewood", "Toms River"], prohibitedClaims: ["cheapest in town"], phone: "",
    facts: [
      { id: "f1", kind: "service", text: "Water heater repair", source: "client interview", provenance: "client_supplied", review: "approved", attribution: "" },
      { id: "f2", kind: "credential", text: "Licensed master plumber (fictional demo licence)", source: "client document", provenance: "document", review: "approved", attribution: "" },
      { id: "f3", kind: "statistic", text: "Fixes 99% of leaks same day", source: "inferred from website", provenance: "inferred", review: "needs_review", attribution: "" },
    ],
    theme: { primary: "#0b5d7a", primaryInk: "#ffffff", surface: "#ffffff", ink: "#14212b", muted: "#4b5a66", font: "system-sans", radius: "small" },
    ...over,
  };
}

export async function makeBrand(workspaceId: string, userId: string, p = profile()) {
  const brand = await db.brand.create({ data: { workspaceId, name: p.businessName, slug: `b-${Math.random().toString(36).slice(2, 8)}` } });
  const v = await db.brandVersion.create({ data: { workspaceId, brandId: brand.id, version: 1, profile: p, createdById: userId, approvedAt: new Date() } });
  await db.brand.update({ where: { id: brand.id, workspaceId }, data: { currentVersionId: v.id } });
  return { brand, version: v };
}
