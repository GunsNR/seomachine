import { requireStaffPage } from "@/lib/auth";
import { db } from "@/lib/db";
import { can } from "@/lib/rbac";
import { aiStatus } from "@/lib/ai/provider";
import { liveSendingEnabled } from "@/lib/workflows/engine";
import { livePublishingEnabled } from "@/lib/content/adapters";
import { Flash, Notice, PageHeader, Section, Status, SubmitButton, When } from "@/components/ui";
import { contentStudioAction, disconnectAction, emailAction, gscImportAction, testContentStudioAction, verifyEmailAction } from "./actions";

export const metadata = { title: "Integrations" };

function StateChip({ status }: { status?: string }) {
  if (status === "connected") return <Status tone="ok">Connected</Status>;
  if (status === "error" || status === "expired") return <Status tone="bad">{status === "expired" ? "Key expired" : "Needs attention"}</Status>;
  return <Status>Not connected</Status>;
}

export default async function Integrations({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  const ctx = await requireStaffPage();
  const sp = await searchParams;
  const tz = ctx.workspace.timezone;
  const list = await db.integration.findMany({ where: { workspaceId: ctx.workspace.id } });
  const cs = list.find((i) => i.provider === "contentstudio");
  const em = list.find((i) => i.provider === "email_sender");
  const lastGsc = await db.gscRow.findFirst({ where: { workspaceId: ctx.workspace.id }, orderBy: { importedAt: "desc" } });
  const gscCount = lastGsc ? await db.gscRow.count({ where: { workspaceId: ctx.workspace.id, importId: lastGsc.importId } }) : 0;
  const edit = can(ctx.role, "settings.manage");
  const ai = aiStatus();
  const emMeta = (em?.meta ?? {}) as { from?: string; checks?: { domainListed?: boolean; providerVerified?: boolean; dmarc?: boolean } };
  const csMeta = (cs?.meta ?? {}) as { csWorkspaceId?: string; accounts?: { id: string; name: string }[] };
  return (
    <>
      <PageHeader title="Integrations" description="Keys are encrypted and never shown again after you save them. Connecting something doesn't switch on live sending or posting — those are separate server switches." />
      <Flash ok={sp.ok} error={sp.error} />
      <div className="grid gap-5 lg:grid-cols-2">
        <Section title="ContentStudio — social publishing" action={<StateChip status={cs?.status} />}>
          <div className="flex flex-col gap-3 p-4 text-sm">
            <p className="text-xs text-ink-2">Posts to Facebook, Instagram, LinkedIn, TikTok, YouTube, Google Business Profile and more through your ContentStudio plan (API plan listed at $15/mo on 2026-11-03). Live posting also needs LIVE_PUBLISHING_ENABLED — currently <strong>{livePublishingEnabled() ? "on" : "off"}</strong>.</p>
            {cs?.note ? <p className="text-xs">{cs.note}{cs.lastCheckedAt ? <> · checked <When at={cs.lastCheckedAt} tz={tz} short /></> : null}</p> : null}
            {csMeta.accounts?.length ? <details><summary className="cursor-pointer text-xs font-medium">Account IDs to use on destinations ({csMeta.accounts.length})</summary><ul className="mt-1 text-2xs">{csMeta.accounts.map((a) => <li key={a.id}><code className="select-all">{a.id}</code> {a.name}</li>)}</ul></details> : null}
            {edit ? (
              <form action={contentStudioAction} className="grid gap-2">
                <div><label className="label" htmlFor="csKey">API key</label><input id="csKey" name="apiKey" type="password" autoComplete="off" placeholder={cs?.encryptedToken ? "Saved — paste a new key to replace it" : "cs_…"} className="field" /></div>
                <div><label className="label" htmlFor="csWs">ContentStudio workspace ID</label><input id="csWs" name="csWorkspaceId" defaultValue={csMeta.csWorkspaceId ?? ""} className="field" /></div>
                <div className="flex flex-wrap gap-2"><SubmitButton variant="secondary">Save and test</SubmitButton></div>
              </form>
            ) : null}
            {edit && cs?.encryptedToken ? <div className="flex gap-2"><form action={testContentStudioAction}><SubmitButton variant="quiet">Test again</SubmitButton></form><form action={disconnectAction}><input type="hidden" name="provider" value="contentstudio" /><SubmitButton variant="quiet">Disconnect</SubmitButton></form></div> : null}
            <p className="hint">The test makes one read-only call to ContentStudio. After an unclear publish result Growth OS never resends — you’ll be asked to check ContentStudio.</p>
          </div>
        </Section>

        <Section title="Resend — follow-up email" action={<StateChip status={em?.status} />}>
          <div className="flex flex-col gap-3 p-4 text-sm">
            <p className="text-xs text-ink-2">Sends workflow emails from your own domain. Ready only when Resend shows the domain as verified (SPF/DKIM) <em>and</em> the domain has a DMARC record. Live sending also needs LIVE_SENDING_ENABLED — currently <strong>{liveSendingEnabled() ? "on" : "off"}</strong>.</p>
            {emMeta.checks ? <ul className="flex flex-wrap gap-1.5">{([["domainListed", "Domain added"], ["providerVerified", "SPF/DKIM verified"], ["dmarc", "DMARC record"]] as const).map(([k, l]) => <li key={k}><Status tone={emMeta.checks![k] ? "ok" : "bad"}>{l}</Status></li>)}</ul> : null}
            {em?.note ? <p className="text-xs">{em.note}</p> : null}
            {edit ? (
              <form action={emailAction} className="grid gap-2">
                <div><label className="label" htmlFor="reKey">API key</label><input id="reKey" name="apiKey" type="password" autoComplete="off" placeholder={em?.encryptedToken ? "Saved — paste a new key to replace it" : "re_…"} className="field" /></div>
                <div><label className="label" htmlFor="from">From</label><input id="from" name="from" defaultValue={emMeta.from ?? ""} placeholder="Harbor Line <hello@harborline.com>" className="field" /></div>
                <div><label className="label" htmlFor="replyTo">Reply-to (optional)</label><input id="replyTo" name="replyTo" type="email" className="field" /></div>
                <SubmitButton variant="secondary" className="self-start">Save and verify</SubmitButton>
              </form>
            ) : null}
            {edit && em?.encryptedToken ? <div className="flex gap-2"><form action={verifyEmailAction}><SubmitButton variant="quiet">Verify again</SubmitButton></form><form action={disconnectAction}><input type="hidden" name="provider" value="email_sender" /><SubmitButton variant="quiet">Disconnect</SubmitButton></form></div> : null}
            <p className="hint">Every email includes a “reply stop” line; opt-outs are suppressed permanently. Each send uses an idempotency key so a retry can’t send twice.</p>
          </div>
        </Section>

        <Section title="Search Console — CSV import" action={lastGsc ? <Status tone="ok">Data from <When at={lastGsc.importedAt} tz={tz} short /></Status> : <Status>No data</Status>}>
          <div className="flex flex-col gap-3 p-4 text-sm">
            <p className="text-xs text-ink-2">Until the Search Console connection is built, export Performance → Pages (or Queries) as CSV and import it here. Figures are kept exactly as exported, with their date range. Position is Google’s average, not a rank.</p>
            {lastGsc ? <p className="text-xs">Latest: {gscCount} rows for {lastGsc.property}, <When at={lastGsc.periodStart} tz={tz} short /> – <When at={lastGsc.periodEnd} tz={tz} short />.</p> : null}
            {can(ctx.role, "seo.write") ? (
              <form action={gscImportAction} className="grid gap-2">
                <div><label className="label" htmlFor="property">Property</label><input id="property" name="property" required placeholder="https://www.harborline.com/ or sc-domain:harborline.com" className="field" /></div>
                <div className="grid grid-cols-2 gap-2"><div><label className="label" htmlFor="start">From</label><input id="start" name="start" type="date" required className="field" /></div><div><label className="label" htmlFor="end">To</label><input id="end" name="end" type="date" required className="field" /></div></div>
                <div><label className="label" htmlFor="gscFile">CSV export</label><input id="gscFile" name="file" type="file" accept=".csv,text/csv" required className="block w-full text-sm" /></div>
                <SubmitButton variant="secondary" className="self-start">Import</SubmitButton>
              </form>
            ) : null}
          </div>
        </Section>

        <Section title="Other connections">
          <ul className="divide-y divide-line text-sm">
            <li className="flex items-center justify-between gap-2 px-4 py-2.5"><span>AI drafting (Anthropic)</span>{ai.live ? <Status tone="warn">On — {ai.model}</Status> : <Status>Off</Status>}</li>
            <li className="flex items-center justify-between gap-2 px-4 py-2.5"><span>Search Console API, GA4</span><Status>Not built — use CSV import</Status></li>
            <li className="flex items-center justify-between gap-2 px-4 py-2.5"><span>Calendar (Google / Cal.com)</span><Status>Not built — bookings are manual</Status></li>
            <li className="flex items-center justify-between gap-2 px-4 py-2.5"><span>Ahrefs</span><Status>Not built — paid; confirm API eligibility first</Status></li>
            <li className="flex items-center justify-between gap-2 px-4 py-2.5"><span>SMS</span><Status>Not built</Status></li>
          </ul>
          {!ai.live ? <div className="p-4"><Notice tone="neutral" title="AI is off">{ai.reason}</Notice></div> : null}
        </Section>
      </div>
    </>
  );
}
