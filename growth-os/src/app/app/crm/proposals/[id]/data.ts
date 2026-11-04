import { z } from "zod";
import { db } from "@/lib/db";
import { LineItemSchema } from "@/lib/offers";

export async function loadProposal(workspaceId: string, id: string) {
  const p = await db.proposal.findFirst({ where: { workspaceId, id }, include: { versions: { orderBy: { version: "desc" } } } });
  if (!p) return null;
  const cur = p.versions.find((v) => v.version === p.currentVersion)!;
  const opp = await db.opportunity.findFirst({ where: { workspaceId, id: p.opportunityId }, include: { contact: true } });
  return { p, cur, items: z.array(LineItemSchema).parse(cur.lineItems), deliverables: z.array(z.string()).parse(cur.deliverables), opp };
}
