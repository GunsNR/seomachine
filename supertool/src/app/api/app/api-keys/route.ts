import { NextResponse } from 'next/server';
import { z } from 'zod';
import { generateKey, newQuotaGroupId, rotateApiKey, type RotationRejection } from '@/lib/apikey';
import { getSession } from '@/lib/auth';
import { can } from '@/lib/rbac';
import { db } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Every response from this route, including the errors.
 *
 * Two of these responses carry a plaintext API key, which is the only copy
 * that will ever exist. `dynamic = 'force-dynamic'` does not imply a
 * cache directive — the route was observed emitting no `Cache-Control` header
 * at all — so a shared cache or a back/forward navigation could hold a secret
 * the server intended to hand over exactly once. Setting it here rather than on
 * the two secret-bearing returns means a future handler cannot forget.
 */
function json(body: unknown, status = 200): NextResponse {
  return NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
}

const CreateBody = z.object({
  projectId: z.string().min(1).max(64),
  label: z.string().min(1).max(80),
});

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return json({ error: 'Not signed in.' }, 401);
  if (!can(session.role, 'apikey:manage')) {
    return json({ error: 'Your role cannot perform this action.' }, 403);
  }

  let input: z.infer<typeof CreateBody>;
  try {
    input = CreateBody.parse(await req.json());
  } catch {
    return json({ error: 'Provide a projectId and a label.' }, 400);
  }

  const project = await db.project.findFirst({
    where: { id: input.projectId, orgId: session.orgId },
  });
  if (!project) return json({ error: 'Project not found.' }, 404);

  const { plaintext, prefix, hashed } = generateKey();
  await db.apiKey.create({
    data: {
      projectId: project.id,
      orgId: project.orgId,
      label: input.label,
      prefix,
      hashedKey: hashed,
      // A standalone key starts in a group of its own, so it is never a row
      // whose group has to be inferred later.
      quotaGroupId: newQuotaGroupId(),
    },
  });

  // The plaintext is returned exactly once and never persisted.
  return json({ ok: true, key: plaintext, prefix });
}

const RotateBody = z.object({ id: z.string().min(1).max(64) });

/** HTTP status for each way a rotation can be refused. */
const ROTATION_STATUS: Record<RotationRejection, number> = {
  // A key in another tenant is indistinguishable from one that does not exist.
  not_found: 404,
  revoked: 409,
  expired: 409,
  already_rotated: 409,
};

const ROTATION_MESSAGE: Record<RotationRejection, string> = {
  not_found: 'Key not found.',
  revoked: 'That key is revoked and cannot be rotated.',
  expired: 'That key has expired and cannot be rotated.',
  already_rotated: 'That key has already been rotated.',
};

/**
 * Rotate a key: issue a replacement and put the old one on a 24-hour clock.
 *
 * The plaintext replacement is in this response and nowhere else, exactly as
 * with creation.
 */
export async function PATCH(req: Request) {
  const session = await getSession();
  if (!session) return json({ error: 'Not signed in.' }, 401);
  if (!can(session.role, 'apikey:manage')) {
    return json({ error: 'Your role cannot perform this action.' }, 403);
  }

  let input: z.infer<typeof RotateBody>;
  try {
    input = RotateBody.parse(await req.json());
  } catch {
    return json({ error: 'Provide a key id.' }, 400);
  }

  const result = await rotateApiKey({
    keyId: input.id,
    orgId: session.orgId,
    actorUserId: session.id,
    actorRole: session.role,
  });

  if (!result.ok) {
    return json({ error: ROTATION_MESSAGE[result.reason] }, ROTATION_STATUS[result.reason]);
  }

  return json({
    ok: true,
    key: result.plaintext,
    prefix: result.prefix,
    keyId: result.newKeyId,
    previousKeyId: result.previousKeyId,
    overlapExpiresAt: result.overlapExpiresAt.toISOString(),
  });
}

export async function DELETE(req: Request) {
  const session = await getSession();
  if (!session) return json({ error: 'Not signed in.' }, 401);
  if (!can(session.role, 'apikey:manage')) {
    return json({ error: 'Your role cannot perform this action.' }, 403);
  }

  const id = new URL(req.url).searchParams.get('id');
  if (!id) return json({ error: 'Provide a key id.' }, 400);

  // Delete only if the key belongs to a project in the caller's org.
  const result = await db.apiKey.deleteMany({
    where: { id, project: { orgId: session.orgId } },
  });
  if (result.count === 0) return json({ error: 'Key not found.' }, 404);

  return json({ ok: true });
}
