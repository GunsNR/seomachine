import { requireStaffPage } from "@/lib/auth";
import { db } from "@/lib/db";
import { outcomeReport } from "@/lib/reports";
import { parseLocalInput, toLocalInput, formatDate } from "@/lib/time";
import { Flash, FixtureTag, Money, PageHeader, Section, Status, SubmitButton, When } from "@/components/ui";
import { costAction } from "./actions";

export const metadata = { title: "Reports" };

async function monthRange(month: string | undefined, tz: string) {
  const now = toLocalInput(new Date(), tz);
  const [y, m] = (month && /^\d{4}-\d{2}$/.test(month) ? month : now.slice(0, 7)).split("-").map(Number) as [number, number];
  const from = parseLocalInput(`${y}-${String(m).padStart(2, "0")}-01T00:00`, tz);
  const to = parseLocalInput(m === 12 ? `${y + 1}-01-01T00:00` : `${y}-${String(m + 1).padStart(2, "0")}-01T00:00`, tz);
  return { from, to, key: `${y}-${String(m).padStart(2, "0")}` };
}

export default async function Reports({ searchParams }: { searchParams: Promise<{ month?: string; ok?: string; error?: string }> }) {
  const ctx = await requireStaffPage("reports.read");
  const sp = await searchParams;
  const tz = ctx.workspace.timezone;
  const { from, to, key } = await monthRange(sp.month, tz);
  const costs = await db.marketingCost.findMany({ where: { workspaceId: ctx.workspace.id, periodStart: { gte: from, lt: to } } });
  const costSum = costs.length ? { amountMinor: costs.reduce((s, c) => s + c.amountMinor, 0), currency: costs[0]!.currency } : null;
  const r = await outcomeReport(ctx.workspace.id, from, to, costSum);
  const stages = [
    { k: "Form submissions (new)", v: r.counts.submissions, note: `${r.counts.duplicatesIgnored} repeat submissions not counted` },
    { k: "Opportunities created", v: r.counts.opportunities },
    { k: "Confirmed qualified", v: r.counts.qualified },
    { k: "Appointments recorded", v: r.counts.appointments, note: "Manual records unless a calendar is connected" },
    { k: "Won", v: r.counts.won, note: "Won is not paid" },
    { k: "Payments recorded", v: r.counts.paymentsRecorded, note: `${r.counts.refunds} refund${r.counts.refunds === 1 ? "" : "s"}` },
  ];
  return (
    <>
      <PageHeader title="Reports" description={<>{ctx.workspace.kind === "agency" ? "Rank Logic's own sales" : `${ctx.workspace.name}'s results`} · {formatDate(from, tz)} – {formatDate(new Date(to.getTime() - 1), tz)} {ctx.workspace.isFixture ? <FixtureTag /> : null}</>}
        actions={<form className="flex items-end gap-2"><div><label className="label" htmlFor="month">Month</label><input id="month" name="month" type="month" defaultValue={key} className="field" /></div><button className="btn-secondary" type="submit">Show</button></form>} />
      <Flash ok={sp.ok} error={sp.error} />
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="flex min-w-0 flex-col gap-5">
          <Section title="What happened, step by step">
            <table className="table"><tbody>{stages.map((s) => <tr key={s.k}><th scope="row" className="!bg-transparent !text-sm !font-normal !text-ink">{s.k}{s.note ? <span className="block text-2xs text-ink-2">{s.note}</span> : null}</th><td className="text-right text-lg font-semibold num">{s.v}</td></tr>)}</tbody></table>
          </Section>
          <Section title="By source">
            <div className="overflow-x-auto">
              <table className="table">
                <thead><tr><th scope="col">Source (first touch on the opportunity)</th><th scope="col" className="text-right">Opportunities</th><th scope="col" className="text-right">Won</th><th scope="col" className="text-right">Collected, net</th></tr></thead>
                <tbody>{r.bySource.length === 0 ? <tr><td colSpan={4} className="text-center text-ink-2">No activity this month</td></tr> : r.bySource.map((s) => <tr key={s.source}><td>{s.source}</td><td className="text-right num">{s.opportunities}</td><td className="text-right num">{s.won}</td><td className="text-right">{Object.keys(s.collectedNet).length ? Object.entries(s.collectedNet).map(([c, v]) => <div key={c}><Money minor={v} currency={c} /></div>) : <span className="text-ink-2">—</span>}</td></tr>)}</tbody>
              </table>
            </div>
            <p className="border-t border-line px-4 py-2 text-2xs text-ink-2">One attribution model only, so nothing is counted twice. Collections are credited to the source of the opportunity they were paid against.</p>
          </Section>
        </div>
        <div className="flex min-w-0 flex-col gap-5">
          <Section title="Money">
            <dl className="px-4 py-3 text-sm">
              {Object.keys(r.collections).length === 0 ? <p className="text-ink-2">No payments recorded this month.</p> : Object.entries(r.collections).map(([c, v]) => (
                <div key={c} className="mb-2"><dt className="text-2xs text-ink-2">Collected ({c})</dt><dd className="text-xl font-semibold"><Money minor={v.net} currency={c} /></dd><dd className="text-2xs text-ink-2"><Money minor={v.gross} currency={c} /> received − <Money minor={v.refunds} currency={c} /> refunded</dd></div>
              ))}
              <div className="mt-3 border-t border-line pt-3">
                <dt className="text-2xs text-ink-2">{r.revenueToCost.label}</dt>
                <dd className="text-lg font-semibold">{r.revenueToCost.ratio === null ? <span className="text-sm font-normal text-ink-2">Unavailable — {r.revenueToCost.cost ? "no collected revenue in the same currency" : "enter this month's marketing cost"}</span> : <span className="num">{r.revenueToCost.ratio.toFixed(2)}×</span>}</dd>
                <dt className="mt-2 text-2xs text-ink-2">Profit ROI</dt><dd className="text-xs text-ink-2">{r.profitRoi.reason}</dd>
              </div>
            </dl>
            <form action={costAction} className="flex flex-wrap items-end gap-2 border-t border-line p-4">
              <input type="hidden" name="month" value={key} />
              <div className="flex-1"><label className="label" htmlFor="amount">Marketing cost this month ({ctx.workspace.currency})</label><input id="amount" name="amount" inputMode="decimal" required className="field" /></div>
              <SubmitButton variant="secondary">Add cost</SubmitButton>
              {costs.length ? <p className="hint w-full">Entered: {costs.map((c) => <span key={c.id}><Money minor={c.amountMinor} currency={c.currency} /> ({c.label}) </span>)}</p> : null}
            </form>
          </Section>
          <Section title="How complete is this?">
            <dl className="px-4 py-3 text-sm">
              <div className="flex justify-between py-1"><dt>Opportunities with a known source</dt><dd className="num">{r.attributionCoverage === null ? "—" : `${Math.round(r.attributionCoverage * 100)}%`}</dd></div>
              <div className="flex justify-between py-1"><dt>Confirmed by client</dt><dd className="num">{r.confirmations.client}</dd></div>
              <div className="flex justify-between py-1"><dt>Entered by agency</dt><dd className="num">{r.confirmations.agency}</dd></div>
              <div className="flex justify-between py-1"><dt>From a provider</dt><dd className="num">{r.confirmations.provider}</dd></div>
              <div className="flex justify-between py-1"><dt>Latest lead</dt><dd><When at={r.freshness.lastSubmission} tz={tz} short /></dd></div>
              <div className="flex justify-between py-1"><dt>Latest payment entry</dt><dd><When at={r.freshness.lastPayment} tz={tz} short /></dd></div>
            </dl>
            <div className="border-t border-line px-4 py-2"><Status>Social reach, clicks and GA4 traffic: not connected — shown as unavailable, not zero</Status></div>
          </Section>
        </div>
      </div>
    </>
  );
}
