import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, CalendarPlus, Hand, Mail, MessageSquareReply, Phone, Ban } from "lucide-react";
import { requireStaffPage } from "@/lib/auth";
import { contactDetail } from "@/lib/crm/queries";
import { displayName } from "@/lib/normalize";
import { parseTouch, sourceLabel } from "@/lib/attribution";
import { addLocalDays, toLocalInput, zonedToUtc, daysBetween } from "@/lib/time";
import { Empty, Flash, FixtureTag, KeyVal, Money, Notice, OverdueBar, Section, Status, SubmitButton, When } from "@/components/ui";
import { addNoteAction, bookingAction, bookingStatusAction, completeTaskAction, createTaskAction, inboundAction, moveStageAction, outcomeAction, paymentAction, proposalCreateAction, takeoverAction } from "../../actions";

export const metadata = { title: "Lead" };

const ACTIVITY: Record<string, string> = {
  form_submitted: "Form submitted", lead_entered: "Lead entered", form_resubmitted: "Sent the same inquiry again", stage_changed: "Stage changed", note: "Note", task_created: "Follow-up added", task_done: "Follow-up done",
  booking_recorded: "Booking recorded", booking_cancelled: "Booking cancelled", booking_rescheduled: "Booking rescheduled", booking_completed: "Appointment completed", booking_no_show: "No-show",
  outcome: "Outcome", payment_recorded: "Payment recorded", refund_recorded: "Refund recorded", reply_received: "Reply received", opted_out: "Opted out",
  proposal_sent: "Proposal sent", proposal_accepted: "Proposal accepted", proposal_declined: "Proposal declined", proposal_expired: "Proposal expired",
};

export default async function ContactPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ ok?: string; error?: string; task?: string }> }) {
  const ctx = await requireStaffPage("crm.read");
  const { id } = await params;
  const sp = await searchParams;
  const d = await contactDetail(ctx.workspace.id, id);
  if (!d) notFound();
  const tz = ctx.workspace.timezone;
  const cur = ctx.workspace.currency;
  const c = d.contact;
  const name = displayName(c);
  const here = `/app/crm/contacts/${c.id}`;
  const now = new Date();
  const tomorrow9 = (() => { const t = addLocalDays(now, 1, tz); const s = toLocalInput(t, tz).slice(0, 10).split("-").map(Number); return zonedToUtc({ year: s[0]!, month: s[1]!, day: s[2]!, hour: 9, minute: 0 }, tz); })();
  const openTasks = d.tasks.filter((t) => t.status === "open");
  const emailConsent = d.consents.find((x) => x.channel === "email");
  const first = parseTouch(c.firstTouch);
  const last = parseTouch(c.lastTouch);
  const primaryOpp = d.opps.find((o) => o.status === "open") ?? d.opps[0];

  return (
    <>
      <Link href="/app/crm" className="mb-3 inline-flex items-center gap-1 text-xs text-ink-2 hover:text-ink"><ArrowLeft aria-hidden className="h-3.5 w-3.5" />CRM</Link>
      <div className="mb-5 flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-xl font-semibold tracking-[-0.01em] [overflow-wrap:anywhere]">{name}</h1>
            {c.lifecycle === "customer" ? <Status tone="ok">Customer</Status> : <Status>Lead</Status>}
            {c.manualTakeover ? <Status tone="action">You've taken over</Status> : null}
            {c.isFixture ? <FixtureTag /> : null}
          </div>
          <p className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-sm text-ink-2">
            {c.email ? <a className="inline-flex items-center gap-1 hover:text-ink" href={`mailto:${c.email}`}><Mail aria-hidden className="h-3.5 w-3.5" />{c.email}</a> : <span>No email</span>}
            {c.phone ? <a className="inline-flex items-center gap-1 hover:text-ink" href={`tel:${c.phoneNormalized}`}><Phone aria-hidden className="h-3.5 w-3.5" />{c.phone}</a> : <span>No phone</span>}
            <span>Source: {sourceLabel(first)}</span>
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <a href="#follow-up" className="btn-secondary"><CalendarPlus aria-hidden className="h-4 w-4" />Add follow-up</a>
          <form action={inboundAction}><input type="hidden" name="contactId" value={c.id} /><input type="hidden" name="kind" value="reply" /><input type="hidden" name="returnTo" value={here} /><SubmitButton variant="secondary"><MessageSquareReply aria-hidden className="h-4 w-4" />They replied</SubmitButton></form>
          <form action={takeoverAction}><input type="hidden" name="contactId" value={c.id} /><input type="hidden" name="on" value={c.manualTakeover ? "false" : "on"} /><input type="hidden" name="returnTo" value={here} /><SubmitButton variant="secondary"><Hand aria-hidden className="h-4 w-4" />{c.manualTakeover ? "Hand back to automation" : "Take over"}</SubmitButton></form>
        </div>
      </div>
      <Flash ok={sp.ok} error={sp.error} />
      {d.suppression ? <div className="mb-4"><Notice tone="warn" title="Do not email — this address is suppressed">Reason: {d.suppression.reason.replace("_", " ")}. Automated messages to it are blocked.</Notice></div> : null}
      {d.phoneTwins.length ? <div className="mb-4"><Notice tone="info" title="Another contact shares this phone number">Shared numbers are common in households and offices, so they were not merged: {d.phoneTwins.map((t, i) => <span key={t.id}>{i ? ", " : ""}<Link className="link" href={`/app/crm/contacts/${t.id}`}>{displayName(t)}</Link></span>)}.</Notice></div> : null}

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_380px]">
        <div className="order-2 flex min-w-0 flex-col gap-5 lg:order-1">
          {d.opps.length === 0 ? <div className="panel"><Empty title="No opportunities">Add a lead with an inquiry to start one.</Empty></div> : d.opps.map((o) => {
            const stage = o.stages.find((s) => s.id === o.stageId);
            const outs = d.outcomes.filter((x) => x.opportunityId === o.id);
            const pays = d.payments.filter((x) => x.opportunityId === o.id);
            const net = pays.reduce((s, p) => s + (p.kind === "payment" ? p.amountMinor : -p.amountMinor), 0);
            const props = d.proposals.filter((p) => p.opportunityId === o.id);
            const att = parseTouch(o.attribution);
            return (
              <Section key={o.id} title={o.title} action={<Status tone={o.status === "won" ? "ok" : o.status === "lost" ? "bad" : "neutral"}>{stage?.name ?? o.stageId}</Status>}>
                <div className="grid gap-4 p-4 md:grid-cols-2">
                  <dl>
                    <KeyVal k="Qualified?">{o.qualification === "unknown" ? <span className="text-ink-2">Not yet confirmed</span> : o.qualification === "qualified" ? "Yes" : "No"}</KeyVal>
                    <KeyVal k="Job value">{o.estimatedValueMinor ? <Money minor={o.estimatedValueMinor} currency={o.currency} /> : <span className="text-ink-2">Not set</span>}</KeyVal>
                    <KeyVal k="Collected">{pays.length ? <><Money minor={net} currency={o.currency} /> <span className="text-2xs text-ink-2">net, {pays.length} record{pays.length > 1 ? "s" : ""}</span></> : <span className="text-ink-2">No payment recorded{o.status === "won" ? " — won is not paid" : ""}</span>}</KeyVal>
                    <KeyVal k="Came from">{sourceLabel(att)}{att?.campaign ? ` · ${att.campaign}` : ""}{att?.content ? ` · content ${att.content}` : ""}</KeyVal>
                    {o.lostReason ? <KeyVal k="Lost because">{o.lostReason}</KeyVal> : null}
                  </dl>
                  <form action={moveStageAction} className="flex flex-col gap-2">
                    <input type="hidden" name="opportunityId" value={o.id} /><input type="hidden" name="returnTo" value={here} />
                    <label className="label" htmlFor={`stage-${o.id}`}>Stage</label>
                    <select id={`stage-${o.id}`} name="stageId" defaultValue={o.stageId} className="field">{o.stages.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select>
                    <label className="label" htmlFor={`lr-${o.id}`}>Reason, if lost</label>
                    <input id={`lr-${o.id}`} name="lostReason" className="field" placeholder="e.g. chose another company on price" />
                    <SubmitButton variant="secondary" className="self-start">Update stage</SubmitButton>
                  </form>
                </div>
                <details className="border-t border-line px-4 py-3">
                  <summary className="cursor-pointer text-sm font-medium">Record outcome or payment</summary>
                  <div className="mt-3 grid gap-4 md:grid-cols-2">
                    <form action={outcomeAction} className="flex flex-col gap-2">
                      <input type="hidden" name="opportunityId" value={o.id} /><input type="hidden" name="returnTo" value={here} />
                      <label className="label" htmlFor={`ok-${o.id}`}>Outcome</label>
                      <select id={`ok-${o.id}`} name="kind" className="field"><option value="qualified">Qualified</option><option value="unqualified">Not qualified</option><option value="appointment">Appointment happened</option><option value="won">Won</option><option value="lost">Lost</option><option value="job_value">Job value</option></select>
                      <label className="label" htmlFor={`ov-${o.id}`}>Value ({cur}), for job value</label>
                      <input id={`ov-${o.id}`} name="value" inputMode="decimal" className="field" placeholder="e.g. 1,850" />
                      <SubmitButton variant="secondary" className="self-start">Save outcome</SubmitButton>
                    </form>
                    <form action={paymentAction} className="flex flex-col gap-2">
                      <input type="hidden" name="opportunityId" value={o.id} /><input type="hidden" name="returnTo" value={here} />
                      <fieldset className="flex gap-4 text-sm"><legend className="label">Money</legend>
                        <label className="flex items-center gap-1.5"><input type="radio" name="kind" value="payment" defaultChecked />Received</label>
                        <label className="flex items-center gap-1.5"><input type="radio" name="kind" value="refund" />Refunded</label>
                      </fieldset>
                      <label className="label" htmlFor={`pa-${o.id}`}>Amount ({cur})</label>
                      <input id={`pa-${o.id}`} name="amount" required inputMode="decimal" className="field" />
                      <label className="label" htmlFor={`pd-${o.id}`}>Date received</label>
                      <input id={`pd-${o.id}`} name="receivedAt" type="date" className="field" defaultValue={toLocalInput(now, tz).slice(0, 10)} />
                      <SubmitButton variant="secondary" className="self-start">Record</SubmitButton>
                      <p className="hint">Recorded as entered by you. Provider-verified payments are marked separately.</p>
                    </form>
                  </div>
                  {outs.length || pays.length ? (
                    <ul className="mt-3 divide-y divide-line rounded-ctl border border-line text-xs">
                      {outs.map((x) => <li key={x.id} className="flex flex-wrap justify-between gap-2 px-3 py-2"><span>{x.kind.replace("_", " ")}{x.valueMinor !== null ? <> · <Money minor={x.valueMinor} currency={x.currency ?? cur} /></> : null}</span><span className="text-ink-2">{x.source === "client_manual" ? "Confirmed by client" : x.source === "provider" ? "From provider" : "Entered by agency"} · {d.userName(x.confirmedById)} · <When at={x.createdAt} tz={tz} short /></span></li>)}
                      {pays.map((x) => <li key={x.id} className="flex flex-wrap justify-between gap-2 px-3 py-2"><span>{x.kind === "refund" ? "Refund" : "Payment"} <Money minor={x.amountMinor} currency={x.currency} /></span><span className="text-ink-2">{x.source === "provider" ? "Provider event" : x.source === "client_manual" ? "Confirmed by client" : "Entered by agency"} · {d.userName(x.confirmedById)} · <When at={x.receivedAt} tz={tz} short /></span></li>)}
                    </ul>
                  ) : null}
                </details>
                <div className="flex flex-wrap items-center gap-2 border-t border-line px-4 py-3 text-sm">
                  <span className="text-ink-2">Proposals:</span>
                  {props.map((p) => <Link key={p.id} href={`/app/crm/proposals/${p.id}`} className="link">{p.title} (v{p.currentVersion}, {p.status})</Link>)}
                  <form action={proposalCreateAction}><input type="hidden" name="opportunityId" value={o.id} /><input type="hidden" name="title" value={`Proposal — ${o.title}`.slice(0, 120)} /><input type="hidden" name="returnTo" value={here} /><SubmitButton variant="quiet">+ New draft</SubmitButton></form>
                </div>
              </Section>
            );
          })}

          <Section id="tl" title="Timeline" count={d.activities.length}>
            <form action={addNoteAction} className="flex flex-col gap-2 border-b border-line p-4 sm:flex-row sm:items-end">
              <input type="hidden" name="contactId" value={c.id} /><input type="hidden" name="opportunityId" value={primaryOpp?.id ?? ""} /><input type="hidden" name="returnTo" value={here} />
              <div className="flex-1"><label className="label" htmlFor="note">Add a note</label><textarea id="note" name="body" rows={2} className="field" placeholder="What did you learn?" /></div>
              <SubmitButton variant="secondary">Save note</SubmitButton>
            </form>
            {d.activities.length === 0 ? <Empty title="No activity yet" /> : (
              <ol className="divide-y divide-line">
                {d.activities.map((a) => (
                  <li key={a.id} className="grid grid-cols-[1fr_auto] gap-x-3 px-4 py-2.5">
                    <p className="text-sm"><span className="font-medium">{ACTIVITY[a.kind] ?? a.kind.replace(/_/g, " ")}</span>{a.body ? <span className="text-ink-2"> — {a.body}</span> : null}</p>
                    <p className="text-2xs text-ink-2 whitespace-nowrap"><When at={a.createdAt} tz={tz} short /></p>
                    <p className="col-span-2 text-2xs text-ink-2">{a.actorType === "client" ? "Client" : a.actorType === "system" ? "System" : a.actorType === "workflow" ? "Automation" : d.userName(a.actorId)}</p>
                  </li>
                ))}
              </ol>
            )}
          </Section>
        </div>

        <div className="order-1 flex min-w-0 flex-col gap-5 lg:order-2">
          <Section id="follow-up" title="Next steps" count={openTasks.length}>
            {openTasks.length ? (
              <ul className="divide-y divide-line">
                {openTasks.map((t) => {
                  const overdue = t.dueAt && t.dueAt < now;
                  return (
                    <li key={t.id} className={`flex items-center justify-between gap-3 px-4 py-2.5 ${sp.task === t.id ? "bg-action-soft" : ""}`}>
                      <div className="min-w-0"><p className="font-medium [overflow-wrap:anywhere]">{t.title}</p>{overdue ? <OverdueBar days={Math.max(1, daysBetween(t.dueAt!, now))} /> : <p className="text-2xs text-ink-2">Due <When at={t.dueAt} tz={tz} short /></p>}</div>
                      <form action={completeTaskAction}><input type="hidden" name="taskId" value={t.id} /><input type="hidden" name="returnTo" value={here} /><SubmitButton variant="secondary">Done</SubmitButton></form>
                    </li>
                  );
                })}
              </ul>
            ) : <p className="px-4 pt-3 text-xs text-warn">No next step set. Every open lead should have one.</p>}
            <form action={createTaskAction} className="flex flex-col gap-2 border-t border-line p-4">
              <input type="hidden" name="contactId" value={c.id} /><input type="hidden" name="opportunityId" value={primaryOpp?.id ?? ""} /><input type="hidden" name="returnTo" value={here} />
              <label className="label" htmlFor="ft">New follow-up</label>
              <input id="ft" name="title" required className="field" defaultValue={`Call ${c.firstName || name} back`} />
              <label className="label" htmlFor="fd">When ({tz.replace("_", " ")})</label>
              <input id="fd" name="dueAt" type="datetime-local" required className="field" defaultValue={toLocalInput(tomorrow9, tz)} />
              <SubmitButton className="self-start">Add follow-up</SubmitButton>
            </form>
          </Section>

          <Section id="bk" title="Bookings" count={d.bookings.length}>
            {d.bookings.length ? (
              <ul className="divide-y divide-line">
                {d.bookings.map((b) => (
                  <li key={b.id} className="px-4 py-2.5">
                    <p className="font-medium">{b.title}</p>
                    <p className="text-2xs text-ink-2"><When at={b.startsAt} tz={b.timezone} /> · {b.status.replace("_", " ")}</p>
                    <p className="mt-1">{b.verified ? <Status tone="ok">Calendar verified</Status> : <Status tone="warn" title="Someone typed this in. It isn't a calendar reservation.">Manual record</Status>}</p>
                    {b.status === "scheduled" || b.status === "rescheduled" ? (
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {(["completed", "no_show", "cancelled"] as const).map((s) => (
                          <form key={s} action={bookingStatusAction}><input type="hidden" name="bookingId" value={b.id} /><input type="hidden" name="status" value={s} /><input type="hidden" name="returnTo" value={here} /><SubmitButton variant="quiet" className="min-h-[30px] px-2 text-xs">{s === "no_show" ? "No-show" : s === "completed" ? "Happened" : "Cancel"}</SubmitButton></form>
                        ))}
                      </div>
                    ) : null}
                  </li>
                ))}
              </ul>
            ) : null}
            <form action={bookingAction} className="flex flex-col gap-2 border-t border-line p-4">
              <input type="hidden" name="contactId" value={c.id} /><input type="hidden" name="opportunityId" value={primaryOpp?.id ?? ""} /><input type="hidden" name="returnTo" value={here} />
              <label className="label" htmlFor="bt">Record a booking</label>
              <input id="bt" name="title" className="field" defaultValue={ctx.workspace.kind === "agency" ? "Discovery call" : "Estimate visit"} />
              <div className="grid grid-cols-[minmax(0,1fr)_96px] gap-2">
                <div className="min-w-0"><label className="sr-only" htmlFor="bs">Start</label><input id="bs" name="startsAt" type="datetime-local" required className="field min-w-0" defaultValue={toLocalInput(tomorrow9, tz)} /></div>
                <div><label className="sr-only" htmlFor="bdur">Minutes</label><select id="bdur" name="duration" className="field" defaultValue="60"><option value="30">30 min</option><option value="60">60 min</option><option value="90">90 min</option></select></div>
              </div>
              <SubmitButton variant="secondary" className="self-start">Record booking</SubmitButton>
              <p className="hint">No calendar is connected, so this is a manual record, not a reservation.</p>
            </form>
          </Section>

          <Section id="ct" title="Contact & consent">
            <dl className="px-4 py-2">
              <KeyVal k="Email consent">{emailConsent ? (emailConsent.status === "granted" ? <Status tone="ok">Granted</Status> : <Status tone="bad">Withdrawn</Status>) : <span className="text-ink-2">Not recorded</span>}</KeyVal>
              <KeyVal k="First touch">{first ? <>{sourceLabel(first)} · <When at={first.at} tz={tz} short /></> : <span className="text-ink-2">Unknown</span>}</KeyVal>
              <KeyVal k="Last touch">{last ? <>{sourceLabel(last)} · <When at={last.at} tz={tz} short /></> : <span className="text-ink-2">Unknown</span>}</KeyVal>
              <KeyVal k="Landing page">{first?.landingPage ? <span className="text-xs [overflow-wrap:anywhere]">{first.landingPage}</span> : <span className="text-ink-2">Unknown</span>}</KeyVal>
            </dl>
            {d.consents.length ? <ul className="border-t border-line px-4 py-2 text-2xs text-ink-2">{d.consents.map((x) => <li key={x.id} className="py-0.5">{x.channel} {x.status} via {x.source} · <When at={x.createdAt} tz={tz} short />{x.wording ? ` · “${x.wording}”` : ""}</li>)}</ul> : null}
            {!d.suppression ? (
              <form action={inboundAction} className="border-t border-line px-4 py-3"><input type="hidden" name="contactId" value={c.id} /><input type="hidden" name="kind" value="opt_out" /><input type="hidden" name="returnTo" value={here} /><SubmitButton variant="danger"><Ban aria-hidden className="h-4 w-4" />Record opt-out</SubmitButton></form>
            ) : null}
          </Section>

          {d.runs.length || d.messages.length ? (
            <Section id="au" title="Automation">
              <ul className="divide-y divide-line text-xs">
                {d.runs.map((r) => <li key={r.id} className="flex justify-between gap-2 px-4 py-2"><span>Follow-up run</span><Status tone={r.status === "completed" ? "ok" : r.status === "stopped" ? "neutral" : r.status === "failed" ? "bad" : "info"}>{r.status}{r.stopReason ? ` — ${r.stopReason.replace(/_/g, " ")}` : ""}</Status></li>)}
                {d.messages.map((m) => <li key={m.id} className="px-4 py-2"><div className="flex justify-between gap-2"><span className="truncate">{m.subject || m.body.slice(0, 40)}</span><Status tone={m.status === "sent" ? "ok" : m.status === "draft" ? "neutral" : "warn"}>{m.status === "held" ? "Held — not sent" : m.status}</Status></div>{m.blockReason ? <p className="mt-1 text-2xs text-ink-2">{m.blockReason}</p> : null}</li>)}
              </ul>
            </Section>
          ) : null}
        </div>
      </div>
    </>
  );
}
