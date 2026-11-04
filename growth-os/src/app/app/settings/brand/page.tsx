import { requireStaffPage } from "@/lib/auth";
import { db } from "@/lib/db";
import { BrandProfileSchema } from "@/lib/brand";
import { can } from "@/lib/rbac";
import { Empty, Flash, Notice, PageHeader, Section, Status, SubmitButton, When } from "@/components/ui";
import { addFactAction, brandBasicsAction, reviewFactAction } from "../setup-actions";

export const metadata = { title: "Brand profile" };

const KIND_LABEL: Record<string, string> = { service: "Service", credential: "Licence / credential", service_area: "Service area", offer: "Offer", testimonial: "Testimonial", statistic: "Statistic", contact: "Contact detail", other: "Other" };

export default async function BrandPage({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string; brand?: string }> }) {
  const ctx = await requireStaffPage();
  const sp = await searchParams;
  const brands = await db.brand.findMany({ where: { workspaceId: ctx.workspace.id }, orderBy: { createdAt: "asc" } });
  const brand = brands.find((b) => b.id === sp.brand) ?? brands[0];
  if (!brand?.currentVersionId) return <><PageHeader title="Brand profile" /><div className="panel"><Empty title="No brand in this workspace" /></div></>;
  const bv = await db.brandVersion.findFirst({ where: { workspaceId: ctx.workspace.id, id: brand.currentVersionId } });
  const p = BrandProfileSchema.parse(bv!.profile);
  const versions = await db.brandVersion.count({ where: { workspaceId: ctx.workspace.id, brandId: brand.id } });
  const edit = can(ctx.role, "settings.manage");
  const pending = p.facts.filter((f) => f.review === "needs_review");
  const tz = ctx.workspace.timezone;
  return (
    <>
      <PageHeader title={`Brand profile — ${p.businessName}`} description={<>Version {bv!.version} of {versions} · saved <When at={bv!.createdAt} tz={tz} short />. Every save is a new version; generators use only approved facts from the current one.</>} />
      <Flash ok={sp.ok} error={sp.error} />
      {brands.length > 1 ? <nav aria-label="Brands" className="mb-4 flex flex-wrap gap-2">{brands.map((b) => <a key={b.id} href={`/app/settings/brand?brand=${b.id}`} aria-current={b.id === brand.id ? "page" : undefined} className="btn-secondary aria-[current]:border-ink">{b.name}</a>)}</nav> : null}
      {pending.length ? <div className="mb-4"><Notice tone="warn" title={`${pending.length} fact${pending.length > 1 ? "s" : ""} waiting for review`}>Facts found on a website or inferred are never used until someone approves them.</Notice></div> : null}
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_380px]">
        <Section id="facts" title="Facts we may state" count={p.facts.length}>
          {p.facts.length === 0 ? <Empty title="No facts yet">Add services, licences and real testimonials. Pages and posts can only use what's approved here.</Empty> : (
            <ul className="divide-y divide-line">
              {p.facts.map((f) => (
                <li key={f.id} className="px-4 py-3">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0"><p className="text-sm [overflow-wrap:anywhere]">{f.text}</p><p className="text-2xs text-ink-2">{KIND_LABEL[f.kind]} · from {f.source} ({f.provenance.replace("_", " ")}){f.attribution ? ` · ${f.attribution}` : ""}</p></div>
                    <Status tone={f.review === "approved" ? "ok" : f.review === "rejected" ? "bad" : "warn"}>{f.review === "needs_review" ? "Needs review" : f.review === "approved" ? "Approved" : "Rejected"}</Status>
                  </div>
                  {edit && f.review !== "approved" ? <form action={reviewFactAction} className="mt-2 inline-flex gap-1.5"><input type="hidden" name="brandId" value={brand.id} /><input type="hidden" name="factId" value={f.id} /><SubmitButton variant="secondary" name="review" value="approved">Approve</SubmitButton>{f.review !== "rejected" ? <SubmitButton variant="quiet" name="review" value="rejected">Reject</SubmitButton> : null}</form> : null}
                  {edit && f.review === "approved" ? <form action={reviewFactAction} className="mt-2"><input type="hidden" name="brandId" value={brand.id} /><input type="hidden" name="factId" value={f.id} /><SubmitButton variant="quiet" name="review" value="rejected">Withdraw</SubmitButton></form> : null}
                </li>
              ))}
            </ul>
          )}
          {edit ? (
            <form action={addFactAction} className="grid gap-2 border-t border-line p-4 sm:grid-cols-2">
              <input type="hidden" name="brandId" value={brand.id} />
              <div><label className="label" htmlFor="kind">Type</label><select id="kind" name="kind" className="field">{Object.entries(KIND_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
              <div><label className="label" htmlFor="provenance">Where it came from</label><select id="provenance" name="provenance" className="field"><option value="client_supplied">Client told us</option><option value="document">Client document</option><option value="website">Their website (needs review)</option><option value="inferred">Our inference (needs review)</option></select></div>
              <div className="sm:col-span-2"><label className="label" htmlFor="text">Fact</label><input id="text" name="text" required className="field" placeholder="e.g. Licensed master plumber, NJ" /></div>
              <div><label className="label" htmlFor="source">Source</label><input id="source" name="source" required className="field" placeholder="e.g. licence PDF, call on 3 Nov" /></div>
              <div><label className="label" htmlFor="attribution">Who said it (testimonials)</label><input id="attribution" name="attribution" className="field" placeholder="e.g. R. P., Toms River — Google review" /></div>
              <label className="flex items-center gap-2 text-sm sm:col-span-2"><input type="checkbox" name="approveNow" className="h-4 w-4" />Approve now (only for things the client told us or documented)</label>
              <div className="sm:col-span-2"><SubmitButton variant="secondary">Add fact</SubmitButton></div>
            </form>
          ) : null}
        </Section>
        <Section title="Voice, audience and claims">
          <form action={brandBasicsAction} className="flex flex-col gap-3 p-4">
            <input type="hidden" name="brandId" value={brand.id} />
            <fieldset disabled={!edit} className="flex flex-col gap-3">
              <div><label className="label" htmlFor="businessName">Business name</label><input id="businessName" name="businessName" defaultValue={p.businessName} className="field" /></div>
              <div><label className="label" htmlFor="industry">Industry</label><select id="industry" name="industry" defaultValue={p.industry} className="field"><option value="home_services">Home services</option><option value="healthcare">Healthcare</option><option value="agency">Agency</option><option value="other">Other</option></select><p className="hint">Healthcare pages collect minimal form fields and never ask for medical details.</p></div>
              <div><label className="label" htmlFor="voice">Voice</label><textarea id="voice" name="voice" rows={2} defaultValue={p.voice} className="field" /></div>
              <div><label className="label" htmlFor="audience">Audience</label><textarea id="audience" name="audience" rows={2} defaultValue={p.audience} className="field" /></div>
              <div><label className="label" htmlFor="offers">Offers (one per line)</label><textarea id="offers" name="offers" rows={2} defaultValue={p.offers.join("\n")} className="field" /></div>
              <div><label className="label" htmlFor="serviceAreas">Service areas (comma-separated)</label><input id="serviceAreas" name="serviceAreas" defaultValue={p.serviceAreas.join(", ")} className="field" /></div>
              <div><label className="label" htmlFor="prohibitedClaims">Never say (one per line)</label><textarea id="prohibitedClaims" name="prohibitedClaims" rows={2} defaultValue={p.prohibitedClaims.join("\n")} className="field" /><p className="hint">Drafts containing these are refused.</p></div>
              <div><label className="label" htmlFor="phone">Public phone (optional)</label><input id="phone" name="phone" defaultValue={p.phone} className="field" /></div>
              <div className="grid grid-cols-2 gap-2">{(["primary", "primaryInk", "ink", "muted", "surface"] as const).map((k) => <label key={k} className="text-xs">{{ primary: "Brand colour", primaryInk: "Text on brand colour", ink: "Text", muted: "Secondary text", surface: "Background" }[k]}<input type="color" name={k} defaultValue={p.theme[k]} className="mt-1 block h-9 w-full rounded-ctl border border-line-strong" /></label>)}</div>
              <SubmitButton variant="secondary" className="self-start">Save as new version</SubmitButton>
            </fieldset>
          </form>
        </Section>
      </div>
    </>
  );
}
