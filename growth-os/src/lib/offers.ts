import { z } from "zod";

/**
 * Offer components. Prices are configured per proposal; nothing here assumes
 * a historical Rank Logic price, guarantee or term.
 */

export const PerformanceTermsSchema = z.object({
  metric: z.string().min(3),                       // e.g. "qualified leads confirmed by client"
  baseline: z.string().min(1),                     // e.g. "average of prior 90 days = 12/month"
  source: z.string().min(3),                       // where the metric is read from
  attributionWindowDays: z.number().int().min(1).max(365),
  capMinor: z.number().int().positive(),
  exclusions: z.string().min(1),
  approvalRule: z.string().min(3),                 // who approves each invoice
});

export const LineItemSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("retainer"), label: z.string().min(1), amountMinor: z.number().int().nonnegative(), interval: z.enum(["month", "quarter"]), termMonths: z.number().int().min(1).max(60) }),
  z.object({ kind: z.literal("one_time"), label: z.string().min(1), amountMinor: z.number().int().nonnegative() }),
  z.object({
    kind: z.literal("performance"),
    label: z.string().min(1),
    unitAmountMinor: z.number().int().nonnegative(),
    unit: z.string().min(1),
    terms: PerformanceTermsSchema.partial(),
  }),
]);
export type LineItem = z.infer<typeof LineItemSchema>;

export function performanceGaps(item: LineItem): string[] {
  if (item.kind !== "performance") return [];
  const r = PerformanceTermsSchema.safeParse(item.terms);
  return r.success ? [] : r.error.issues.map((i) => String(i.path[0]));
}

/** A proposal can be marked sent only when every performance component is fully specified. */
export function sendBlockers(items: LineItem[]): string[] {
  const out: string[] = [];
  items.forEach((it, i) => {
    const gaps = performanceGaps(it);
    if (gaps.length) out.push(`Line ${i + 1} (“${it.label}”) is performance-based and still needs: ${gaps.join(", ")}. It stays draft-only until these are set.`);
  });
  if (items.length === 0) out.push("Add at least one line item.");
  return out;
}

/** Contract value summary. Performance fees are never included — they are unknown until earned. */
export function summarize(items: LineItem[]) {
  let oneTime = 0;
  let recurringMonthly = 0;
  let termValue = 0;
  for (const it of items) {
    if (it.kind === "one_time") { oneTime += it.amountMinor; termValue += it.amountMinor; }
    if (it.kind === "retainer") {
      const monthly = it.interval === "month" ? it.amountMinor : Math.round(it.amountMinor / 3);
      recurringMonthly += monthly;
      termValue += it.interval === "month" ? it.amountMinor * it.termMonths : it.amountMinor * Math.ceil(it.termMonths / 3);
    }
  }
  return { oneTime, recurringMonthly, termValueExcludingPerformance: termValue, hasPerformance: items.some((i) => i.kind === "performance") };
}
