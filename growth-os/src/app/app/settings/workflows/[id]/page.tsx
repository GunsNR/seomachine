import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { requireStaffPage } from "@/lib/auth";
import { db, systemDb } from "@/lib/db";
import { DefinitionSchema, STOP_RULES, TRIGGERS, type Definition, type Step } from "@/lib/workflows/definition";
import { Flash, Notice, PageHeader, Section, SubmitButton } from "@/components/ui";
import { saveWorkflowAction } from "../../setup-actions";

export const metadata = { title: "Workflow" };

const STEP_LABEL: Record<Step["type"], string> = { wait: "Wait", create_task: "Create a task", draft_message: "Draft a message for a person to send", send_message: "Send a message (held unless live sending is on)", require_stage: "Continue only if the deal is…", assign_owner: "Assign the deal to…" };
const STOP_LABEL: Record<string, string> = { reply: "They reply", opt_out: "They opt out (always)", booking: "An appointment is booked", disqualified: "Marked not qualified", closed: "Deal won or lost", manual_takeover: "Someone takes over (always)" };

export default async function WorkflowEditor({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ ok?: string; error?: string }> }) {
  const ctx = await requireStaffPage("settings.manage");
  const { id } = await params;
  const sp = await searchParams;
  const isNew = id === "new";
  const w = isNew ? null : await db.workflow.findFirst({ where: { workspaceId: ctx.workspace.id, id }, include: { versions: true } });
  if (!isNew && !w) notFound();
  const def: Definition = w ? DefinitionSchema.parse(w.versions.find((v) => v.version === w.currentVersion)!.definition) : { steps: [{ type: "create_task", title: "Call {{first_name}} back", dueInMinutes: 60 }], stopOn: [...STOP_RULES], filter: {} };
  const members = await systemDb.membership.findMany({ where: { workspaceId: ctx.workspace.id, revokedAt: null, role: { not: "client" } }, include: { user: true } });
  return (
    <>
      <Link href="/app/settings/workflows" className="mb-3 inline-flex items-center gap-1 text-xs text-ink-2 hover:text-ink"><ArrowLeft aria-hidden className="h-3.5 w-3.5" />Workflows</Link>
      <PageHeader title={w ? w.name : "New workflow"} description={w ? `Version ${w.currentVersion}. Saving creates version ${w.currentVersion + 1}; runs already going keep their version.` : "New workflows start switched off."} />
      <Flash ok={sp.ok} error={sp.error} />
      <form action={saveWorkflowAction} className="flex flex-col gap-5">
        <input type="hidden" name="workflowId" value={w?.id ?? ""} />
        <Section title="When">
          <div className="grid gap-3 p-4 sm:grid-cols-2">
            <div><label className="label" htmlFor="name">Name</label><input id="name" name="name" required defaultValue={w?.name ?? ""} className="field" /></div>
            <div><label className="label" htmlFor="trigger">Starts when</label><select id="trigger" name="trigger" defaultValue={w?.trigger ?? "form_submitted"} className="field">{TRIGGERS.map((t) => <option key={t} value={t}>{{ form_submitted: "A new inquiry comes in", opportunity_assigned: "A deal is assigned", stage_changed: "A deal changes stage", booking_created: "An appointment is booked" }[t]}</option>)}</select></div>
          </div>
        </Section>
        <Section title="Steps" count={def.steps.length}>
          <ol className="divide-y divide-line">
            {def.steps.map((s, i) => (
              <li key={i} className="flex flex-col gap-2 px-4 py-3">
                <input type="hidden" name={`s${i}_type`} value={s.type} />
                <div className="flex items-center justify-between gap-2"><p className="text-sm font-medium">{i + 1}. {STEP_LABEL[s.type]}</p><label className="flex items-center gap-1 text-xs"><input type="checkbox" name={`s${i}_remove`} className="h-4 w-4" />Remove</label></div>
                {s.type === "wait" ? <div className="flex gap-2"><label className="sr-only" htmlFor={`a${i}`}>Amount</label><input id={`a${i}`} name={`s${i}_amount`} type="number" min={1} defaultValue={s.minutes % 1440 === 0 ? s.minutes / 1440 : s.minutes % 60 === 0 ? s.minutes / 60 : s.minutes} className="field w-28" /><label className="sr-only" htmlFor={`u${i}`}>Unit</label><select id={`u${i}`} name={`s${i}_unit`} defaultValue={s.minutes % 1440 === 0 ? "days" : s.minutes % 60 === 0 ? "hours" : "minutes"} className="field w-32"><option value="minutes">minutes</option><option value="hours">hours</option><option value="days">days</option></select></div> : null}
                {s.type === "create_task" ? <div className="grid gap-2 sm:grid-cols-[1fr_160px]"><div><label className="label" htmlFor={`t${i}`}>Task</label><input id={`t${i}`} name={`s${i}_title`} defaultValue={s.title} className="field" /></div><div><label className="label" htmlFor={`d${i}`}>Due in (hours)</label><input id={`d${i}`} name={`s${i}_due`} type="number" min={0} step="0.5" defaultValue={s.dueInMinutes / 60} className="field" /></div></div> : null}
                {s.type === "draft_message" || s.type === "send_message" ? <div className="grid gap-2"><div className="grid gap-2 sm:grid-cols-[120px_1fr]"><div><label className="label" htmlFor={`c${i}`}>Channel</label><select id={`c${i}`} name={`s${i}_channel`} defaultValue={s.channel} className="field"><option value="email">Email</option><option value="sms">SMS</option></select></div><div><label className="label" htmlFor={`sub${i}`}>Subject</label><input id={`sub${i}`} name={`s${i}_subject`} defaultValue={s.subject} className="field" /></div></div><div><label className="label" htmlFor={`b${i}`}>Message</label><textarea id={`b${i}`} name={`s${i}_body`} rows={3} defaultValue={s.body} className="field" /><p className="hint">Merge fields: {"{{first_name}}"}, {"{{full_name}}"}, {"{{business}}"}.</p></div></div> : null}
                {s.type === "require_stage" ? <fieldset className="flex gap-4 text-sm"><legend className="sr-only">Deal state</legend>{(["open", "won", "lost"] as const).map((t) => <label key={t} className="flex items-center gap-1.5"><input type="checkbox" name={`s${i}_stageTypes`} value={t} defaultChecked={s.stageTypes.includes(t)} className="h-4 w-4" />{t}</label>)}</fieldset> : null}
                {s.type === "assign_owner" ? <div><label className="sr-only" htmlFor={`o${i}`}>Owner</label><select id={`o${i}`} name={`s${i}_userId`} defaultValue={s.userId} className="field">{members.map((m) => <option key={m.userId} value={m.userId}>{m.user.name}</option>)}</select></div> : null}
              </li>
            ))}
          </ol>
          <div className="flex flex-wrap items-end gap-2 border-t border-line p-4">
            <div><label className="label" htmlFor="addStep">Add a step (saves the workflow)</label><select id="addStep" name="addStep" className="field" defaultValue=""><option value="">—</option>{(Object.keys(STEP_LABEL) as Step["type"][]).map((t) => <option key={t} value={t}>{STEP_LABEL[t]}</option>)}</select></div>
          </div>
        </Section>
        <Section title="Stop as soon as">
          <fieldset className="grid gap-2 p-4 sm:grid-cols-2"><legend className="sr-only">Stop rules</legend>{STOP_RULES.map((r) => <label key={r} className="flex items-center gap-2 text-sm"><input type="checkbox" name="stopOn" value={r} defaultChecked={def.stopOn.includes(r)} disabled={r === "opt_out" || r === "manual_takeover"} className="h-4 w-4" />{STOP_LABEL[r]}</label>)}{["opt_out", "manual_takeover"].map((r) => <input key={r} type="hidden" name="stopOn" value={r} />)}</fieldset>
        </Section>
        {def.steps.some((s) => s.type === "send_message") ? <Notice tone="warn" title="Sending is off">Send steps are held with a reason until a verified sender is connected and live sending is approved.</Notice> : null}
        <SubmitButton className="self-start">{w ? "Save new version" : "Create workflow"}</SubmitButton>
      </form>
    </>
  );
}
