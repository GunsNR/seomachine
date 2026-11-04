import { z } from "zod";
import { requirePortalPage } from "@/lib/auth";
import { db } from "@/lib/db";
import { VariantSchema, PLATFORM_LABEL } from "@/lib/content/variants";
import { describePatch, PatchOpSchema } from "@/lib/site/patch";
import { loadPage } from "@/lib/site/pages";
import { toLocalInput } from "@/lib/time";
import { Empty, Flash, Section, SubmitButton, When } from "@/components/ui";
import { decideAction } from "@/app/app/content/actions";
import { portalChangeAction } from "../actions";

export const metadata = { title: "Approvals" };

export default async function Approvals({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  const ctx = await requirePortalPage();
  const sp = await searchParams;
  const tz = ctx.workspace.timezone;
  const pieces = await db.contentPiece.findMany({ where: { workspaceId: ctx.workspace.id, status: "in_review" }, include: { versions: true } });
  const dests = await db.destination.findMany({ where: { workspaceId: ctx.workspace.id, status: { not: "not_connected" } } });
  const changes = await db.pageChange.findMany({ where: { workspaceId: ctx.workspace.id, status: "proposed" } });
  return (
    <>
      <h1 className="text-xl font-semibold">Approvals</h1>
      <p className="mb-4 text-sm text-ink-2">Approving covers exactly what you see here. If anything changes afterwards, it comes back to you.</p>
      <Flash ok={sp.ok} error={sp.error} />
      {pieces.length + changes.length === 0 ? <div className="panel"><Empty title="Nothing waiting for you" /></div> : null}
      <div className="flex flex-col gap-4">
        {pieces.map((p) => {
          const v = p.versions.find((x) => x.version === p.currentVersion)!;
          const variants = z.array(VariantSchema).parse(v.variants);
          const ds = dests.filter((d) => d.brandId === p.brandId && variants.some((x) => x.platform === d.platform));
          return (
            <Section key={p.id} title={p.title} action={<span className="text-2xs text-ink-2">v{v.version}</span>}>
              {variants.map((x) => <div key={x.platform} className="border-b border-line px-4 py-3"><p className="text-2xs font-medium text-ink-2">{PLATFORM_LABEL[x.platform]}</p><p className="whitespace-pre-wrap text-sm [overflow-wrap:anywhere]">{x.caption}</p></div>)}
              <form action={decideAction} className="flex flex-col gap-2 p-4">
                <input type="hidden" name="pieceId" value={p.id} /><input type="hidden" name="returnTo" value="/portal/approvals" />
                {ds.map((d) => <input key={d.id} type="hidden" name="destinationIds" value={d.id} />)}
                {p.scheduledFor ? <input type="hidden" name="scheduleAt" value={toLocalInput(p.scheduledFor, tz)} /> : null}
                <p className="text-xs text-ink-2">Goes to: {ds.map((d) => d.label).join(", ") || "no connected destination"}{p.scheduledFor ? <> · <When at={p.scheduledFor} tz={tz} /></> : null}</p>
                <label className="label" htmlFor={`n-${p.id}`}>Note (needed if you send it back)</label><input id={`n-${p.id}`} name="note" className="field" />
                <div className="grid grid-cols-2 gap-2"><SubmitButton name="decision" value="approved">Approve</SubmitButton><SubmitButton variant="secondary" name="decision" value="rejected">Send back</SubmitButton></div>
              </form>
            </Section>
          );
        })}
        {await Promise.all(changes.map(async (c) => {
          const { doc, page } = await loadPage(ctx.workspace.id, c.pageId);
          const lines = describePatch(doc, z.array(PatchOpSchema).parse(c.patch));
          return (
            <Section key={c.id} title={`Website change — /${page.slug === "home" ? "" : page.slug}`}>
              <ul className="divide-y divide-line px-4 text-sm">{lines.map((l, i) => <li key={i} className="py-2"><p className="text-2xs text-ink-2">{l.label}</p><p className="text-ink-2 line-through">{l.before}</p><p>{l.after}</p></li>)}</ul>
              <div className="grid grid-cols-2 gap-2 p-4">
                <form action={portalChangeAction}><input type="hidden" name="changeId" value={c.id} /><input type="hidden" name="decision" value="apply" /><SubmitButton className="w-full">Approve</SubmitButton></form>
                <form action={portalChangeAction}><input type="hidden" name="changeId" value={c.id} /><input type="hidden" name="decision" value="reject" /><SubmitButton variant="secondary" className="w-full">Decline</SubmitButton></form>
              </div>
            </Section>
          );
        }))}
      </div>
    </>
  );
}
