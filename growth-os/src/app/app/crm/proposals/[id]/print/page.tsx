import { notFound } from "next/navigation";
import { requireStaffPage } from "@/lib/auth";
import { displayName } from "@/lib/normalize";
import { summarize } from "@/lib/offers";
import { formatMoney } from "@/lib/money";
import { formatDate } from "@/lib/time";
import { db } from "@/lib/db";
import { loadProposal } from "../data";
import { PrintButton } from "./print-button";

export const metadata = { title: "Proposal export" };

export default async function PrintProposal({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireStaffPage("crm.read");
  const { id } = await params;
  const d = await loadProposal(ctx.workspace.id, id);
  if (!d) notFound();
  const brand = await db.brand.findFirst({ where: { workspaceId: ctx.workspace.id } });
  const s = summarize(d.items);
  const c = d.cur.currency;
  return (
    <div className="fixed inset-0 z-50 overflow-auto bg-white text-ink print:static">
      <div className="mx-auto max-w-[760px] px-8 py-10 text-[15px] leading-relaxed">
        <div className="mb-8 flex items-start justify-between print:hidden"><p className="text-xs text-ink-2">Print this page or choose “Save as PDF”.</p><PrintButton /></div>
        <p className="text-sm text-ink-2">{brand?.name ?? ctx.workspace.name} · Proposal v{d.p.currentVersion} · {formatDate(d.cur.createdAt, ctx.workspace.timezone)}</p>
        <h1 className="mt-2 text-2xl font-semibold">{d.p.title}</h1>
        {d.opp ? <p className="mt-1 text-ink-2">Prepared for {displayName(d.opp.contact)}</p> : null}
        <h2 className="mt-8 text-base font-semibold">Scope</h2><p className="whitespace-pre-wrap">{d.cur.scope || "—"}</p>
        <h2 className="mt-6 text-base font-semibold">Deliverables</h2>
        <ul className="list-disc pl-5">{d.deliverables.map((x) => <li key={x}>{x}</li>)}</ul>
        <h2 className="mt-6 text-base font-semibold">Investment</h2>
        <table className="mt-2 w-full border-collapse text-sm">
          <tbody>
            {d.items.map((it, i) => (
              <tr key={i} className="border-b border-line">
                <td className="py-2 pr-4">{it.label}<span className="block text-2xs text-ink-2">{it.kind === "retainer" ? `Every ${it.interval}, ${it.termMonths}-month term` : it.kind === "one_time" ? "One-time" : `Per ${it.unit}${it.terms.capMinor ? `, capped at ${formatMoney(it.terms.capMinor, c)} per month` : ""}`}</span></td>
                <td className="py-2 text-right num">{formatMoney(it.kind === "performance" ? it.unitAmountMinor : it.amountMinor, c)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {d.items.filter((i) => i.kind === "performance").map((it, i) => it.kind === "performance" ? (
          <div key={i} className="mt-4 rounded border border-line p-3 text-xs"><p className="font-semibold">How “{it.label}” is measured</p><p>Metric: {it.terms.metric ?? "—"}. Baseline: {it.terms.baseline ?? "—"}. Source: {it.terms.source ?? "—"}. Window: {it.terms.attributionWindowDays ?? "—"} days. Exclusions: {it.terms.exclusions ?? "—"}. Approval: {it.terms.approvalRule ?? "—"}.</p></div>
        ) : null)}
        <p className="mt-6 text-sm">One-time: {formatMoney(s.oneTime, c)} · Monthly: {formatMoney(s.recurringMonthly, c)}{s.hasPerformance ? " · plus performance fees as measured above" : ""}</p>
        <p className="mt-8 text-2xs text-ink-2">No ranking, traffic or revenue outcome is guaranteed. Results depend on factors outside either party’s control.</p>
      </div>
    </div>
  );
}
