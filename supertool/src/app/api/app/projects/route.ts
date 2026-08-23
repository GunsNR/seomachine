import { NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { assertWithinLimit } from '@/lib/plan';
import { fail, loadProject, withSession } from '@/lib/route-helpers';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Accepts a bare domain or a full URL and normalises to a bare hostname. */
const domainField = z
  .string()
  .min(3)
  .max(255)
  .transform((v) => v.trim().replace(/^https?:\/\//i, '').replace(/\/.*$/, '').replace(/^www\./i, '').toLowerCase())
  .refine((v) => /^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(v), 'Enter a valid domain, like example.com');

const CreateBody = z.object({
  name: z.string().min(1, 'Give the project a name.').max(120),
  domain: domainField,
  description: z.string().max(400).optional(),
  country: z.string().length(2).optional(),
});

export const POST = withSession(CreateBody, async ({ session, body }) => {
  await assertWithinLimit(session.orgId, 'projects');

  const project = await db.project.create({
    data: {
      orgId: session.orgId,
      name: body.name.trim(),
      domain: body.domain,
      description: body.description?.trim() ?? '',
      country: (body.country ?? 'us').toLowerCase(),
    },
  });

  return NextResponse.json({ ok: true, project });
});

const UpdateBody = z.object({
  id: z.string().min(1).max(64),
  name: z.string().min(1).max(120).optional(),
  domain: domainField.optional(),
  description: z.string().max(400).optional(),
  country: z.string().length(2).optional(),
});

export const PATCH = withSession(UpdateBody, async ({ session, body }) => {
  const existing = await loadProject(session.orgId, body.id);
  if (!existing) return fail('Project not found.', 404);

  const project = await db.project.update({
    where: { id: existing.id },
    data: {
      ...(body.name !== undefined ? { name: body.name.trim() } : {}),
      ...(body.domain !== undefined ? { domain: body.domain } : {}),
      ...(body.description !== undefined ? { description: body.description.trim() } : {}),
      ...(body.country !== undefined ? { country: body.country.toLowerCase() } : {}),
    },
  });

  return NextResponse.json({ ok: true, project });
});

export const DELETE = withSession(null, async ({ session, req }) => {
  const id = new URL(req.url).searchParams.get('id');
  if (!id) return fail('Provide a project id.');

  // Refuse to delete the last project — the dashboard has nothing to show
  // without one, and this is not recoverable.
  const count = await db.project.count({ where: { orgId: session.orgId } });
  if (count <= 1) {
    return fail('This is your only project. Create another before deleting this one.', 409);
  }

  const result = await db.project.deleteMany({ where: { id, orgId: session.orgId } });
  if (result.count === 0) return fail('Project not found.', 404);

  return NextResponse.json({ ok: true });
});
