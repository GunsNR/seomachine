import { requireStaffPage } from "@/lib/auth";
import { db } from "@/lib/db";
import { Flash, Notice, PageHeader, Section, SubmitButton } from "@/components/ui";
import { PLATFORM_LABEL, PLATFORMS } from "@/lib/content/variants";
import { aiStatus } from "@/lib/ai/provider";
import { newDraftAction } from "../actions";

export const metadata = { title: "New post" };

export default async function NewPost({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  const ctx = await requireStaffPage("content.write");
  const sp = await searchParams;
  const brands = await db.brand.findMany({ where: { workspaceId: ctx.workspace.id } });
  const ai = aiStatus();
  return (
    <>
      <PageHeader title="New post" description="Start from a real customer question and the page you want people to land on." />
      <Flash ok={sp.ok} error={sp.error} />
      {!ai.live ? <div className="mb-4"><Notice tone="neutral" title="Drafts come from a template, not AI">{ai.reason} Templates only use this brand’s approved facts.</Notice></div> : null}
      <Section title="Brief">
        <form action={newDraftAction} className="grid gap-3 p-4 md:grid-cols-2">
          <div><label className="label" htmlFor="brandId">Brand</label><select id="brandId" name="brandId" className="field">{brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select><p className="hint">Each brand’s facts and accounts stay separate.</p></div>
          <div><label className="label" htmlFor="objective">Goal</label><input id="objective" name="objective" className="field" defaultValue="Estimate requests" /></div>
          <div className="md:col-span-2"><label className="label" htmlFor="question">Customer question this answers</label><input id="question" name="question" required className="field" placeholder="e.g. Why does my water heater make a popping noise?" /></div>
          <div><label className="label" htmlFor="cta">Call to action</label><input id="cta" name="cta" className="field" defaultValue="Book a free estimate" /></div>
          <div><label className="label" htmlFor="destinationUrl">Send people to</label><input id="destinationUrl" name="destinationUrl" type="url" required className="field" placeholder="https://…" /><p className="hint">Links get UTM tags with a content ID so leads trace back to this post.</p></div>
          <div><label className="label" htmlFor="campaign">Campaign</label><input id="campaign" name="campaign" className="field" placeholder="e.g. fall-heaters" /></div>
          <fieldset className="md:col-span-2"><legend className="label">Platforms</legend><div className="flex flex-wrap gap-x-4 gap-y-2">{PLATFORMS.map((p) => <label key={p} className="flex items-center gap-1.5 text-sm"><input type="checkbox" name="platforms" value={p} defaultChecked={p === "linkedin" || p === "facebook"} className="h-4 w-4" />{PLATFORM_LABEL[p]}</label>)}</div></fieldset>
          <fieldset className="grid gap-3 rounded-ctl border border-line p-3 md:col-span-2 md:grid-cols-2"><legend className="px-1 text-xs font-medium">Source (optional)</legend>
            <div><label className="label" htmlFor="sourceUrl">Source URL</label><input id="sourceUrl" name="sourceUrl" type="url" className="field" /></div>
            <div><label className="label" htmlFor="sourceTitle">Title</label><input id="sourceTitle" name="sourceTitle" className="field" /></div>
            <div className="md:col-span-2"><label className="label" htmlFor="sourceNote">What it supports</label><input id="sourceNote" name="sourceNote" className="field" /><p className="hint">Saved as “discovery” with today’s retrieval date until someone verifies the specific claim.</p></div>
          </fieldset>
          <div className="md:col-span-2"><SubmitButton>Create draft</SubmitButton></div>
        </form>
      </Section>
    </>
  );
}
