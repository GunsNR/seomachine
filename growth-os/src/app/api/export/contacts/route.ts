import { getContext } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { db } from "@/lib/db";
import { csvCell } from "@/lib/crm/intake";
import { parseTouch, sourceLabel } from "@/lib/attribution";
import { audit } from "@/lib/audit";

/** CSV export of this workspace's contacts and opportunities. Staff only; audited. */
export async function GET() {
  const ctx = await getContext();
  if (!ctx || !can(ctx.role, "crm.read")) return new Response("Not allowed", { status: 403 });
  const opps = await db.opportunity.findMany({ where: { workspaceId: ctx.workspace.id }, include: { contact: true }, orderBy: { createdAt: "asc" }, take: 20000 });
  const head = ["contact_id", "first_name", "last_name", "email", "phone", "opportunity_id", "title", "status", "stage", "value_minor", "currency", "source", "campaign", "content", "created_at", "is_demo"];
  const lines = [head.join(",")].concat(opps.map((o) => { const t = parseTouch(o.attribution); return [o.contactId, o.contact.firstName, o.contact.lastName, o.contact.email, o.contact.phone, o.id, o.title, o.status, o.stageId, o.estimatedValueMinor ?? "", o.currency, sourceLabel(t), t?.campaign ?? "", t?.content ?? "", o.createdAt.toISOString(), o.isFixture].map(csvCell).join(","); }));
  await audit(ctx.workspace.id, ctx.userId, "export.contacts", "workspace", ctx.workspace.id, { rows: opps.length });
  return new Response(lines.join("\r\n"), { headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="contacts-${new Date().toISOString().slice(0, 10)}.csv"`, "cache-control": "no-store" } });
}
