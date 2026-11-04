import Link from "next/link";
import { requireStaffPage } from "@/lib/auth";
import { db } from "@/lib/db";
import { Empty, Flash, PageHeader, Section, Status, SubmitButton, Tabs, When } from "@/components/ui";
import { startCrawlAction } from "./actions";
import { gscForPaths, publicPathFor } from "@/lib/integrations/gsc";

export const metadata = { title: "SEO" };
const SEV = { high: 0, medium: 1, low: 2 } as Record<string, number>;

export default async function Seo({ searchParams }: { searchParams: Promise<{ view?: string; ok?: string; error?: string }> }) {
  const ctx = await requireStaffPage("seo.read");
  const sp = await searchParams;
  const view = sp.view === "resolved" ? "resolved" : "open";
  const tz = ctx.workspace.timezone;
  const [findings, runs, sites, gsc] = await Promise.all([
    db.seoFinding.findMany({ where: { workspaceId: ctx.workspace.id, status: view === "open" ? { in: ["open", "patch_proposed"] } : { in: ["resolved", "dismissed"] } }, orderBy: { createdAt: "desc" }, take: 200 }),
    db.crawlRun.findMany({ where: { workspaceId: ctx.workspace.id }, orderBy: { createdAt: "desc" }, take: 5 }),
    db.site.findMany({ where: { workspaceId: ctx.workspace.id } }),
    db.integration.findFirst({ where: { workspaceId: ctx.workspace.id, provider: "google_search_console" } }),
  ]);
  // Rank: severity, then real Search Console impressions where imported, then effort.
  const siteFor = (u: string) => sites.find((s) => u.includes(`/s/${s.slug}`));
  const pathFor = (u: string) => { const s = siteFor(u); return s ? publicPathFor(u, s.slug) : (() => { try { return new URL(u).pathname.replace(/\/$/, "") || "/"; } catch { return u; } })(); };
  const gscData = await gscForPaths(ctx.workspace.id, [...new Set(findings.flatMap((f) => f.urls.map(pathFor)))]);
  const imp = (f: (typeof findings)[number]) => f.urls.reduce((sum, u) => sum + (gscData?.byPath[pathFor(u)]?.impressions ?? 0), 0);
  findings.sort((a, b) => (SEV[a.severity]! - SEV[b.severity]!) || imp(b) - imp(a) || (a.effort < b.effort ? -1 : 1));
  return (
    <>
      <PageHeader title="SEO" description="Bounded audits of sites you're authorized to check. Each finding shows its evidence, a proposed change and how to verify it." />
      <Flash ok={sp.ok} error={sp.error} />
      <div className="mb-5 grid gap-5 lg:grid-cols-2">
        <Section title="Run an audit">
          <div className="flex flex-col gap-3 p-4">
            {sites.map((s) => (
              <form key={s.id} action={startCrawlAction} className="flex items-center justify-between gap-2"><input type="hidden" name="siteId" value={s.id} /><span className="text-sm">{s.name} <span className="text-2xs text-ink-2">(hosted here — no network needed)</span></span><SubmitButton variant="secondary">Audit</SubmitButton></form>
            ))}
            <form action={startCrawlAction} className="flex flex-col gap-2 border-t border-line pt-3">
              <label className="label" htmlFor="rootUrl">Another site (up to 25 pages)</label>
              <input id="rootUrl" name="rootUrl" type="url" className="field" placeholder="https://client-site.example" />
              <label className="flex items-center gap-2 text-xs"><input type="checkbox" name="authorized" className="h-4 w-4" />I’m authorized to audit this site</label>
              <SubmitButton variant="secondary" className="self-start">Audit URL</SubmitButton>
              <p className="hint">Private and internal addresses are blocked. External sites get written proposals only — no changes are made to them.</p>
            </form>
          </div>
        </Section>
        <Section title="Data sources">
          <ul className="divide-y divide-line text-sm">
            <li className="flex items-center justify-between gap-2 px-4 py-2.5"><span>Crawler</span><Status tone="ok">Working — fixture &amp; owned sites</Status></li>
            <li className="flex items-center justify-between gap-2 px-4 py-2.5"><span>Search Console</span>{gscData ? <Status tone="ok">CSV export, <When at={gscData.periodStart} tz={tz} short /> – <When at={gscData.periodEnd} tz={tz} short /></Status> : gsc?.status === "connected" ? <Status tone="ok">Connected</Status> : <Status>No data — import a CSV in Settings → Integrations</Status>}</li>
            <li className="flex items-center justify-between gap-2 px-4 py-2.5"><span>GA4</span><Status>Not connected</Status></li>
            <li className="flex items-center justify-between gap-2 px-4 py-2.5"><span>Ahrefs</span><Status>Not connected — paid, needs approval</Status></li>
            <li className="flex items-center justify-between gap-2 px-4 py-2.5"><span>Field performance (CrUX)</span><Status>Unavailable</Status></li>
          </ul>
          <p className="border-t border-line px-4 py-2 text-2xs text-ink-2">Without Search Console, findings can’t be ranked by real impressions. Search volume and competitor metrics stay unknown.</p>
          {runs.length ? <ul className="border-t border-line px-4 py-2 text-2xs text-ink-2">{runs.map((r) => <li key={r.id} className="py-0.5">{r.mode === "owned_preview" ? "Hosted site" : r.rootUrl} · {r.status}{r.error ? ` — ${r.error}` : ""} · {r.pagesCrawled} pages · <When at={r.createdAt} tz={tz} short /></li>)}</ul> : null}
        </Section>
      </div>
      <Tabs current={view} items={[{ key: "open", label: "Opportunities", href: "/app/seo" }, { key: "resolved", label: "Resolved & dismissed", href: "/app/seo?view=resolved" }]} />
      <div className="panel overflow-x-auto">
        {findings.length === 0 ? <Empty title={view === "open" ? "No open findings" : "Nothing resolved yet"}>{view === "open" ? "Run an audit to check a site." : "Findings resolve when a re-audit no longer reproduces them."}</Empty> : (
          <table className="table">
            <thead><tr><th scope="col">Finding</th><th scope="col">Pages</th><th scope="col" className="text-right">Impressions{gscData ? "" : " (no data)"}</th><th scope="col">Priority</th><th scope="col">Effort</th><th scope="col">State</th><th scope="col">Seen</th></tr></thead>
            <tbody>
              {findings.map((f) => (
                <tr key={f.id}>
                  <td className="min-w-[240px]"><Link className="font-medium hover:underline" href={`/app/seo/${f.id}`}>{f.finding}</Link><p className="text-2xs text-ink-2">{f.proposedChange}</p></td>
                  <td className="max-w-[220px] text-xs text-ink-2 [overflow-wrap:anywhere]">{f.urls.map((u) => u.replace(/^https?:\/\/[^/]+/, "")).join(", ")}</td>
                  <td className="text-right num">{gscData ? (f.urls.some((u) => gscData.byPath[pathFor(u)]) ? imp(f).toLocaleString("en-US") : <span className="text-ink-2" title="This page isn't in the imported export">—</span>) : <span className="text-ink-2">—</span>}</td>
                  <td><Status tone={f.severity === "high" ? "bad" : f.severity === "medium" ? "warn" : "neutral"}>{f.severity}</Status></td>
                  <td className="num">{f.effort}</td>
                  <td>{f.status === "patch_proposed" ? <Status tone="info">Patch proposed</Status> : f.status === "resolved" ? <Status tone="ok">Resolved</Status> : f.status === "dismissed" ? <Status>Dismissed</Status> : <Status>Open</Status>}</td>
                  <td className="whitespace-nowrap text-ink-2"><When at={f.dataFreshness} tz={tz} short /></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
