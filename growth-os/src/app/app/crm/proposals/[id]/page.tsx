import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Printer } from "lucide-react";
import { requireStaffPage } from "@/lib/auth";
import { displayName } from "@/lib/normalize";
import { sendBlockers, summarize, type LineItem } from "@/lib/offers";
import { formatMoney } from "@/lib/money";
import { Flash, KeyVal, Money, Notice, PageHeader, Section, Status, SubmitButton, When } from "@/components/ui";
import { proposalSaveAction, proposalStatusAction } from "../../actions";
import { loadProposal } from "./data";

export const metadata = { title: "Proposal" };
const amt = (m: number, c: string) => (m / 100).toFixed(2).replace(/\.00$/, "") || formatMoney(m, c);

export default async function ProposalPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ ok?: string; error?: string }> }) {
  const ctx = await requireStaffPage("crm.read");
  const { id } = await params;
  const sp = await searchParams;
  const d = await loadProposal(ctx.workspace.id, id);
  if (!d) notFound();
  const { p, cur, items, deliverables, opp } = d;
  const s = summarize(items);
  const blockers = sendBlockers(items);
  const editable = p.status === "draft";
  const rows: (LineItem | null)[] = [...items, ...Array.from({ length: Math.max(1, 4 - items.length) }, () => null)].slice(0, 6);

  return (
    <>
      {opp ? <Link href={`/app/crm/contacts/${opp.contactId}`} className="mb-3 inline-flex items-center gap-1 text-xs text-ink-2 hover:text-ink"><ArrowLeft aria-hidden className="h-3.5 w-3.5" />{displayName(opp.contact)}</Link> : null}
      <PageHeader title={p.title} description={<>Version {p.currentVersion} · <Status tone={p.status === "accepted" ? "ok" : p.status === "declined" || p.status === "expired" ? "bad" : p.status === "sent" ? "info" : "neutral"}>{p.status}</Status></>}
        actions={<Link className="btn-secondary" href={`/app/crm/proposals/${p.id}/print`} target="_blank"><Printer aria-hidden className="h-4 w-4" />Export (print or save as PDF)</Link>} />
      <Flash ok={sp.ok} error={sp.error} />
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
        <Section title={editable ? "Edit — saving creates a new version" : "Sent version (read-only)"}>
          <form action={proposalSaveAction} className="flex flex-col gap-4 p-4">
            <input type="hidden" name="proposalId" value={p.id} />
            <fieldset disabled={!editable} className="flex flex-col gap-4">
              <div><label className="label" htmlFor="scope">Scope</label><textarea id="scope" name="scope" rows={3} className="field" defaultValue={cur.scope} /></div>
              <div><label className="label" htmlFor="deliverables">Deliverables (one per line)</label><textarea id="deliverables" name="deliverables" rows={4} className="field" defaultValue={deliverables.join("\n")} /></div>
              <div>
                <p className="label">Price ({cur.currency})</p>
                <div className="flex flex-col gap-3">
                  {rows.map((it, i) => (
                    <fieldset key={i} className="rounded-ctl border border-line p-3">
                      <legend className="px-1 text-2xs text-ink-2">Line {i + 1}</legend>
                      <div className="grid gap-2 sm:grid-cols-[150px_minmax(0,1fr)_120px]">
                        <div><label className="sr-only" htmlFor={`k${i}`}>Type</label>
                          <select id={`k${i}`} name={`li${i}_kind`} defaultValue={it?.kind ?? ""} className="field"><option value="">— none —</option><option value="retainer">Recurring retainer</option><option value="one_time">One-time project</option><option value="performance">Performance-based</option></select></div>
                        <div><label className="sr-only" htmlFor={`l${i}`}>Label</label><input id={`l${i}`} name={`li${i}_label`} defaultValue={it?.label ?? ""} placeholder="What it is" className="field" /></div>
                        <div><label className="sr-only" htmlFor={`a${i}`}>Amount</label><input id={`a${i}`} name={`li${i}_amount`} inputMode="decimal" placeholder="Amount" className="field" defaultValue={it ? amt(it.kind === "performance" ? it.unitAmountMinor : it.amountMinor, cur.currency) : ""} /></div>
                      </div>
                      {it?.kind === "retainer" || !it ? (
                        <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
                          <label>Billed every <select name={`li${i}_interval`} defaultValue={it?.kind === "retainer" ? it.interval : "month"} className="field mt-1"><option value="month">month</option><option value="quarter">quarter</option></select></label>
                          <label>Term (months) <input name={`li${i}_term`} type="number" min={1} max={60} defaultValue={it?.kind === "retainer" ? it.termMonths : 6} className="field mt-1" /></label>
                        </div>
                      ) : null}
                      {it?.kind === "performance" ? (
                        <div className="mt-2 grid gap-2 text-xs sm:grid-cols-2">
                          {([["unit", "Paid per (unit)", it.unit], ["metric", "Metric", it.terms.metric], ["baseline", "Baseline", it.terms.baseline], ["source", "Where it's measured", it.terms.source], ["window", "Attribution window (days)", it.terms.attributionWindowDays], ["cap", `Monthly cap (${cur.currency})`, it.terms.capMinor ? amt(it.terms.capMinor, cur.currency) : ""], ["exclusions", "Exclusions", it.terms.exclusions], ["approval", "Who approves each invoice", it.terms.approvalRule]] as const).map(([k, label, v]) => (
                            <label key={k}>{label}<input name={`li${i}_${k}`} defaultValue={v ?? ""} className="field mt-1" /></label>
                          ))}
                        </div>
                      ) : null}
                    </fieldset>
                  ))}
                </div>
                <p className="hint">Prices are whatever you set here. Nothing assumes past Rank Logic prices or guarantees.</p>
              </div>
            </fieldset>
            {editable ? <SubmitButton className="self-start">Save new version</SubmitButton> : null}
          </form>
        </Section>
        <div className="flex flex-col gap-5">
          <Section title="Summary">
            <dl className="px-4 py-2">
              <KeyVal k="One-time"><Money minor={s.oneTime} currency={cur.currency} /></KeyVal>
              <KeyVal k="Monthly"><Money minor={s.recurringMonthly} currency={cur.currency} /></KeyVal>
              <KeyVal k="Term value"><Money minor={s.termValueExcludingPerformance} currency={cur.currency} />{s.hasPerformance ? <span className="block text-2xs text-ink-2">Excludes performance fees — unknown until earned</span> : null}</KeyVal>
            </dl>
          </Section>
          <Section title="Status">
            <div className="flex flex-col gap-3 p-4">
              {editable && blockers.length ? <Notice tone="warn" title="Can't mark as sent yet">{blockers.map((b) => <p key={b}>{b}</p>)}</Notice> : null}
              <div className="flex flex-wrap gap-2">
                {(p.status === "draft" ? (["sent"] as const) : p.status === "sent" ? (["accepted", "declined", "expired"] as const) : ([] as const)).map((st) => (
                  <form key={st} action={proposalStatusAction}><input type="hidden" name="proposalId" value={p.id} /><input type="hidden" name="status" value={st} /><SubmitButton variant={st === "sent" || st === "accepted" ? "primary" : "secondary"}>{st === "sent" ? "Mark as sent" : `Mark ${st}`}</SubmitButton></form>
                ))}
              </div>
              <p className="hint">Marking sent doesn’t email anything. Export the document and send it yourself. E-signature isn’t connected.</p>
            </div>
          </Section>
          <Section title="Versions" count={p.versions.length}>
            <ul className="divide-y divide-line text-xs">{p.versions.map((v) => <li key={v.id} className="flex justify-between px-4 py-2"><span>v{v.version}</span><When at={v.createdAt} tz={ctx.workspace.timezone} short /></li>)}</ul>
          </Section>
        </div>
      </div>
    </>
  );
}
