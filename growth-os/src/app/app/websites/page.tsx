import Link from "next/link";
import { ExternalLink } from "lucide-react";
import { requireStaffPage } from "@/lib/auth";
import { db } from "@/lib/db";
import { Empty, Flash, PageHeader, Section, Status, SubmitButton, When } from "@/components/ui";
import { newPageAction } from "./actions";

export const metadata = { title: "Websites" };

export default async function Websites({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  const ctx = await requireStaffPage("site.write");
  const sp = await searchParams;
  const sites = await db.site.findMany({ where: { workspaceId: ctx.workspace.id }, include: { pages: { orderBy: { createdAt: "asc" } } } });
  const pending = await db.pageChange.groupBy({ by: ["pageId"], where: { workspaceId: ctx.workspace.id, status: "proposed" }, _count: true });
  return (
    <>
      <PageHeader title="Websites" description="Section-based pages in each client's own brand. Saving makes a draft; only Publish changes the live page." />
      <Flash ok={sp.ok} error={sp.error} />
      {sites.length === 0 ? <div className="panel"><Empty title="No site in this workspace">Sites are created per brand. The agency workspace usually has none.</Empty></div> : sites.map((s) => (
        <Section key={s.id} title={s.name} className="mb-5" action={<Link className="link inline-flex items-center gap-1 text-xs" href={`/s/${s.slug}`} target="_blank">Live site <ExternalLink aria-hidden className="h-3 w-3" /></Link>}>
          <div className="overflow-x-auto">
            <table className="table">
              <thead><tr><th scope="col">Page</th><th scope="col">Draft</th><th scope="col">Live</th><th scope="col">Waiting for review</th><th scope="col">Created</th></tr></thead>
              <tbody>
                {s.pages.map((p) => {
                  const n = pending.find((x) => x.pageId === p.id)?._count ?? 0;
                  return (
                    <tr key={p.id}>
                      <td><Link className="font-medium hover:underline" href={`/app/websites/${p.id}`}>/{p.slug === "home" ? "" : p.slug}</Link> <span className="text-2xs text-ink-2">{p.kind}</span></td>
                      <td className="num">v{p.draftVersion}</td>
                      <td>{p.publishedVersion ? (p.publishedVersion === p.draftVersion ? <Status tone="ok">v{p.publishedVersion} — up to date</Status> : <Status tone="warn">v{p.publishedVersion} — draft has changes</Status>) : <Status>Not published</Status>}</td>
                      <td>{n ? <Status tone="warn">{n} change{n > 1 ? "s" : ""}</Status> : <span className="text-ink-2">—</span>}</td>
                      <td className="text-ink-2"><When at={p.createdAt} tz={ctx.workspace.timezone} short /></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <form action={newPageAction} className="flex flex-wrap items-end gap-2 border-t border-line p-4">
            <input type="hidden" name="siteId" value={s.id} />
            <div className="min-w-[240px] flex-1"><label className="label" htmlFor={`svc-${s.id}`}>New service page</label><input id={`svc-${s.id}`} name="service" className="field" placeholder="e.g. Boiler service" /></div>
            <SubmitButton variant="secondary">Create draft from template</SubmitButton>
            <p className="hint w-full">Built from this brand’s approved facts. Only create area pages with genuinely local content — near-identical city pages get flagged by SEO checks.</p>
          </form>
        </Section>
      ))}
      <p className="text-2xs text-ink-2">Live pages are served by this app at /s/&lt;site&gt;/. Custom domains and deployment are not connected — see Settings → Capabilities.</p>
    </>
  );
}
