import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getSession } from '@/lib/auth';
import { can } from '@/lib/rbac';
import { db } from '@/lib/db';
import { assertEntitled } from '@/lib/plan';
import { auditPages } from '@/lib/seo/audit';
import { crawlSite, normalizeUrl } from '@/lib/seo/crawler';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

const Body = z.object({ projectId: z.string().min(1).max(64) });

/** Crawl the project's own domain and persist the findings. */
export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });
  if (!can(session.role, 'measurement:run')) {
    return NextResponse.json({ error: 'Your role cannot perform this action.' }, { status: 403 });
  }

  let input: z.infer<typeof Body>;
  try {
    input = Body.parse(await req.json());
  } catch {
    return NextResponse.json({ error: 'Provide a projectId.' }, { status: 400 });
  }

  const project = await db.project.findFirst({
    where: { id: input.projectId, orgId: session.orgId },
  });
  if (!project) return NextResponse.json({ error: 'Project not found.' }, { status: 404 });

  await assertEntitled(session.orgId);

  const run = await db.auditRun.create({
    data: { projectId: project.id, status: 'running' },
  });

  try {
    const pages = await crawlSite(normalizeUrl(project.domain), {
      maxPages: 25, concurrency: 4, timeoutMs: 12_000,
    });

    if (!pages.length || pages.every((p) => !p.ok)) {
      await db.auditRun.update({
        where: { id: run.id },
        data: { status: 'failed', finishedAt: new Date() },
      });
      return NextResponse.json(
        { error: `Could not reach ${project.domain}. Check the domain is public and resolvable from this server.` },
        { status: 422 },
      );
    }

    const report = auditPages(pages);

    await db.$transaction([
      db.auditIssue.deleteMany({ where: { auditId: run.id } }),
      db.auditIssue.createMany({
        data: report.findings.map((f) => ({
          auditId: run.id,
          url: f.url,
          code: f.code,
          severity: f.severity,
          title: f.title,
          detail: f.detail,
          category: f.category,
        })),
      }),
      db.auditRun.update({
        where: { id: run.id },
        data: {
          status: 'complete',
          score: report.score,
          pagesCrawled: report.pagesCrawled,
          finishedAt: new Date(),
        },
      }),
    ]);

    return NextResponse.json({
      ok: true,
      auditId: run.id,
      score: report.score,
      pagesCrawled: report.pagesCrawled,
      findings: report.findings.length,
    });
  } catch (err) {
    await db.auditRun.update({
      where: { id: run.id },
      data: { status: 'failed', finishedAt: new Date() },
    }).catch(() => {});
    const message = err instanceof Error ? err.message : 'The crawl failed.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
