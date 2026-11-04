import { ArrowUp } from "lucide-react";
import { requireStaffPage } from "@/lib/auth";
import { db } from "@/lib/db";
import { parseStages } from "@/lib/crm/pipelines";
import { can } from "@/lib/rbac";
import { Flash, PageHeader, Section, SubmitButton } from "@/components/ui";
import { stagesAction } from "../setup-actions";

export const metadata = { title: "Pipeline" };

export default async function Pipeline({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  const ctx = await requireStaffPage();
  const sp = await searchParams;
  const pipelines = await db.pipeline.findMany({ where: { workspaceId: ctx.workspace.id } });
  const counts = await db.opportunity.groupBy({ by: ["pipelineId", "stageId"], where: { workspaceId: ctx.workspace.id }, _count: true });
  const edit = can(ctx.role, "settings.manage");
  return (
    <>
      <PageHeader title="Pipeline stages" description={ctx.workspace.kind === "agency" ? "Rank Logic's own sales stages." : `${ctx.workspace.name}'s customer stages.`} />
      <Flash ok={sp.ok} error={sp.error} />
      {pipelines.map((p) => {
        const stages = parseStages(p.stages);
        return (
          <Section key={p.id} title={p.name}>
            <form action={stagesAction} className="flex flex-col gap-2 p-4">
              <input type="hidden" name="pipelineId" value={p.id} />
              <fieldset disabled={!edit} className="flex flex-col gap-2">
                {stages.map((s, i) => {
                  const n = counts.find((c) => c.pipelineId === p.id && c.stageId === s.id)?._count ?? 0;
                  return (
                    <div key={s.id} className="flex flex-wrap items-center gap-2 rounded-ctl border border-line px-3 py-2">
                      <input type="hidden" name="stageId" value={s.id} /><input type="hidden" name="stageType" value={s.type} />
                      <label className="sr-only" htmlFor={`n-${s.id}`}>Stage {i + 1} name</label>
                      <input id={`n-${s.id}`} name="stageName" defaultValue={s.name} className="field min-w-[180px] flex-1" />
                      <span className="text-2xs text-ink-2">{s.type === "open" ? "Open" : s.type === "won" ? "Won (closes)" : "Lost (closes)"} · {n} deal{n === 1 ? "" : "s"}</span>
                      {s.type === "open" && i > 0 ? <button type="submit" name="moveUp" value={s.id} className="btn-quiet min-h-[32px] px-2 text-xs"><ArrowUp aria-hidden className="h-3.5 w-3.5" />Up</button> : null}
                      {s.type === "open" ? <label className="flex items-center gap-1 text-xs"><input type="checkbox" name="remove" value={s.id} disabled={n > 0} className="h-4 w-4" />Remove{n > 0 ? " (has deals)" : ""}</label> : null}
                    </div>
                  );
                })}
                <div className="flex flex-wrap items-end gap-2"><div className="flex-1"><label className="label" htmlFor={`new-${p.id}`}>Add an open stage</label><input id={`new-${p.id}`} name="newStage" className="field" placeholder="e.g. Site visit done" /></div><SubmitButton variant="secondary">Save pipeline</SubmitButton></div>
              </fieldset>
            </form>
          </Section>
        );
      })}
    </>
  );
}
