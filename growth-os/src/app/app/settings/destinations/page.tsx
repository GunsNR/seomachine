import { requireStaffPage } from "@/lib/auth";
import { db } from "@/lib/db";
import { PLATFORM_LABEL, PLATFORMS } from "@/lib/content/variants";
import { can } from "@/lib/rbac";
import { Empty, Flash, PageHeader, Section, Status, SubmitButton } from "@/components/ui";
import { addDestinationAction, removeDestinationAction } from "../setup-actions";

export const metadata = { title: "Destinations" };

export default async function Destinations({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  const ctx = await requireStaffPage();
  const sp = await searchParams;
  const [brands, dests, cs] = await Promise.all([
    db.brand.findMany({ where: { workspaceId: ctx.workspace.id } }),
    db.destination.findMany({ where: { workspaceId: ctx.workspace.id }, orderBy: { createdAt: "asc" } }),
    db.integration.findFirst({ where: { workspaceId: ctx.workspace.id, provider: "contentstudio", status: "connected" } }),
  ]);
  const edit = can(ctx.role, "settings.manage");
  return (
    <>
      <PageHeader title="Destinations" description="Where each brand's posts go. A destination only shows as connected when a verified connection exists." />
      <Flash ok={sp.ok} error={sp.error} />
      <Section title="Destinations" count={dests.length}>
        {dests.length === 0 ? <Empty title="None yet">Add one per social profile. Without a connection, you’ll get a ready-to-post package instead.</Empty> : (
          <ul className="divide-y divide-line">
            {dests.map((d) => (
              <li key={d.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5">
                <div className="min-w-0"><p className="font-medium">{d.label}</p><p className="text-2xs text-ink-2">{PLATFORM_LABEL[d.platform as keyof typeof PLATFORM_LABEL] ?? d.platform} · {brands.find((b) => b.id === d.brandId)?.name} · {d.adapter === "dry_run" ? "Dry run — nothing is posted" : d.adapter === "contentstudio" ? `ContentStudio account ${d.providerAccountId}` : "Manual hand-off"}</p></div>
                <span className="flex items-center gap-2"><Status tone={d.status === "connected" ? "ok" : d.status === "manual_handoff" ? "warn" : "neutral"}>{d.status.replace("_", " ")}</Status>{edit ? <form action={removeDestinationAction}><input type="hidden" name="id" value={d.id} /><SubmitButton variant="quiet">Remove</SubmitButton></form> : null}</span>
              </li>
            ))}
          </ul>
        )}
        {edit ? (
          <form action={addDestinationAction} className="grid gap-2 border-t border-line p-4 sm:grid-cols-2 lg:grid-cols-5">
            <div><label className="label" htmlFor="brandId">Brand</label><select id="brandId" name="brandId" className="field">{brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select></div>
            <div><label className="label" htmlFor="platform">Platform</label><select id="platform" name="platform" className="field">{PLATFORMS.map((p) => <option key={p} value={p}>{PLATFORM_LABEL[p]}</option>)}</select></div>
            <div><label className="label" htmlFor="label">Name</label><input id="label" name="label" className="field" placeholder="e.g. Harbor Line on Facebook" /></div>
            <div><label className="label" htmlFor="adapter">How it posts</label><select id="adapter" name="adapter" className="field"><option value="manual">Manual hand-off</option>{cs ? <option value="contentstudio">ContentStudio</option> : null}{ctx.workspace.isFixture ? <option value="dry_run">Dry run (demo only)</option> : null}</select></div>
            <div><label className="label" htmlFor="providerAccountId">ContentStudio account ID</label><input id="providerAccountId" name="providerAccountId" className="field" placeholder="Only for ContentStudio" /></div>
            <div className="sm:col-span-2 lg:col-span-5"><SubmitButton variant="secondary">Add destination</SubmitButton>{!cs ? <p className="hint mt-1">ContentStudio appears here once it’s connected under Integrations.</p> : null}</div>
          </form>
        ) : null}
      </Section>
    </>
  );
}
