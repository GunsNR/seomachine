import Link from "next/link";
import { ArrowRight, CalendarClock, CheckCheck, Inbox, Send } from "lucide-react";
import { requireStaffPage } from "@/lib/auth";
import { todayData } from "@/lib/today";
import { Empty, Flash, FixtureTag, Money, OverdueBar, Section, Status, When } from "@/components/ui";
import { daysBetween } from "@/lib/time";
import { completeTaskAction } from "./crm/actions";

export const metadata = { title: "Today" };

export default async function Today({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  const ctx = await requireStaffPage("crm.read");
  const sp = await searchParams;
  const d = await todayData(ctx.workspace.id);
  const tz = ctx.workspace.timezone;
  const now = new Date();
  const attention = [
    d.attention.pendingApprovals && { label: `${d.attention.pendingApprovals} post${d.attention.pendingApprovals > 1 ? "s" : ""} waiting for approval`, href: "/app/content?view=review", tone: "warn" as const },
    d.attention.pendingPageChanges && { label: `${d.attention.pendingPageChanges} page change${d.attention.pendingPageChanges > 1 ? "s" : ""} to review`, href: "/app/websites", tone: "warn" as const },
    d.attention.problemPubs && { label: `${d.attention.problemPubs} post${d.attention.problemPubs > 1 ? "s" : ""} failed or unconfirmed`, href: "/app/content?view=problems", tone: "bad" as const },
    d.attention.heldMsgs && { label: `${d.attention.heldMsgs} follow-up message${d.attention.heldMsgs > 1 ? "s" : ""} held — not sent`, href: "/app/settings#automation", tone: "warn" as const },
    d.attention.failedJobs && { label: `${d.attention.failedJobs} background job${d.attention.failedJobs > 1 ? "s" : ""} failed`, href: "/app/settings#health", tone: "bad" as const },
    d.attention.failedRuns && { label: `${d.attention.failedRuns} automation run${d.attention.failedRuns > 1 ? "s" : ""} failed`, href: "/app/settings#automation", tone: "bad" as const },
  ].filter(Boolean) as { label: string; href: string; tone: "warn" | "bad" }[];
  const currencies = Object.entries(d.collections);

  return (
    <>
      <div className="mb-5 flex flex-wrap items-center gap-x-3 gap-y-1">
        <h1 className="text-xl font-semibold tracking-[-0.01em]">Today</h1>
        <span className="text-sm text-ink-2"><When at={now} tz={tz} /></span>
        {ctx.workspace.isFixture ? <FixtureTag /> : null}
      </div>
      <Flash ok={sp.ok} error={sp.error} />

      {d.next ? (
        <div className="on-dark mb-6 flex flex-col gap-3 rounded-panel bg-rail px-4 py-4 text-white sm:flex-row sm:items-center sm:justify-between sm:px-5">
          <div className="min-w-0">
            <p className="text-2xs text-rail-muted">Next up · {d.next.detail}</p>
            <p className="mt-0.5 text-base font-semibold">{d.next.label}</p>
          </div>
          <Link href={d.next.href} className="btn-primary min-h-[40px] shrink-0 px-4">Open <ArrowRight aria-hidden className="h-4 w-4" /></Link>
        </div>
      ) : (
        <div className="mb-6 rounded-panel border border-line bg-surface px-5 py-4">
          <p className="font-medium">Nothing is waiting on you right now.</p>
          <p className="text-xs text-ink-2">New leads and due follow-ups will show here first.</p>
        </div>
      )}

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="flex min-w-0 flex-col gap-5">
          <Section id="fu" title="Follow-ups" count={d.followUps.length} action={<Link className="link text-xs" href="/app/crm?view=list&filter=overdue">All overdue</Link>}>
            {d.followUps.length === 0 ? (
              <Empty title="No follow-ups due">Tasks you or a workflow create appear here when they're due.</Empty>
            ) : (
              <ul className="divide-y divide-line">
                {d.followUps.slice(0, 12).map((t) => (
                  <li key={t.id} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:gap-4">
                    <div className="min-w-0 flex-1">
                      <Link href={t.contactId ? `/app/crm/contacts/${t.contactId}?task=${t.id}` : "/app/crm"} className="block truncate font-medium hover:underline">{t.title}</Link>
                      <p className="truncate text-xs text-ink-2">{t.contactName} · due <When at={t.dueAt} tz={tz} short /></p>
                    </div>
                    <div className="flex items-center gap-3">
                      {t.overdue ? <OverdueBar days={Math.max(1, daysBetween(t.dueAt!, now))} /> : <Status tone="info">Due today</Status>}
                      <form action={completeTaskAction}>
                        <input type="hidden" name="taskId" value={t.id} />
                        <input type="hidden" name="returnTo" value="/app" />
                        <button className="btn-secondary" type="submit"><CheckCheck aria-hidden className="h-4 w-4" />Done</button>
                      </form>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Section>

          <Section id="nl" title="New leads, last 24 hours" count={d.newLeads.length} action={<Link className="link text-xs" href="/app/crm/new">Add a lead</Link>}>
            {d.newLeads.length === 0 ? (
              <Empty title="No new leads today">Form submissions, manual entries and imports land here.</Empty>
            ) : (
              <div className="overflow-x-auto">
                <table className="table">
                  <thead><tr><th scope="col">Who</th><th scope="col">Inquiry</th><th scope="col">Source</th><th scope="col">Stage</th><th scope="col">Received</th></tr></thead>
                  <tbody>
                    {d.newLeads.map((l) => (
                      <tr key={l.id}>
                        <td className="max-w-[180px]"><Link className="font-medium hover:underline" href={`/app/crm/contacts/${l.contactId}`}>{l.name}</Link></td>
                        <td className="max-w-[260px] truncate text-ink-2">{l.title}</td>
                        <td>{l.source === "unknown" ? <span className="text-ink-2">Unknown</span> : l.source}</td>
                        <td>{l.stage}</td>
                        <td className="whitespace-nowrap text-ink-2"><When at={l.createdAt} tz={tz} short /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Section>

          {d.stale.length ? (
            <Section id="st" title="Gone quiet — no activity in 7+ days" count={d.stale.length}>
              <ul className="divide-y divide-line">
                {d.stale.map((o) => (
                  <li key={o.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
                    <div className="min-w-0"><Link className="block truncate font-medium hover:underline" href={`/app/crm/contacts/${o.contactId}`}>{o.name}</Link><p className="truncate text-xs text-ink-2">{o.title} · {o.stage}</p></div>
                    <span className="shrink-0 text-2xs text-ink-2">last touch <When at={o.lastActivityAt} tz={tz} short /></span>
                  </li>
                ))}
              </ul>
            </Section>
          ) : null}
        </div>

        <div className="flex min-w-0 flex-col gap-5">
          <Section id="na" title="Needs attention" count={attention.length}>
            {attention.length === 0 ? <Empty title="All clear">No failed automations, held messages or pending approvals.</Empty> : (
              <ul className="divide-y divide-line">
                {attention.map((a) => (
                  <li key={a.label}><Link href={a.href} className="flex items-center justify-between gap-2 px-4 py-2.5 hover:bg-canvas"><Status tone={a.tone}>{a.label}</Status><ArrowRight aria-hidden className="h-4 w-4 text-ink-2" /></Link></li>
                ))}
              </ul>
            )}
          </Section>

          <Section id="wk" title="Appointments, next 7 days" count={d.bookings.length}>
            {d.bookings.length === 0 ? <Empty title="Nothing booked">Record a booking from a lead's page.</Empty> : (
              <ul className="divide-y divide-line">
                {d.bookings.map((b) => (
                  <li key={b.id} className="flex items-start gap-3 px-4 py-2.5">
                    <CalendarClock aria-hidden className="mt-0.5 h-4 w-4 shrink-0 text-ink-2" strokeWidth={1.75} />
                    <div className="min-w-0">
                      <Link className="block truncate font-medium hover:underline" href={`/app/crm/contacts/${b.contactId}`}>{b.contactName}</Link>
                      <p className="text-xs text-ink-2"><When at={b.startsAt} tz={b.timezone} /> · {b.verified ? "Calendar verified" : "Manual record"}</p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Section>

          <Section id="pr" title="Proposals awaiting a reply" count={d.proposals.length}>
            {d.proposals.length === 0 ? <Empty title="None out">Sent proposals wait here until accepted or declined.</Empty> : (
              <ul className="divide-y divide-line">
                {d.proposals.map((p) => (
                  <li key={p.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
                    <Link className="min-w-0 truncate font-medium hover:underline" href={`/app/crm/proposals/${p.id}`}><Send aria-hidden className="mr-1.5 inline h-3.5 w-3.5 text-ink-2" />{p.title}</Link>
                    <span className="shrink-0 text-2xs text-ink-2">sent <When at={p.sentAt} tz={tz} short /></span>
                  </li>
                ))}
              </ul>
            )}
          </Section>

          <Section id="mo" title="This month">
            <dl className="grid grid-cols-2 gap-px bg-line">
              <div className="bg-surface px-4 py-3"><dt className="text-2xs text-ink-2">Won deals</dt><dd className="text-lg font-semibold num">{d.won.count}</dd></div>
              <div className="bg-surface px-4 py-3">
                <dt className="text-2xs text-ink-2">Collected, net of refunds</dt>
                <dd className="text-lg font-semibold">{currencies.length === 0 ? <span className="text-sm font-normal text-ink-2">No payments recorded</span> : currencies.map(([c, v]) => <div key={c}><Money minor={v.net} currency={c} /></div>)}</dd>
              </div>
            </dl>
            <p className="flex items-center gap-1.5 border-t border-line px-4 py-2 text-2xs text-ink-2"><Inbox aria-hidden className="h-3.5 w-3.5" />Won is not paid. Collections count only recorded payments.</p>
          </Section>
        </div>
      </div>
    </>
  );
}
