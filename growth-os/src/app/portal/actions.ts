"use server";
import { requirePermission } from "@/lib/auth";
import { runAction, str } from "@/lib/actions";
import { recordOutcome, recordPayment } from "@/lib/crm/ops";
import { parseMoney } from "@/lib/money";
import { applyChange, rejectChange } from "@/lib/site/pages";

const actor = (c: { workspace: { id: string }; userId: string; role: string }) => ({ workspaceId: c.workspace.id, userId: c.userId, role: c.role });

/** One-tap confirmations for the client. Every entry records who confirmed it and when. */
export async function confirmAction(f: FormData) {
  const ctx = await requirePermission("outcome.confirm");
  await runAction("/portal", async () => {
    const id = str(f, "opportunityId");
    const kind = str(f, "kind");
    const cur = ctx.workspace.currency;
    if (kind === "qualified" || kind === "unqualified" || kind === "lost") await recordOutcome(actor(ctx), id, kind, { note: kind === "lost" ? str(f, "note") || "Confirmed lost by client" : "" });
    else if (kind === "won") {
      await recordOutcome(actor(ctx), id, "won");
      if (str(f, "value")) await recordOutcome(actor(ctx), id, "job_value", { valueMinor: parseMoney(str(f, "value"), cur), currency: cur });
    } else if (kind === "paid") await recordPayment(actor(ctx), id, { kind: "payment", amountMinor: parseMoney(str(f, "amount"), cur), currency: cur, receivedAt: new Date() });
    else throw new Error("Pick what happened.");
    return "Thanks — saved with your name and today's date.";
  });
}

export async function portalChangeAction(f: FormData) {
  const ctx = await requirePermission("site.approve");
  await runAction("/portal/approvals", async () => {
    if (str(f, "decision") === "apply") { await applyChange(actor(ctx), str(f, "changeId")); return "Approved. The agency will publish it."; }
    await rejectChange(actor(ctx), str(f, "changeId"));
    return "Change declined";
  });
}
