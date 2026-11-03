import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowDown, ArrowLeft, ArrowUp, Download, Eye, Trash2 } from "lucide-react";
import { z } from "zod";
import { requireStaffPage } from "@/lib/auth";
import { db } from "@/lib/db";
import { loadPage } from "@/lib/site/pages";
import { heroChecks, SECTION_LABEL, type Section } from "@/lib/site/sections";
import { describePatch, PatchOpSchema } from "@/lib/site/patch";
import { approvedFacts, BrandProfileSchema, ThemeSchema, themeIssues } from "@/lib/brand";
import { aiStatus } from "@/lib/ai/provider";
import { Flash, Notice, PageHeader, Section as Panel, Status, SubmitButton, When } from "@/components/ui";
import { addSectionAction, applyChangeAction, moveSectionAction, proposeEditAction, publishAction, rejectChangeAction, removeSectionAction, rollbackAction, saveMetaAction, saveSectionAction, themeAction } from "../actions";

export const metadata = { title: "Page editor" };

function Field({ name, label, value, area, hint }: { name: string; label: string; value: string; area?: boolean; hint?: string }) {
  const id = `f-${name.replace(/\W/g, "-")}`;
  return (
    <div>
      <label className="label" htmlFor={id}>{label}</label>
      {area ? <textarea id={id} name={name} rows={2} defaultValue={value} className="field" /> : <input id={id} name={name} defaultValue={value} className="field" />}
      {hint ? <p className="hint">{hint}</p> : null}
    </div>
  );
}

function SectionFields({ s, facts }: { s: Section; facts: { id: string; text: string; kind: string }[] }) {
  switch (s.type) {
    case "hero":
      return (<>
        <Field name="s_headline" label="Headline" value={s.headline} />
        <Field name="s_subhead" label="Supporting line" value={s.subhead} area />
        <Field name="s_ctaLabel" label="Button label" value={s.ctaLabel} />
        <div><label className="label" htmlFor={`pf-${s.id}`}>Proof under the button</label>
          <select id={`pf-${s.id}`} name="s_proofFactId" defaultValue={s.proofFactId} className="field"><option value="">None</option>{facts.map((f) => <option key={f.id} value={f.id}>{f.text.slice(0, 70)}</option>)}</select>
          <p className="hint">Only approved brand facts can be shown as proof.</p></div>
      </>);
    case "benefits":
      return (<><Field name="s_heading" label="Heading" value={s.heading} />{s.items.map((it, i) => <div key={i} className="grid gap-2 sm:grid-cols-2"><Field name={`s_items.${i}.title`} label={`Benefit ${i + 1}`} value={it.title} /><Field name={`s_items.${i}.body`} label="Detail" value={it.body} /></div>)}<div className="grid gap-2 sm:grid-cols-2"><Field name={`s_items.${s.items.length}.title`} label="Add a benefit" value="" /><Field name={`s_items.${s.items.length}.body`} label="Detail" value="" /></div></>);
    case "services":
      return (<><Field name="s_heading" label="Heading" value={s.heading} />{s.items.map((it, i) => <div key={i} className="grid gap-2 sm:grid-cols-2"><Field name={`s_items.${i}.name`} label={`Service ${i + 1}`} value={it.name} /><Field name={`s_items.${i}.body`} label="Short description" value={it.body} /></div>)}<div className="grid gap-2 sm:grid-cols-2"><Field name={`s_items.${s.items.length}.name`} label="Add a service" value="" /><Field name={`s_items.${s.items.length}.body`} label="Short description" value="" /></div></>);
    case "faq":
      return (<><Field name="s_heading" label="Heading" value={s.heading} />{s.items.map((it, i) => <div key={i} className="grid gap-2"><Field name={`s_items.${i}.q`} label={`Question ${i + 1}`} value={it.q} /><Field name={`s_items.${i}.a`} label="Answer" value={it.a} area /></div>)}<Field name={`s_items.${s.items.length}.q`} label="Add a question" value="" /><Field name={`s_items.${s.items.length}.a`} label="Answer" value="" area hint="Use questions real customers ask. Leave blank to skip." /></>);
    case "proof":
      return (<><Field name="s_heading" label="Heading" value={s.heading} />
        <fieldset><legend className="label">Approved facts to show</legend>{facts.length === 0 ? <p className="hint">No approved credentials or testimonials yet. Approve them in the brand profile.</p> : facts.map((f) => <label key={f.id} className="flex items-start gap-2 py-1 text-sm"><input type="checkbox" name="s_factIds" value={f.id} defaultChecked={s.factIds.includes(f.id)} className="mt-1 h-4 w-4" />{f.text}</label>)}</fieldset></>);
    case "lead_form":
      return (<><Field name="s_heading" label="Heading" value={s.heading} /><Field name="s_body" label="Text above the form" value={s.body} area /><Field name="s_submitLabel" label="Button label" value={s.submitLabel} /><Field name="s_consentText" label="Email consent wording" value={s.consentText} hint="Shown next to an optional checkbox; stored with each lead that ticks it." />
        <input type="hidden" name="s_askService" value="on" /></>);
    case "booking_cta":
      return (<><Field name="s_heading" label="Heading" value={s.heading} /><Field name="s_body" label="Text" value={s.body} /><Field name="s_label" label="Button label" value={s.label} /></>);
    case "footer":
      return <Field name="s_text" label="Footer text" value={s.text} />;
  }
}

export default async function Editor({ params, searchParams }: { params: Promise<{ pageId: string }>; searchParams: Promise<{ ok?: string; error?: string }> }) {
  const ctx = await requireStaffPage("site.write");
  const { pageId } = await params;
  const sp = await searchParams;
  const loaded = await loadPage(ctx.workspace.id, pageId).catch(() => null);
  if (!loaded) notFound();
  const { page, doc } = loaded;
  const site = page.site;
  const brand = await db.brand.findFirst({ where: { workspaceId: ctx.workspace.id, id: site.brandId } });
  const bv = brand?.currentVersionId ? await db.brandVersion.findFirst({ where: { workspaceId: ctx.workspace.id, id: brand.currentVersionId } }) : null;
  const profile = BrandProfileSchema.parse(bv!.profile);
  const theme = ThemeSchema.parse(site.theme);
  const facts = approvedFacts(profile).filter((f) => ["credential", "testimonial", "offer", "other"].includes(f.kind));
  const versions = await db.pageVersion.findMany({ where: { workspaceId: ctx.workspace.id, pageId }, orderBy: { version: "desc" }, take: 15 });
  const changes = await db.pageChange.findMany({ where: { workspaceId: ctx.workspace.id, pageId }, orderBy: { createdAt: "desc" }, take: 10 });
  const checks = heroChecks(doc.sections, profile);
  const tIssues = themeIssues(theme);
  const ai = aiStatus();
  const tz = ctx.workspace.timezone;
  const base = page.draftVersion;
  const hidden = (<><input type="hidden" name="pageId" value={page.id} /><input type="hidden" name="baseVersion" value={base} /></>);

  return (
    <>
      <Link href="/app/websites" className="mb-3 inline-flex items-center gap-1 text-xs text-ink-2 hover:text-ink"><ArrowLeft aria-hidden className="h-3.5 w-3.5" />Websites</Link>
      <PageHeader title={`${site.name} — /${page.slug === "home" ? "" : page.slug}`}
        description={<>Editing draft v{base}. {page.publishedVersion ? <>Live: v{page.publishedVersion}.</> : "Not published yet."} Uses {site.name}’s brand theme, not Rank Logic’s.</>}
        actions={<>
          <a className="btn-secondary" href={`/preview/${page.id}`} target="_blank" rel="noreferrer"><Eye aria-hidden className="h-4 w-4" />Preview draft</a>
          <a className="btn-quiet" href={`/api/export/page/${page.id}`}><Download aria-hidden className="h-4 w-4" />Export HTML</a>
          {page.publishedVersion === base ? <Status tone="ok">Live version is up to date</Status> : <form action={publishAction}><input type="hidden" name="pageId" value={page.id} /><input type="hidden" name="version" value={base} /><SubmitButton>{`Publish v${base}`}</SubmitButton></form>}
        </>} />
      <Flash ok={sp.ok} error={sp.error} />

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="flex min-w-0 flex-col gap-4">
          <Panel title="Ask for a change" action={<Status>Template commands (not AI)</Status>}>
            <form action={proposeEditAction} className="flex flex-col gap-2 p-4">
              {hidden}
              <label className="label" htmlFor="instruction">Describe the change</label>
              <textarea id="instruction" name="instruction" rows={2} className="field" placeholder={"headline: Water heater repair in Lakewood\nmove faq up"} />
              <p className="hint">{ai.live ? "AI page editing isn’t connected yet, so this uses commands." : ai.reason} Commands: headline:, subhead:, button:, title:, description:, move &lt;section&gt; up/down, remove &lt;section&gt;. You review the before/after before anything is saved.</p>
              <SubmitButton variant="secondary" className="self-start">Propose change</SubmitButton>
            </form>
            {changes.filter((c) => c.status === "proposed").map((c) => {
              const ops = z.array(PatchOpSchema).parse(c.patch);
              const lines = describePatch(doc, ops);
              const stale = c.baseVersion !== base;
              return (
                <div key={c.id} className="border-t border-line p-4">
                  <div className="mb-2 flex flex-wrap items-center gap-2"><Status tone={stale ? "bad" : "warn"}>{stale ? `Stale — made on v${c.baseVersion}` : "Waiting for review"}</Status><span className="text-xs text-ink-2">{c.origin === "seo_patch" ? "From SEO finding" : c.origin === "ai_edit" ? "AI proposal" : "Template edit (not AI)"} · <When at={c.createdAt} tz={tz} short /></span></div>
                  <p className="mb-2 text-xs text-ink-2">{c.rationale}</p>
                  <table className="table rounded-ctl border border-line"><thead><tr><th scope="col">What</th><th scope="col">Before</th><th scope="col">After</th></tr></thead>
                    <tbody>{lines.map((l, i) => <tr key={i}><td className="text-xs">{l.label}</td><td className="text-xs text-ink-2 line-through decoration-bad/50 [overflow-wrap:anywhere]">{l.before}</td><td className="text-xs [overflow-wrap:anywhere]">{l.after}</td></tr>)}</tbody></table>
                  <div className="mt-3 flex gap-2">
                    <form action={applyChangeAction}><input type="hidden" name="pageId" value={page.id} /><input type="hidden" name="changeId" value={c.id} /><SubmitButton variant={stale ? "secondary" : "primary"}>Apply to draft</SubmitButton></form>
                    <form action={rejectChangeAction}><input type="hidden" name="pageId" value={page.id} /><input type="hidden" name="changeId" value={c.id} /><SubmitButton variant="quiet">Reject</SubmitButton></form>
                  </div>
                  {stale ? <p className="hint mt-2">Someone saved a newer version since this was proposed. Applying it will be refused so their edit isn’t overwritten. Reject it and ask again.</p> : null}
                </div>
              );
            })}
          </Panel>

          {doc.sections.map((s, i) => (
            <details key={s.id} className="panel group" open={i === 0}>
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 [&::-webkit-details-marker]:hidden">
                <span className="text-sm font-semibold">{i + 1}. {SECTION_LABEL[s.type]} <span className="font-normal text-ink-2">{"headline" in s ? `— ${s.headline}` : "heading" in s ? `— ${s.heading}` : ""}</span></span>
                <span className="text-2xs text-ink-2 group-open:hidden">Edit</span>
              </summary>
              <div className="flex flex-wrap gap-1.5 border-t border-line px-4 py-2">
                <form action={moveSectionAction}>{hidden}<input type="hidden" name="sectionId" value={s.id} /><input type="hidden" name="dir" value="up" /><button className="btn-quiet min-h-[30px] px-2 text-xs" disabled={i === 0} type="submit"><ArrowUp aria-hidden className="h-3.5 w-3.5" />Move up</button></form>
                <form action={moveSectionAction}>{hidden}<input type="hidden" name="sectionId" value={s.id} /><input type="hidden" name="dir" value="down" /><button className="btn-quiet min-h-[30px] px-2 text-xs" disabled={i === doc.sections.length - 1} type="submit"><ArrowDown aria-hidden className="h-3.5 w-3.5" />Move down</button></form>
                {s.type !== "hero" && s.type !== "lead_form" ? <form action={removeSectionAction}>{hidden}<input type="hidden" name="sectionId" value={s.id} /><button className="btn-quiet min-h-[30px] px-2 text-xs text-bad" type="submit"><Trash2 aria-hidden className="h-3.5 w-3.5" />Remove</button></form> : null}
              </div>
              <form action={saveSectionAction} className="flex flex-col gap-3 border-t border-line p-4">
                {hidden}<input type="hidden" name="sectionId" value={s.id} />
                <SectionFields s={s} facts={facts} />
                <SubmitButton variant="secondary" className="self-start">Save section</SubmitButton>
              </form>
            </details>
          ))}

          <form action={addSectionAction} className="panel flex flex-wrap items-end gap-2 p-4">
            {hidden}
            <div><label className="label" htmlFor="addtype">Add a section</label><select id="addtype" name="type" className="field"><option value="benefits">Benefits</option><option value="faq">FAQ</option><option value="booking_cta">Booking call-to-action</option><option value="proof">Verified proof</option></select></div>
            <SubmitButton variant="secondary">Add</SubmitButton>
          </form>
        </div>

        <div className="flex min-w-0 flex-col gap-5">
          <Panel title="Conversion checks" action={<span className="text-2xs text-ink-2">{checks.filter((c) => c.pass).length} of {checks.length} pass</span>}>
            <ul className="divide-y divide-line">{checks.map((c) => <li key={c.label} className="px-4 py-2.5"><Status tone={c.pass ? "ok" : "warn"}>{c.label}</Status><p className="mt-1 text-2xs text-ink-2">{c.detail}</p></li>)}</ul>
            <p className="border-t border-line px-4 py-2 text-2xs text-ink-2">Checks adapted from the hero CRO audit. Passing them is not a promise of more leads.</p>
          </Panel>

          <Panel title="Search & sharing">
            <form action={saveMetaAction} className="flex flex-col gap-3 p-4">
              {hidden}
              <Field name="title" label={`Title — ${doc.meta.title.length} of 60 characters`} value={doc.meta.title} hint={doc.meta.title.length > 60 ? "Over 60 characters: search results may cut it off." : undefined} />
              <Field name="description" label={`Description — ${doc.meta.description.length} of 160 characters`} value={doc.meta.description} area hint={doc.meta.description.length === 0 ? "Missing: search engines will pick their own snippet." : undefined} />
              <Field name="canonicalPath" label="Canonical path (blank = this page)" value={doc.meta.canonicalPath} />
              <div><label className="label" htmlFor="schemaType">Structured data</label><select id="schemaType" name="schemaType" defaultValue={doc.meta.schemaType} className="field"><option value="none">None</option><option value="LocalBusiness">LocalBusiness</option><option value="MedicalBusiness">MedicalBusiness</option><option value="ProfessionalService">ProfessionalService</option></select><p className="hint">Only facts visible on the page go into it. It doesn’t guarantee rich results.</p></div>
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="noindex" defaultChecked={doc.meta.noindex} className="h-4 w-4" />Hide from search engines (noindex)</label>
              <SubmitButton variant="secondary" className="self-start">Save settings</SubmitButton>
            </form>
          </Panel>

          <Panel title="Brand theme">
            <form action={themeAction} className="grid grid-cols-2 gap-2 p-4">
              <input type="hidden" name="siteId" value={site.id} /><input type="hidden" name="returnTo" value={`/app/websites/${page.id}`} />
              {(["primary", "primaryInk", "surface", "ink", "muted"] as const).map((k) => (
                <label key={k} className="text-xs">{{ primary: "Button colour", primaryInk: "Button text", surface: "Background", ink: "Text", muted: "Secondary text" }[k]}
                  <span className="mt-1 flex items-center gap-1.5"><input type="color" name={k} defaultValue={theme[k]} className="h-9 w-10 rounded-ctl border border-line-strong" aria-label={k} /><span className="num text-2xs text-ink-2">{theme[k]}</span></span></label>
              ))}
              <label className="text-xs">Font<select name="font" defaultValue={theme.font} className="field mt-1"><option value="system-sans">Clean sans</option><option value="system-serif">Classic serif</option><option value="humanist">Friendly</option><option value="geometric">Geometric</option></select></label>
              <label className="text-xs">Corners<select name="radius" defaultValue={theme.radius} className="field mt-1"><option value="none">Square</option><option value="small">Slightly rounded</option><option value="round">Rounded</option></select></label>
              {tIssues.length ? <div className="col-span-2"><Notice tone="warn" title="Contrast problem">{tIssues.join(" ")}</Notice></div> : null}
              <div className="col-span-2"><SubmitButton variant="secondary">Save theme</SubmitButton><p className="hint">Themes that fail WCAG AA contrast are refused.</p></div>
            </form>
          </Panel>

          <Panel title="Versions" count={versions.length}>
            <ul className="divide-y divide-line">
              {versions.map((v) => (
                <li key={v.id} className="flex items-center justify-between gap-2 px-4 py-2">
                  <div className="min-w-0 text-xs"><p className="font-medium">v{v.version} {v.version === page.publishedVersion ? <Status tone="ok">Live</Status> : v.version === base ? <Status>Draft</Status> : null}</p><p className="truncate text-ink-2">{v.note || v.origin} · <When at={v.createdAt} tz={tz} short /></p></div>
                  <div className="flex shrink-0 gap-1">
                    <a className="btn-quiet min-h-[30px] px-2 text-xs" href={`/preview/${page.id}?v=${v.version}`} target="_blank" rel="noreferrer">View</a>
                    {v.version !== base ? <form action={rollbackAction}><input type="hidden" name="pageId" value={page.id} /><input type="hidden" name="version" value={v.version} /><input type="hidden" name="publish" value="on" /><button className="btn-quiet min-h-[30px] px-2 text-xs" type="submit">Restore &amp; publish</button></form> : null}
                  </div>
                </li>
              ))}
            </ul>
          </Panel>
        </div>
      </div>
    </>
  );
}
