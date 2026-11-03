import { requirePortalPage } from "@/lib/auth";
import { outcomeReport } from "@/lib/reports";
import { Money, Section } from "@/components/ui";

export const metadata = { title: "Report" };

export default async function PortalReport() {
  const ctx = await requirePortalPage();
  const to = new Date();
  const from = new Date(to.getTime() - 30 * 86400000);
  const r = await outcomeReport(ctx.workspace.id, from, to, null);
  return (
    <>
      <h1 className="text-xl font-semibold">Last 30 days</h1>
      <p className="mb-4 text-sm text-ink-2">Counted from records, not estimates. Anything not yet confirmed shows as not confirmed.</p>
      <Section title="Results">
        <dl className="grid grid-cols-2 gap-px bg-line sm:grid-cols-3">
          {[["New inquiries", r.counts.submissions], ["Opportunities", r.counts.opportunities], ["Confirmed real leads", r.counts.qualified], ["Appointments", r.counts.appointments], ["Jobs won", r.counts.won]].map(([k, v]) => <div key={k as string} className="bg-surface px-4 py-3"><dt className="text-2xs text-ink-2">{k}</dt><dd className="text-lg font-semibold num">{v}</dd></div>)}
          <div className="bg-surface px-4 py-3"><dt className="text-2xs text-ink-2">Collected, net</dt><dd className="text-lg font-semibold">{Object.keys(r.collections).length ? Object.entries(r.collections).map(([c, v]) => <Money key={c} minor={v.net} currency={c} />) : <span className="text-sm font-normal text-ink-2">None recorded</span>}</dd></div>
        </dl>
        <p className="border-t border-line px-4 py-2 text-2xs text-ink-2">{r.attributionCoverage === null ? "No opportunities yet." : `${Math.round(r.attributionCoverage * 100)}% of opportunities have a known source.`} We don’t guarantee rankings or revenue; this shows what actually happened.</p>
      </Section>
    </>
  );
}
