import Link from "next/link";
import { Plus } from "lucide-react";
import { requireStaffPage } from "@/lib/auth";
import { db } from "@/lib/db";
import { Empty, Flash, PageHeader, Section, Status } from "@/components/ui";

export const metadata = { title: "Workflows" };

export default async function Workflows({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  const ctx = await requireStaffPage();
  const sp = await searchParams;
  const flows = await db.workflow.findMany({ where: { workspaceId: ctx.workspace.id }, orderBy: { createdAt: "asc" } });
  const runs = await db.workflowRun.groupBy({ by: ["status"], where: { workspaceId: ctx.workspace.id }, _count: true });
  return (
    <>
      <PageHeader title="Workflows" description="Follow-up steps that run when something happens. Every step re-checks opt-outs, replies, bookings and the emergency pause right before it runs." actions={<Link href="/app/settings/workflows/new" className="btn-primary"><Plus aria-hidden className="h-4 w-4" />New workflow</Link>} />
      <Flash ok={sp.ok} error={sp.error} />
      <Section title="Workflows" count={flows.length}>
        {flows.length === 0 ? <Empty title="No workflows" /> : <ul className="divide-y divide-line">{flows.map((w) => <li key={w.id}><Link href={`/app/settings/workflows/${w.id}`} className="flex items-center justify-between gap-2 px-4 py-3 hover:bg-canvas"><span><span className="font-medium">{w.name}</span><span className="block text-2xs text-ink-2">When {w.trigger.replace(/_/g, " ")} · version {w.currentVersion}</span></span>{w.enabled ? <Status tone="ok">On</Status> : <Status>Off</Status>}</Link></li>)}</ul>}
        <p className="border-t border-line px-4 py-2 text-2xs text-ink-2">Runs: {runs.map((r) => `${r._count} ${r.status}`).join(" · ") || "none yet"}. Turn workflows on or off in General.</p>
      </Section>
    </>
  );
}
