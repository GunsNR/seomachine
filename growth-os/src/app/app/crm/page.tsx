import Link from "next/link";
import { Plus, Search } from "lucide-react";
import { requireStaffPage } from "@/lib/auth";
import { pipelineView } from "@/lib/crm/queries";
import { Empty, Flash, Money, OverdueBar, PageHeader, Status, Tabs, When } from "@/components/ui";
import { daysBetween } from "@/lib/time";
import { moveStageAction } from "./actions";

export const metadata = { title: "CRM" };

type SP = { view?: string; q?: string; filter?: string; sort?: string; ok?: string; error?: string };

export default async function Crm({ searchParams }: { searchParams: Promise<SP> }) {
  const ctx = await requireStaffPage("crm.read");
  const sp = await searchParams;
  const view = sp.view === "list" ? "list" : "board";
  const data = await pipelineView(ctx.workspace.id, { q: sp.q, filter: sp.filter, sort: sp.sort });
  const tz = ctx.workspace.timezone;
  const qs = (o: Partial<SP>) => "?" + new URLSearchParams(Object.entries({ view, q: sp.q, filter: sp.filter, sort: sp.sort, ...o }).filter(([, v]) => v) as [string, string][]).toString();
  const returnTo = `/app/crm${qs({})}`;
  const pipelineLabel = ctx.workspace.kind === "agency" ? "Rank Logic's own sales — prospects to clients" : `${ctx.workspace.name}'s customers — leads to jobs`;

  if (!data) return <><PageHeader title="CRM" /><Empty title="No pipeline yet">Create one in Settings.</Empty></>;
  const now = new Date();

  return (
    <>
      <PageHeader title="CRM" description={pipelineLabel} actions={<Link href="/app/crm/new" className="btn-primary"><Plus aria-hidden className="h-4 w-4" />Add a lead</Link>} />
      <Flash ok={sp.ok} error={sp.error} />
      <Tabs current={view} items={[{ key: "board", label: "Board", href: `/app/crm${qs({ view: "board" })}` }, { key: "list", label: "List", href: `/app/crm${qs({ view: "list" })}` }]} />

      <form role="search" className="mb-4 flex flex-wrap items-end gap-2" action="/app/crm">
        <input type="hidden" name="view" value={view} />
        <div className="min-w-[220px] flex-1">
          <label className="label" htmlFor="q">Search</label>
          <div className="relative">
            <Search aria-hidden className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-2" />
            <input id="q" name="q" defaultValue={sp.q} placeholder="Name, email, phone or inquiry" className="field pl-8" />
          </div>
        </div>
        <div>
          <label className="label" htmlFor="filter">Show</label>
          <select id="filter" name="filter" defaultValue={sp.filter ?? ""} className="field">
            <option value="">Everything</option><option value="open">Open only</option><option value="overdue">Overdue follow-up</option><option value="no_next">Open with no next step</option><option value="closed">Won or lost</option>
          </select>
        </div>
        <div>
          <label className="label" htmlFor="sort">Sort</label>
          <select id="sort" name="sort" defaultValue={sp.sort ?? ""} className="field">
            <option value="">Newest first</option><option value="oldest">Longest without activity</option><option value="value">Highest value</option>
          </select>
        </div>
        <button className="btn-secondary" type="submit">Apply</button>
        {sp.q || sp.filter || sp.sort ? <Link className="btn-quiet" href={`/app/crm?view=${view}`}>Clear</Link> : null}
      </form>

      {data.rows.length === 0 ? (
        <div className="panel"><Empty title={sp.q || sp.filter ? "Nothing matches" : "No leads yet"} action={<Link className="btn-secondary" href="/app/crm/new">Add a lead</Link>}>{sp.q || sp.filter ? "Try a different search or clear the filters." : "Leads from your forms, manual entries and CSV imports appear here."}</Empty></div>
      ) : view === "board" ? (
        <div className="relative -mx-4 overflow-x-auto px-4 pb-2 sm:mx-0 sm:px-0" tabIndex={0} role="region" aria-label="Pipeline board, scrolls sideways">
          <ol className="flex min-w-max gap-3">
            {data.stages.map((s) => {
              const cards = data.rows.filter((r) => r.stageId === s.id);
              return (
                <li key={s.id} className="flex w-[272px] shrink-0 flex-col rounded-panel border border-line bg-canvas/70">
                  <h2 className="flex items-center justify-between px-3 py-2.5 text-xs font-semibold">
                    <span>{s.name}</span><span className="font-normal text-ink-2 num">{cards.length}</span>
                  </h2>
                  <ul className="flex flex-col gap-2 px-2 pb-2">
                    {cards.length === 0 ? <li className="rounded-ctl border border-dashed border-line-strong px-3 py-4 text-center text-2xs text-ink-2">Empty</li> : null}
                    {cards.map((c) => (
                      <li key={c.id} className="rounded-ctl border border-line bg-surface p-3">
                        <Link href={`/app/crm/contacts/${c.contactId}`} className="block font-medium leading-snug hover:underline [overflow-wrap:anywhere]">{c.name}</Link>
                        <p className="mt-0.5 line-clamp-2 text-xs text-ink-2">{c.title}</p>
                        <div className="mt-2 flex flex-wrap items-center gap-1.5">
                          {c.overdue ? <OverdueBar days={Math.max(1, daysBetween(c.nextDue!, now))} /> : c.status === "open" && !c.nextTask ? <Status tone="warn">No next step</Status> : null}
                          {c.valueMinor ? <span className="text-2xs text-ink-2"><Money minor={c.valueMinor} currency={c.currency} compact /></span> : null}
                        </div>
                        <form action={moveStageAction} className="mt-2.5 flex gap-1.5">
                          <input type="hidden" name="opportunityId" value={c.id} />
                          <input type="hidden" name="returnTo" value={returnTo} />
                          <label className="sr-only" htmlFor={`st-${c.id}`}>Move {c.name} to stage</label>
                          <select id={`st-${c.id}`} name="stageId" defaultValue={c.stageId} className="field min-h-[32px] flex-1 py-0 text-xs">
                            {data.stages.filter((x) => x.type !== "lost").map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
                          </select>
                          <button type="submit" className="btn-secondary min-h-[32px] px-2 text-xs">Move</button>
                        </form>
                      </li>
                    ))}
                  </ul>
                </li>
              );
            })}
          </ol>
          <p className="mt-2 text-2xs text-ink-2">To mark a deal lost, open it — a short reason is required.</p>
        </div>
      ) : (
        <div className="panel overflow-x-auto">
          <table className="table">
            <thead><tr><th scope="col">Who</th><th scope="col">Inquiry</th><th scope="col">Stage</th><th scope="col">Next step</th><th scope="col">Source</th><th scope="col" className="text-right">Value</th><th scope="col">Last activity</th></tr></thead>
            <tbody>
              {data.rows.map((r) => (
                <tr key={r.id}>
                  <td className="max-w-[200px]"><Link className="font-medium hover:underline [overflow-wrap:anywhere]" href={`/app/crm/contacts/${r.contactId}`}>{r.name}</Link></td>
                  <td className="max-w-[260px] text-ink-2"><span className="line-clamp-2">{r.title}</span></td>
                  <td className="whitespace-nowrap">{data.stages.find((s) => s.id === r.stageId)?.name}</td>
                  <td className="min-w-[160px]">{r.nextTask ? <><span className="block truncate">{r.nextTask}</span>{r.overdue ? <OverdueBar days={Math.max(1, daysBetween(r.nextDue!, now))} /> : <span className="text-2xs text-ink-2"><When at={r.nextDue} tz={tz} short /></span>}</> : r.status === "open" ? <Status tone="warn">None</Status> : <span className="text-ink-2">—</span>}</td>
                  <td className="whitespace-nowrap text-ink-2">{r.source}</td>
                  <td className="text-right"><Money minor={r.valueMinor} currency={r.currency} /></td>
                  <td className="whitespace-nowrap text-ink-2"><When at={r.lastActivityAt} tz={tz} short /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
