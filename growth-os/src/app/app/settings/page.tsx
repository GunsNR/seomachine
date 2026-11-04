import { requireStaffPage } from "@/lib/auth";
import { db, systemDb } from "@/lib/db";
import { can } from "@/lib/rbac";
import { CAPABILITIES, STATUS_LABEL, type CapStatus } from "@/lib/capabilities";
import { aiStatus, monthSpendMicros } from "@/lib/ai/provider";
import { liveSendingEnabled } from "@/lib/workflows/engine";
import { livePublishingEnabled } from "@/lib/content/adapters";
import { DefinitionSchema } from "@/lib/workflows/definition";
import { cookies } from "next/headers";
import { Flash, Notice, PageHeader, Section, Status, SubmitButton, When, type Tone } from "@/components/ui";
import { requestOrigin } from "@/app/lib-origin";
import { budgetAction, inviteAction, pauseAction, resetLinkAction, retryJobAction, revokeMemberAction, toggleWorkflowAction, unsuppressAction } from "./actions";

export const metadata = { title: "Settings" };
const CAP_TONE: Record<CapStatus, Tone> = { implemented: "info", tested_fixture: "info", sandbox_verified: "ok", live_verified: "ok", manual_fallback: "warn", blocked: "bad", deferred: "neutral" };

export default async function Settings({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  const ctx = await requireStaffPage();
  const sp = await searchParams;
  const ws = ctx.workspace;
  const tz = ws.timezone;
  const manage = can(ctx.role, "settings.manage");
  const [members, flows, jobs, supps, usage, audits, wsRow, invites] = await Promise.all([
    systemDb.membership.findMany({ where: { workspaceId: ws.id, revokedAt: null }, include: { user: true } }),
    db.workflow.findMany({ where: { workspaceId: ws.id }, include: { versions: true } }),
    systemDb.job.findMany({ where: { workspaceId: ws.id, status: { in: ["dead", "queued", "running"] } }, orderBy: { createdAt: "desc" }, take: 20 }),
    db.suppression.findMany({ where: { workspaceId: ws.id }, take: 50 }),
    monthSpendMicros(ws.id),
    db.auditEvent.findMany({ where: { workspaceId: ws.id }, orderBy: { createdAt: "desc" }, take: 15 }),
    systemDb.workspace.findUnique({ where: { id: ws.id } }),
    systemDb.authToken.findMany({ where: { workspaceId: ws.id, kind: "invite", usedAt: null, expiresAt: { gt: new Date() } } }),
  ]);
  const ai = aiStatus();
  const once = (await cookies()).get("gos_once_link")?.value;
  const origin = await requestOrigin();
  const switches = [
    { name: "Sending email/SMS", on: liveSendingEnabled(), env: "LIVE_SENDING_ENABLED" },
    { name: "Publishing to real accounts", on: livePublishingEnabled(), env: "LIVE_PUBLISHING_ENABLED" },
    { name: "Paid AI calls", on: ai.live, env: "AI_LIVE_ENABLED" },
  ];
  const areas = [...new Set(CAPABILITIES.map((c) => c.area))];

  return (
    <>
      <PageHeader title="Settings" description={`${ws.name} · ${ws.kind === "agency" ? "agency workspace" : "client workspace"} · ${tz} · ${ws.currency}`} />
      <Flash ok={sp.ok} error={sp.error} />
      {once && can(ctx.role, "members.manage") ? <div className="mb-4"><Notice tone="warn" title="One-time link — copy it now">It disappears within two minutes and is never shown again: <code className="select-all [overflow-wrap:anywhere]">{origin}{once}</code></Notice></div> : null}
      <div className="grid gap-5 lg:grid-cols-2">
        <Section id="pause" title="Emergency pause">
          <div className="p-4">
            {ws.pausedAt ? <Notice tone="warn" title="Paused">Since <When at={ws.pausedAt} tz={tz} />. Follow-ups, messages and posts are held and re-checked every 15 minutes.</Notice> : <p className="text-sm text-ink-2">Stops every outgoing action in this workspace immediately. Each step checks this right before it runs.</p>}
            {can(ctx.role, "workspace.pause") ? <form action={pauseAction} className="mt-3"><input type="hidden" name="pause" value={ws.pausedAt ? "off" : "on"} /><SubmitButton variant={ws.pausedAt ? "primary" : "danger"}>{ws.pausedAt ? "Resume workspace" : "Pause everything"}</SubmitButton></form> : <p className="hint mt-2">Only owners and admins can pause.</p>}
          </div>
        </Section>

        <Section title="Live switches">
          <ul className="divide-y divide-line">{switches.map((s) => <li key={s.env} className="flex items-center justify-between gap-2 px-4 py-2.5 text-sm"><span>{s.name}</span>{s.on ? <Status tone="warn">On</Status> : <Status>Off</Status>}</li>)}</ul>
          <p className="border-t border-line px-4 py-2 text-2xs text-ink-2">These are server settings, off by default. Turning one on needs a recorded approval with scope, budget and stop conditions — it can’t be done from this screen.</p>
        </Section>

        <Section id="automation" title="Follow-up workflows" count={flows.length}>
          {flows.length === 0 ? <p className="px-4 py-3 text-sm text-ink-2">No workflows in this workspace.</p> : (
            <ul className="divide-y divide-line">
              {flows.map((w) => {
                const v = w.versions.find((x) => x.version === w.currentVersion);
                const def = DefinitionSchema.safeParse(v?.definition);
                return (
                  <li key={w.id} className="px-4 py-3">
                    <div className="flex items-center justify-between gap-2"><p className="font-medium">{w.name}</p>{w.enabled ? <Status tone="ok">On</Status> : <Status>Off</Status>}</div>
                    <p className="text-2xs text-ink-2">When: {w.trigger.replace(/_/g, " ")} · v{w.currentVersion} · stops on {def.success ? def.data.stopOn.join(", ").replace(/_/g, " ") : "—"}</p>
                    {def.success ? <ol className="mt-1 list-decimal pl-5 text-xs text-ink-2">{def.data.steps.map((s, i) => <li key={i}>{s.type === "wait" ? `Wait ${s.minutes >= 1440 ? `${s.minutes / 1440} day(s)` : `${s.minutes} min`}` : s.type === "create_task" ? `Create task “${s.title}”` : s.type === "send_message" ? `Send ${s.channel} (held unless live sending is on)` : s.type === "draft_message" ? `Draft ${s.channel} for a human` : s.type === "require_stage" ? `Continue only if ${s.stageTypes.join("/")}` : `Assign owner`}</li>)}</ol> : null}
                    {manage ? <form action={toggleWorkflowAction} className="mt-2"><input type="hidden" name="workflowId" value={w.id} /><input type="hidden" name="enabled" value={w.enabled ? "off" : "on"} /><SubmitButton variant="secondary">{w.enabled ? "Turn off" : "Turn on"}</SubmitButton></form> : null}
                  </li>
                );
              })}
            </ul>
          )}
          {supps.length ? <div className="border-t border-line px-4 py-3"><p className="label">Do-not-contact list ({supps.length})</p><ul className="text-xs">{supps.map((s) => <li key={s.id} className="flex items-center justify-between gap-2 py-1"><span className="[overflow-wrap:anywhere]">{s.value} · {s.reason.replace("_", " ")}</span>{s.reason !== "opt_out" && manage ? <form action={unsuppressAction}><input type="hidden" name="id" value={s.id} /><SubmitButton variant="quiet">Remove</SubmitButton></form> : null}</li>)}</ul></div> : null}
        </Section>

        <Section id="members" title="Members" count={members.length}>
          <ul className="divide-y divide-line">
            {members.map((m) => (
              <li key={m.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5">
                <div className="min-w-0"><p className="truncate text-sm font-medium">{m.user.name}</p><p className="truncate text-2xs text-ink-2">{m.user.email} · {m.role === "client" ? "client portal only" : m.role}</p></div>
                {can(ctx.role, "members.manage") && m.userId !== ctx.userId ? (
                  <div className="flex gap-1">
                    <form action={resetLinkAction}><input type="hidden" name="userId" value={m.userId} /><SubmitButton variant="quiet">Reset link</SubmitButton></form>
                    <form action={revokeMemberAction}><input type="hidden" name="userId" value={m.userId} /><SubmitButton variant="quiet">Remove</SubmitButton></form>
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
          {can(ctx.role, "members.manage") ? (
            <form action={inviteAction} className="flex flex-wrap items-end gap-2 border-t border-line p-4">
              <div className="min-w-[200px] flex-1"><label className="label" htmlFor="invEmail">Invite by email</label><input id="invEmail" name="email" type="email" required className="field" /></div>
              <div><label className="label" htmlFor="invRole">Role</label><select id="invRole" name="role" className="field"><option value="member">Team member</option><option value="admin">Admin</option>{ws.kind === "client" ? <option value="client">Client (portal only)</option> : null}</select></div>
              <SubmitButton variant="secondary">Create invite</SubmitButton>
              {invites.length ? <p className="hint w-full">{invites.length} open invitation{invites.length > 1 ? "s" : ""}.</p> : null}
            </form>
          ) : null}
        </Section>

        <Section id="ai" title="AI budget">
          <div className="p-4 text-sm">
            <p>{ai.live ? <Status tone="warn">AI on — {ai.model}</Status> : <Status>AI off</Status>} <span className="text-xs text-ink-2">{ai.reason}</span></p>
            <p className="mt-2">This month: <span className="num">${(usage / 1_000_000).toFixed(2)}</span> of <span className="num">${((wsRow?.aiMonthlyCapMicros ?? 0) / 1_000_000).toFixed(2)}</span> cap <span className="text-2xs text-ink-2">(from provider usage figures when available)</span></p>
            {can(ctx.role, "live.toggle") ? <form action={budgetAction} className="mt-3 flex items-end gap-2"><div><label className="label" htmlFor="usd">Monthly cap (USD)</label><input id="usd" name="usd" type="number" min={0} max={500} step="1" defaultValue={((wsRow?.aiMonthlyCapMicros ?? 0) / 1_000_000).toFixed(0)} className="field w-32" /></div><SubmitButton variant="secondary">Save cap</SubmitButton></form> : null}
          </div>
        </Section>

        <Section id="health" title="System health" count={jobs.filter((j) => j.status === "dead").length}>
          {jobs.length === 0 ? <p className="px-4 py-3 text-sm text-ink-2">No queued or failed background jobs.</p> : (
            <ul className="divide-y divide-line text-xs">{jobs.map((j) => <li key={j.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2"><span>{j.kind} · <When at={j.createdAt} tz={tz} short /></span><span className="flex items-center gap-2"><Status tone={j.status === "dead" ? "bad" : "info"}>{j.status === "dead" ? "Failed" : j.status}</Status>{j.status === "dead" && manage ? <form action={retryJobAction}><input type="hidden" name="jobId" value={j.id} /><SubmitButton variant="quiet">Retry</SubmitButton></form> : null}</span>{j.lastError ? <p className="w-full text-2xs text-ink-2">{j.lastError}</p> : null}</li>)}</ul>
          )}
          <p className="border-t border-line px-4 py-2 text-2xs text-ink-2">Background work runs in the worker (<code>npm run worker</code>). Without it, scheduled steps stay queued.</p>
        </Section>
      </div>

      <Section title="Capabilities — what works today" className="mt-5">
        <div className="overflow-x-auto">
          <table className="table">
            <thead><tr><th scope="col">Area</th><th scope="col">Capability</th><th scope="col">Status</th><th scope="col">Detail</th></tr></thead>
            <tbody>{areas.flatMap((a) => CAPABILITIES.filter((c) => c.area === a).map((c) => <tr key={c.id}><td className="text-ink-2">{a}</td><td className="font-medium">{c.name}</td><td><Status tone={CAP_TONE[c.status]}>{STATUS_LABEL[c.status]}</Status></td><td className="min-w-[260px] text-xs text-ink-2">{c.detail}{c.next ? <span className="block text-ink">Next: {c.next}</span> : null}</td></tr>))}</tbody>
          </table>
        </div>
      </Section>

      <Section title="Recent changes (audit log)" className="mt-5">
        <ul className="divide-y divide-line text-xs">{audits.map((a) => <li key={a.id} className="flex justify-between gap-2 px-4 py-2"><span>{a.action} · {a.subjectType}</span><When at={a.createdAt} tz={tz} short /></li>)}</ul>
      </Section>
    </>
  );
}
