import { NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { fail, loadProject, withSession } from '@/lib/route-helpers';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const domainField = z
  .string()
  .min(3)
  .max(255)
  .transform((v) => v.trim().replace(/^https?:\/\//i, '').replace(/\/.*$/, '').replace(/^www\./i, '').toLowerCase())
  .refine((v) => /^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(v), 'Enter a valid domain, like competitor.com');

const AddBody = z.object({
  projectId: z.string().min(1).max(64),
  domain: domainField,
  label: z.string().max(120).optional(),
});

export const POST = withSession(AddBody, async ({ session, body }) => {
  const project = await loadProject(session.orgId, body.projectId);
  if (!project) return fail('Project not found.', 404);

  const count = await db.competitor.count({ where: { projectId: project.id } });
  // More than a handful makes share-of-voice noisy rather than informative.
  if (count >= 10) return fail('You can track up to 10 competitors per project.', 409);

  const existing = await db.competitor.findFirst({
    where: { projectId: project.id, domain: body.domain },
  });
  if (existing) return fail('That competitor is already tracked.', 409);

  // Default the label to the second-level domain, which is what an assistant
  // is most likely to call the vendor.
  const label = body.label?.trim() || body.domain.split('.')[0];

  const competitor = await db.competitor.create({
    data: { projectId: project.id, domain: body.domain, label },
  });

  return NextResponse.json({ ok: true, competitor });
});

export const DELETE = withSession(null, async ({ session, req }) => {
  const id = new URL(req.url).searchParams.get('id');
  if (!id) return fail('Provide a competitor id.');

  const result = await db.competitor.deleteMany({
    where: { id, project: { orgId: session.orgId } },
  });
  if (result.count === 0) return fail('Competitor not found.', 404);

  return NextResponse.json({ ok: true });
});
