import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Download, FlaskConical } from "lucide-react";
import { z } from "zod";
import { requireStaffPage } from "@/lib/auth";
import { db } from "@/lib/db";
import { AssetSchema, PLATFORM_LABEL, VariantSchema, variantIssues, approvalHash } from "@/lib/content/variants";
import { PIECE_STATUS, PUB_STATUS } from "@/lib/content/labels";
import { can } from "@/lib/rbac";
import { toLocalInput } from "@/lib/time";
import { Flash, Notice, PageHeader, Section, Status, SubmitButton, When } from "@/components/ui";
import { decideAction, savePieceAction, scheduleAction, submitAction } from "../actions";

export const metadata = { title: "Post" };

export default async function PiecePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ ok?: string; error?: string }> }) {
  const ctx = await requireStaffPage("content.write");
  const { id } = await params;
  const sp = await searchParams;
  const piece = await db.contentPiece.findFirst({ where: { workspaceId: ctx.workspace.id, id }, include: { versions: { orderBy: { version: "desc" } } } });
  if (!piece) notFound();
  const cur = piece.versions.find((v) => v.version === piece.currentVersion)!;
  const variants = z.array(VariantSchema).parse(cur.variants);
  const asset = cur.asset ? AssetSchema.parse(cur.asset) : null;
  const [dests, approvals, pubs, brief] = await Promise.all([
    db.destination.findMany({ where: { workspaceId: ctx.workspace.id, brandId: piece.brandId } }),
    db.approval.findMany({ where: { workspaceId: ctx.workspace.id, subjectType: "content", subjectId: piece.id }, orderBy: { createdAt: "desc" } }),
    db.publication.findMany({ where: { workspaceId: ctx.workspace.id, pieceId: piece.id }, orderBy: { createdAt: "desc" } }),
    piece.briefId ? db.contentBrief.findFirst({ where: { workspaceId: ctx.workspace.id, id: piece.briefId } }) : null,
  ]);
  const sources = brief?.sourceIds.length ? await db.researchSource.findMany({ where: { workspaceId: ctx.workspace.id, id: { in: brief.sourceIds } } }) : [];
  const tz = ctx.workspace.timezone;
  const st = PIECE_STATUS[piece.status] ?? { label: piece.status, tone: "neutral" as const };
  const active = approvals.find((a) => !a.revokedAt && a.decision === "approved");
  const activeValid = active && active.subjectHash === approvalHash(cur.contentHash, active.destinationIds, active.scheduleAt);
  const canApprove = can(ctx.role, "content.approve");
  // A post that has gone out anywhere is frozen, so it stays clear which version each destination received.
  const locked = ["publishing", "published", "partial"].includes(piece.status);
  const eligible = dests.filter((d) => variants.some((v) => v.platform === d.platform));

  return (
    <>
      <Link href="/app/content" className="mb-3 inline-flex items-center gap-1 text-xs text-ink-2 hover:text-ink"><ArrowLeft aria-hidden className="h-3.5 w-3.5" />Content</Link>
      <PageHeader title={piece.title} description={<span className="inline-flex flex-wrap items-center gap-2"><Status tone={st.tone}>{st.label}</Status><span>Version {cur.version}</span>{cur.generator === "template" ? <Status>Template draft (not AI)</Status> : cur.generator === "ai" ? <Status tone="info">AI draft</Status> : null}</span>}
        actions={piece.status === "draft" || piece.status === "rejected" ? <form action={submitAction}><input type="hidden" name="pieceId" value={piece.id} /><SubmitButton>Send for review</SubmitButton></form> : null} />
      <Flash ok={sp.ok} error={sp.error} />

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
        <form action={savePieceAction} className="flex min-w-0 flex-col gap-4">
          <input type="hidden" name="pieceId" value={piece.id} />
          <fieldset disabled={locked} className="flex flex-col gap-4">
            <Section title="Post text">
              <div className="p-4"><label className="label" htmlFor="title">Internal title</label><input id="title" name="title" defaultValue={piece.title} className="field" /></div>
              {variants.map((v) => {
                const issues = variantIssues(v);
                return (
                  <div key={v.platform} className="border-t border-line p-4">
                    <input type="hidden" name="platform" value={v.platform} />
                    <div className="mb-2 flex items-center justify-between"><h3 className="text-sm font-semibold">{PLATFORM_LABEL[v.platform]}</h3><span className="text-2xs text-ink-2 num">{v.caption.length} chars</span></div>
                    {v.platform === "youtube" ? <div className="mb-2"><label className="label" htmlFor={`${v.platform}_title`}>Video title</label><input id={`${v.platform}_title`} name={`${v.platform}_title`} defaultValue={v.title} className="field" /></div> : null}
                    <label className="label" htmlFor={`${v.platform}_caption`}>Caption</label>
                    <textarea id={`${v.platform}_caption`} name={`${v.platform}_caption`} rows={5} defaultValue={v.caption} className="field" />
                    <div className="mt-2 grid gap-2 md:grid-cols-3">
                      <div><label className="label" htmlFor={`${v.platform}_hashtags`}>Researched hashtags</label><input id={`${v.platform}_hashtags`} name={`${v.platform}_hashtags`} defaultValue={v.hashtags.join(", ")} className="field" /></div>
                      <div><label className="label" htmlFor={`${v.platform}_mentions`}>Checked @mentions</label><input id={`${v.platform}_mentions`} name={`${v.platform}_mentions`} defaultValue={v.mentions.join(", ")} className="field" /></div>
                      <div><label className="label" htmlFor={`${v.platform}_internal`}>Internal tags (never posted)</label><input id={`${v.platform}_internal`} name={`${v.platform}_internal`} defaultValue={v.internalTags.join(", ")} className="field" /></div>
                    </div>
                    <input type="hidden" name={`${v.platform}_hook`} value={v.hook} />
                    {issues.length ? <p className="mt-2 text-xs text-bad">{issues.join(" ")}</p> : null}
                  </div>
                );
              })}
            </Section>
            {asset ? (
              <Section title="Branded image" action={<span className="text-2xs text-ink-2">1080×1350 SVG, in the client’s theme</span>}>
                <div className="flex gap-3 overflow-x-auto p-4">
                  {asset.slides.map((_, i) => (
                    // eslint-disable-next-line @next/next/no-img-element
                    <a key={i} href={`/api/assets/${cur.id}?slide=${i}&download=1`} className="shrink-0" title={`Download slide ${i + 1}`}><img src={`/api/assets/${cur.id}?slide=${i}`} alt={`Slide ${i + 1}: ${asset.slides[i]!.heading}`} width={160} height={200} className="rounded-ctl border border-line" /></a>
                  ))}
                </div>
                <div className="grid gap-2 border-t border-line p-4">
                  {[0, 1, 2, 3, 4].map((i) => (
                    <div key={i} className="grid gap-2 md:grid-cols-2">
                      <div><label className="label" htmlFor={`slide${i}_heading`}>Slide {i + 1} heading</label><input id={`slide${i}_heading`} name={`slide${i}_heading`} defaultValue={asset.slides[i]?.heading ?? ""} className="field" /></div>
                      <div><label className="label" htmlFor={`slide${i}_body`}>Text</label><input id={`slide${i}_body`} name={`slide${i}_body`} defaultValue={asset.slides[i]?.body ?? ""} className="field" /></div>
                    </div>
                  ))}
                  <div className="grid gap-2 md:grid-cols-2">
                    <div><label className="label" htmlFor="footer">Footer</label><input id="footer" name="footer" defaultValue={asset.footer} className="field" /></div>
                    <div><label className="label" htmlFor="license">Image source / licence</label><input id="license" name="license" defaultValue={asset.license} className="field" /></div>
                  </div>
                  <p className="hint flex items-center gap-1"><Download aria-hidden className="h-3 w-3" />Click a slide to download it. Video rendering isn’t connected — scripts stay scripts.</p>
                </div>
              </Section>
            ) : null}
            {!locked ? <SubmitButton variant="secondary" className="self-start">Save as new version</SubmitButton> : null}
          </fieldset>
        </form>

        <div className="flex min-w-0 flex-col gap-5">
          <Section title="Approval">
            <div className="flex flex-col gap-3 p-4">
              {active ? (activeValid ? <Notice tone="ok" title={`Approved v${cur.version}`}>For {active.destinationIds.length} destination{active.destinationIds.length > 1 ? "s" : ""}{active.scheduleAt ? <>, at <When at={active.scheduleAt} tz={tz} /></> : ", to go now"}.</Notice> : <Notice tone="warn" title="Approval no longer matches">The post changed after approval. It must be approved again.</Notice>) : null}
              {locked ? <p className="text-xs text-ink-2">This post has gone out to at least one destination, so it can’t be edited or re-approved. Failed destinations are listed below with the reason.</p> : null}
              {canApprove && !locked ? (
                <form action={decideAction} className="flex flex-col gap-3">
                  <input type="hidden" name="pieceId" value={piece.id} />
                  <fieldset><legend className="label">Destinations</legend>
                    {eligible.length === 0 ? <p className="hint">No destination for these platforms on this brand.</p> : eligible.map((d) => (
                      <label key={d.id} className="flex items-start gap-2 py-1 text-sm"><input type="checkbox" name="destinationIds" value={d.id} defaultChecked={d.status !== "not_connected"} disabled={d.status === "not_connected"} className="mt-1 h-4 w-4" />
                        <span>{d.label}<span className="block text-2xs text-ink-2">{d.adapter === "dry_run" ? "Dry run — nothing is posted" : d.status === "manual_handoff" ? "You'll get a package to post by hand" : d.status === "not_connected" ? "Not available — no eligible connection" : d.status}</span></span></label>
                    ))}
                  </fieldset>
                  <div><label className="label" htmlFor="scheduleAt">Post at ({tz.replace("_", " ")})</label><input id="scheduleAt" name="scheduleAt" type="datetime-local" className="field" defaultValue={piece.scheduledFor ? toLocalInput(piece.scheduledFor, tz) : ""} /><p className="hint">Leave blank to queue right away. This suggested time is a cold-start default, not based on your account’s data.</p></div>
                  <div><label className="label" htmlFor="note">Note (required to send back)</label><input id="note" name="note" className="field" /></div>
                  <div className="flex flex-wrap gap-2"><SubmitButton name="decision" value="approved">Approve this version</SubmitButton><SubmitButton variant="secondary" name="decision" value="rejected">Send back</SubmitButton></div>
                </form>
              ) : !canApprove ? <p className="text-xs text-ink-2">An owner, admin or the client approves posts.</p> : null}
              {active && activeValid && piece.status === "approved" ? <form action={scheduleAction}><input type="hidden" name="pieceId" value={piece.id} /><SubmitButton>Queue for publishing</SubmitButton></form> : null}
            </div>
          </Section>

          <Section title="Per destination" count={pubs.length}>
            {pubs.length === 0 ? <p className="px-4 py-3 text-xs text-ink-2">Nothing queued yet.</p> : (
              <ul className="divide-y divide-line">
                {pubs.map((p) => {
                  const d = dests.find((x) => x.id === p.destinationId);
                  const ps = PUB_STATUS[p.status] ?? { label: p.status, tone: "neutral" as const };
                  return (
                    <li key={p.id} className="px-4 py-2.5">
                      <div className="flex items-start justify-between gap-2"><span className="min-w-0 text-sm font-medium">{d?.label ?? "Removed destination"}</span>{d?.adapter === "dry_run" ? <FlaskConical aria-label="Dry run" className="h-4 w-4 shrink-0 text-info" /> : null}</div>
                      <Status tone={ps.tone}>{ps.label}</Status>
                      {p.lastError ? <p className="mt-1 text-2xs text-ink-2">{p.lastError}</p> : null}
                      {p.publishedUrl ? <p className="mt-1 text-2xs text-ink-2 [overflow-wrap:anywhere]">{d?.adapter === "dry_run" ? "Simulated link: " : "Link: "}{p.publishedUrl}</p> : null}
                    </li>
                  );
                })}
              </ul>
            )}
          </Section>

          {brief ? (
            <Section title="Brief & sources">
              <dl className="px-4 py-3 text-xs">
                <p><span className="text-ink-2">Goal:</span> {brief.objective}</p>
                <p><span className="text-ink-2">Sends to:</span> <span className="[overflow-wrap:anywhere]">{brief.destinationUrl}</span></p>
                <p><span className="text-ink-2">Content ID:</span> {brief.contentKey} <span className="text-ink-2">(campaign {brief.campaignKey})</span></p>
              </dl>
              {sources.length ? <ul className="border-t border-line px-4 py-2 text-xs">{sources.map((s) => <li key={s.id} className="py-1"><a className="link" href={s.url} target="_blank" rel="noreferrer nofollow">{s.title}</a> · retrieved <When at={s.retrievedAt} tz={tz} short /> · <Status tone={s.evidence === "verified" ? "ok" : "warn"}>{s.evidence === "verified" ? "Verified" : "Discovery only"}</Status>{s.excerpt ? <p className="text-ink-2">{s.excerpt}</p> : null}</li>)}</ul> : <p className="border-t border-line px-4 py-2 text-2xs text-ink-2">No sources attached. Don’t state facts the brand profile doesn’t already approve.</p>}
            </Section>
          ) : null}

          <Section title="Versions" count={piece.versions.length}>
            <ul className="divide-y divide-line text-xs">{piece.versions.map((v) => <li key={v.id} className="flex justify-between px-4 py-2"><span>v{v.version} · {v.generator}</span><When at={v.createdAt} tz={tz} short /></li>)}</ul>
            <ul className="border-t border-line text-2xs text-ink-2">{approvals.slice(0, 5).map((a) => <li key={a.id} className="px-4 py-1.5">{a.decision} by {a.approverRole}{a.revokedAt ? ` · revoked: ${a.revokedReason}` : ""} · <When at={a.createdAt} tz={tz} short /></li>)}</ul>
          </Section>
        </div>
      </div>
    </>
  );
}
