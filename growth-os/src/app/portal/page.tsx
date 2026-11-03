import { requirePortalPage } from "@/lib/auth";
import { db } from "@/lib/db";
import { displayName } from "@/lib/normalize";
import { parseStages } from "@/lib/crm/pipelines";
import { Empty, Flash, Money, Status, SubmitButton, When } from "@/components/ui";
import { confirmAction } from "./actions";

export const metadata = { title: "Leads to confirm" };

export default async function Portal({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  const ctx = await requirePortalPage();
  const sp = await searchParams;
  const tz = ctx.workspace.timezone;
  const since = new Date(Date.now() - 60 * 86400000);
  const opps = await db.opportunity.findMany({ where: { workspaceId: ctx.workspace.id, createdAt: { gte: since } }, include: { contact: true, pipeline: true }, orderBy: { createdAt: "desc" }, take: 50 });
  const pays = await db.payment.findMany({ where: { workspaceId: ctx.workspace.id, opportunityId: { in: opps.map((o) => o.id) } } });
  const needs = opps.filter((o) => o.qualification === "unknown" || (o.status === "won" && !pays.some((p) => p.opportunityId === o.id)));
  const rest = opps.filter((o) => !needs.includes(o));
  const card = (o: (typeof opps)[number], prompt: boolean) => {
    const stage = parseStages(o.pipeline.stages).find((s) => s.id === o.stageId);
    const paid = pays.filter((p) => p.opportunityId === o.id).reduce((s, p) => s + (p.kind === "payment" ? p.amountMinor : -p.amountMinor), 0);
    return (
      <li key={o.id} className="panel p-4">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0"><p className="font-semibold [overflow-wrap:anywhere]">{displayName(o.contact)}</p><p className="text-sm text-ink-2">{o.title}</p><p className="text-2xs text-ink-2">Came in <When at={o.createdAt} tz={tz} short /></p></div>
          <Status tone={o.status === "won" ? "ok" : o.status === "lost" ? "bad" : "neutral"}>{stage?.name}</Status>
        </div>
        <div className="mt-2 flex flex-wrap gap-2 text-2xs text-ink-2">
          <span>Real lead? {o.qualification === "unknown" ? "not confirmed" : o.qualification === "qualified" ? "yes" : "no"}</span>
          {o.estimatedValueMinor ? <span>· Job value <Money minor={o.estimatedValueMinor} currency={o.currency} /></span> : null}
          {paid ? <span>· Paid <Money minor={paid} currency={o.currency} /></span> : null}
        </div>
        {prompt ? (
          <div className="mt-3 flex flex-col gap-2">
            {o.qualification === "unknown" ? (
              <div className="grid grid-cols-2 gap-2">
                <form action={confirmAction}><input type="hidden" name="opportunityId" value={o.id} /><input type="hidden" name="kind" value="qualified" /><SubmitButton variant="secondary" className="w-full">Real lead</SubmitButton></form>
                <form action={confirmAction}><input type="hidden" name="opportunityId" value={o.id} /><input type="hidden" name="kind" value="unqualified" /><SubmitButton variant="secondary" className="w-full">Not a real lead</SubmitButton></form>
              </div>
            ) : null}
            {o.status === "open" ? (
              <details className="rounded-ctl border border-line px-3 py-2"><summary className="cursor-pointer text-sm font-medium">We won this job</summary>
                <form action={confirmAction} className="mt-2 flex items-end gap-2"><input type="hidden" name="opportunityId" value={o.id} /><input type="hidden" name="kind" value="won" /><div className="flex-1"><label className="label" htmlFor={`v-${o.id}`}>Job value ({ctx.workspace.currency}, optional)</label><input id={`v-${o.id}`} name="value" inputMode="decimal" className="field" /></div><SubmitButton>Save</SubmitButton></form>
              </details>
            ) : null}
            {o.status === "won" && !paid ? (
              <form action={confirmAction} className="flex items-end gap-2"><input type="hidden" name="opportunityId" value={o.id} /><input type="hidden" name="kind" value="paid" /><div className="flex-1"><label className="label" htmlFor={`p-${o.id}`}>Payment received ({ctx.workspace.currency})</label><input id={`p-${o.id}`} name="amount" required inputMode="decimal" className="field" /></div><SubmitButton>Save</SubmitButton></form>
            ) : null}
            {o.status === "open" ? <form action={confirmAction}><input type="hidden" name="opportunityId" value={o.id} /><input type="hidden" name="kind" value="lost" /><SubmitButton variant="quiet">We didn’t get it</SubmitButton></form> : null}
          </div>
        ) : null}
      </li>
    );
  };
  return (
    <>
      <h1 className="text-xl font-semibold">Leads to confirm</h1>
      <p className="mb-4 text-sm text-ink-2">A tap each. This is how we report real results, not guesses. We record who confirmed it and when.</p>
      <Flash ok={sp.ok} error={sp.error} />
      {needs.length === 0 ? <div className="panel mb-5"><Empty title="You're all caught up">New leads will appear here for a quick check.</Empty></div> : <ul className="mb-6 flex flex-col gap-3">{needs.map((o) => card(o, true))}</ul>}
      {rest.length ? <><h2 className="mb-2 text-sm font-semibold">Already confirmed</h2><ul className="flex flex-col gap-3">{rest.map((o) => card(o, false))}</ul></> : null}
    </>
  );
}
