import { requireStaffPage } from "@/lib/auth";
import { systemDb } from "@/lib/db";
import { can } from "@/lib/rbac";
import { Empty, Flash, Notice, PageHeader, Section, SubmitButton, When } from "@/components/ui";
import { createClientAction } from "../setup-actions";

export const metadata = { title: "Clients" };

export default async function Clients({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  const ctx = await requireStaffPage();
  const sp = await searchParams;
  if (ctx.workspace.kind !== "agency") return <><PageHeader title="Clients" /><Notice tone="neutral" title="Switch to the agency workspace to add clients" /></>;
  const kids = await systemDb.workspace.findMany({ where: { parentId: ctx.workspace.id }, orderBy: { createdAt: "asc" } });
  return (
    <>
      <PageHeader title="Clients" description="Each client gets its own workspace: separate leads, brand, site, posts and reports. Nothing crosses between them." />
      <Flash ok={sp.ok} error={sp.error} />
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_400px]">
        <Section title="Client workspaces" count={kids.length}>
          {kids.length === 0 ? <Empty title="No clients yet" /> : <ul className="divide-y divide-line">{kids.map((k) => <li key={k.id} className="flex flex-wrap justify-between gap-2 px-4 py-2.5"><span className="font-medium">{k.name}{k.isFixture ? <span className="ml-2 text-2xs text-info">Demo data</span> : null}</span><span className="text-2xs text-ink-2">{k.timezone} · {k.currency} · added <When at={k.createdAt} tz={ctx.workspace.timezone} short /></span></li>)}</ul>}
        </Section>
        {can(ctx.role, "settings.manage") ? (
          <Section title="Add a client">
            <form action={createClientAction} className="flex flex-col gap-3 p-4">
              <div><label className="label" htmlFor="name">Workspace name</label><input id="name" name="name" required className="field" placeholder="e.g. Coastal Orthodontics" /></div>
              <div><label className="label" htmlFor="businessName">Public business name</label><input id="businessName" name="businessName" className="field" /></div>
              <div><label className="label" htmlFor="industry">Industry</label><select id="industry" name="industry" className="field"><option value="home_services">Home services</option><option value="healthcare">Healthcare</option><option value="other">Other</option></select></div>
              <div className="grid grid-cols-2 gap-2">
                <div><label className="label" htmlFor="timezone">Time zone</label><select id="timezone" name="timezone" className="field" defaultValue="America/New_York"><option value="America/New_York">Eastern (NY, NJ, FL)</option><option value="America/Chicago">Central</option><option value="America/Denver">Mountain</option><option value="America/Los_Angeles">Pacific</option></select></div>
                <div><label className="label" htmlFor="currency">Currency</label><select id="currency" name="currency" className="field"><option value="USD">USD</option><option value="CAD">CAD</option><option value="EUR">EUR</option><option value="GBP">GBP</option></select></div>
              </div>
              <div><label className="label" htmlFor="serviceAreas">Service areas (comma-separated)</label><input id="serviceAreas" name="serviceAreas" className="field" placeholder="e.g. Fort Lauderdale, Plantation" /></div>
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="switch" defaultChecked className="h-4 w-4" />Switch to it now</label>
              <SubmitButton>Create client workspace</SubmitButton>
              <p className="hint">Creates a pipeline, an empty brand profile, an unpublished starter page and a follow-up workflow that stays off. You become its owner; invite others from its Settings.</p>
            </form>
          </Section>
        ) : null}
      </div>
    </>
  );
}
