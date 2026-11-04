import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { requireStaffPage } from "@/lib/auth";
import { db } from "@/lib/db";
import { Flash, KeyVal, Notice, PageHeader, Section, Status, SubmitButton, When } from "@/components/ui";
import { dismissAction, proposePatchAction } from "../actions";

export const metadata = { title: "SEO finding" };
const PATCHABLE = new Set(["title_missing", "title_long", "title_duplicate", "description_missing", "schema_missing", "canonical_missing", "canonical_unknown_target", "noindex_in_sitemap"]);

export default async function Finding({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ ok?: string; error?: string }> }) {
  const ctx = await requireStaffPage("seo.read");
  const { id } = await params;
  const sp = await searchParams;
  const f = await db.seoFinding.findFirst({ where: { workspaceId: ctx.workspace.id, id } });
  if (!f) notFound();
  const run = await db.crawlRun.findFirst({ where: { workspaceId: ctx.workspace.id, id: f.runId } });
  const tz = ctx.workspace.timezone;
  return (
    <>
      <Link href="/app/seo" className="mb-3 inline-flex items-center gap-1 text-xs text-ink-2 hover:text-ink"><ArrowLeft aria-hidden className="h-3.5 w-3.5" />SEO</Link>
      <PageHeader title={f.finding} description={<span className="inline-flex gap-2"><Status tone={f.severity === "high" ? "bad" : f.severity === "medium" ? "warn" : "neutral"}>{f.severity} priority</Status><Status>{f.status.replace("_", " ")}</Status></span>} />
      <Flash ok={sp.ok} error={sp.error} />
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="flex flex-col gap-5">
          <Section title="Evidence">
            <dl className="px-4 py-2">
              <KeyVal k="Pages">{f.urls.map((u) => <span key={u} className="block text-xs [overflow-wrap:anywhere]">{u}</span>)}</KeyVal>
              <KeyVal k="Observed"><pre className="whitespace-pre-wrap text-xs">{JSON.stringify(f.evidence, null, 1)}</pre></KeyVal>
              <KeyVal k="Data from">{run?.mode === "owned_preview" ? "Crawl of the hosted site" : run?.mode === "live" ? "Live crawl" : "Fixture"} · <When at={f.dataFreshness} tz={tz} /></KeyVal>
              <KeyVal k="Rule">{f.rule}</KeyVal>
            </dl>
          </Section>
          <Section title="Proposed change">
            <dl className="px-4 py-2">
              <KeyVal k="Change">{f.proposedChange}</KeyVal>
              <KeyVal k="Why it may help">{f.impactHypothesis}</KeyVal>
              <KeyVal k="Effort / risk">{f.effort} / {f.risk}</KeyVal>
              <KeyVal k="How to verify">{f.verification}</KeyVal>
              <KeyVal k="Intent">{f.businessIntent || <span className="text-ink-2">Not classified</span>}</KeyVal>
            </dl>
          </Section>
        </div>
        <Section title="Act on it">
          <div className="flex flex-col gap-3 p-4">
            {f.pageId && PATCHABLE.has(f.rule) && f.status === "open" ? (
              <form action={proposePatchAction}><input type="hidden" name="findingId" value={f.id} /><SubmitButton>Preview the fix</SubmitButton><p className="hint mt-1">Creates a reviewable change on the page’s current draft. Nothing goes live until you apply and publish it.</p></form>
            ) : f.pageId && f.status === "patch_proposed" ? (
              <Link className="btn-secondary" href={`/app/websites/${f.pageId}`}>Review the proposed change</Link>
            ) : f.pageId ? (
              <Notice tone="neutral" title="Needs a human rewrite">This kind of fix (content, links, duplication) isn’t patched automatically.</Notice>
            ) : (
              <Notice tone="neutral" title="External site">Growth OS has no write access here. Share the proposal with whoever manages the site.</Notice>
            )}
            {f.status === "open" ? <form action={dismissAction}><input type="hidden" name="findingId" value={f.id} /><SubmitButton variant="quiet">Dismiss</SubmitButton></form> : null}
            <p className="hint">Rankings are not guaranteed. Measure the effect in Search Console over several weeks.</p>
          </div>
        </Section>
      </div>
    </>
  );
}
