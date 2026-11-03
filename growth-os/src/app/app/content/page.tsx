import Link from "next/link";
import { Plus } from "lucide-react";
import { requireStaffPage } from "@/lib/auth";
import { db } from "@/lib/db";
import { Empty, Flash, PageHeader, Section, Status, Tabs, When, type Tone } from "@/components/ui";
import { formatInZone } from "@/lib/time";
import { PIECE_STATUS } from "@/lib/content/labels";

export const metadata = { title: "Content" };



export default async function Content({ searchParams }: { searchParams: Promise<{ view?: string; ok?: string; error?: string }> }) {
  const ctx = await requireStaffPage("content.write");
  const sp = await searchParams;
  const view = sp.view === "review" ? "review" : sp.view === "problems" ? "problems" : "calendar";
  const tz = ctx.workspace.timezone;
  const pieces = await db.contentPiece.findMany({ where: { workspaceId: ctx.workspace.id, ...(view === "review" ? { status: "in_review" } : view === "problems" ? { status: { in: ["failed", "partial"] } } : {}) }, orderBy: [{ scheduledFor: { sort: "asc", nulls: "last" } }, { createdAt: "desc" }], take: 200 });
  const pubs = await db.publication.findMany({ where: { workspaceId: ctx.workspace.id, pieceId: { in: pieces.map((p) => p.id) } } });
  const reviewCount = await db.contentPiece.count({ where: { workspaceId: ctx.workspace.id, status: "in_review" } });
  const groups = new Map<string, typeof pieces>();
  for (const p of pieces) {
    const k = p.scheduledFor ? formatInZone(p.scheduledFor, tz, { hour: undefined, minute: undefined, timeZoneName: undefined }) : "Not scheduled";
    groups.set(k, [...(groups.get(k) ?? []), p]);
  }
  return (
    <>
      <PageHeader title="Content" description="Brief → draft → review → approval → queue. Approval covers one exact version, destinations and time." actions={<Link className="btn-primary" href="/app/content/new"><Plus aria-hidden className="h-4 w-4" />New post</Link>} />
      <Flash ok={sp.ok} error={sp.error} />
      <Tabs current={view} items={[{ key: "calendar", label: "Calendar", href: "/app/content" }, { key: "review", label: `Needs review (${reviewCount})`, href: "/app/content?view=review" }, { key: "problems", label: "Problems", href: "/app/content?view=problems" }]} />
      {pieces.length === 0 ? <div className="panel"><Empty title={view === "review" ? "Nothing waiting for review" : view === "problems" ? "No failed or partial posts" : "No content yet"} action={view === "calendar" ? <Link className="btn-secondary" href="/app/content/new">Start a post</Link> : undefined} /></div> : (
        <div className="flex flex-col gap-4">
          {[...groups.entries()].map(([day, items]) => (
            <Section key={day} title={day} count={items.length}>
              <ul className="divide-y divide-line">
                {items.map((p) => {
                  const st = PIECE_STATUS[p.status] ?? { label: p.status, tone: "neutral" as Tone };
                  const mine = pubs.filter((x) => x.pieceId === p.id);
                  return (
                    <li key={p.id} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                      <div className="min-w-0">
                        <Link className="block truncate font-medium hover:underline" href={`/app/content/${p.id}`}>{p.title}</Link>
                        <p className="text-2xs text-ink-2">v{p.currentVersion}{p.scheduledFor ? <> · <When at={p.scheduledFor} tz={tz} /></> : null}{mine.length ? ` · ${mine.filter((m) => m.status === "published").length}/${mine.length} destinations done` : ""}</p>
                      </div>
                      <Status tone={st.tone}>{st.label}</Status>
                    </li>
                  );
                })}
              </ul>
            </Section>
          ))}
        </div>
      )}
    </>
  );
}
