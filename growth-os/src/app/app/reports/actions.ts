"use server";
import { requirePermission } from "@/lib/auth";
import { runAction, str } from "@/lib/actions";
import { db } from "@/lib/db";
import { parseMoney } from "@/lib/money";
import { parseLocalInput } from "@/lib/time";

export async function costAction(f: FormData) {
  const ctx = await requirePermission("settings.manage");
  await runAction(`/app/reports?month=${str(f, "month")}`, async () => {
    const [y, m] = str(f, "month").split("-").map(Number);
    if (!y || !m) throw new Error("Pick a month.");
    const tz = ctx.workspace.timezone;
    const start = parseLocalInput(`${y}-${String(m).padStart(2, "0")}-01T00:00`, tz);
    const next = m === 12 ? `${y + 1}-01-01T00:00` : `${y}-${String(m + 1).padStart(2, "0")}-01T00:00`;
    await db.marketingCost.create({ data: { workspaceId: ctx.workspace.id, periodStart: start, periodEnd: parseLocalInput(next, tz), amountMinor: parseMoney(str(f, "amount"), ctx.workspace.currency), currency: ctx.workspace.currency, label: str(f, "label") || "Marketing cost", enteredById: ctx.userId } });
    return "Cost saved for that month";
  });
}
