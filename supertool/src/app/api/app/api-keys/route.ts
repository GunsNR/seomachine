import { NextResponse } from 'next/server';
import { z } from 'zod';
import { generateKey, rotateApiKey, type RotationRejection } from '@/lib/apikey';
import { getSession } from '@/lib/auth';
import { can } from '@/lib/rbac';
import { db } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const CreateBody = z.object({
  projectId: z.string().min(1).max(64),
  label: z.string().min(1).max(80),
});

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });
  if (!can(session.role, 'apikey:manage')) {
    return NextResponse.json({ error: 'Your role cannot perform this action.' }, { status: 403 });
  }

  let input: z.infer<typeof CreateBody>;
  try {
    input = CreateBody.parse(await req.json());
  } catch {
    return NextResponse.json({ error: 'Provide a projectId and a label.' }, { status: 400 });
  }

  const project = await db.project.findFirst({
    where: { id: input.projectId, orgId: session.orgId },
  });
  if (!project) return NextResponse.json({ error: 'Project not found.' }, { status: 404 });

  const { plaintext, prefix, hashed } = generateKey();
  await db.apiKey.create({
    data: { projectId: project.id, label: input.label, prefix, hashedKey: hashed },
  });

  // The plaintext is returned exactly once and never persisted.
  return NextResponse.json({ ok: true, key: plaintext, prefix });
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
  if (!session) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });
  if (!can(session.role, 'apikey:manage')) {
    return NextResponse.json({ error: 'Your role cannot perform this action.' }, { status: 403 });
  }

  let input: z.infer<typeof RotateBody>;
  try {
    input = RotateBody.parse(await req.json());
  } catch {
    return NextResponse.json({ error: 'Provide a key id.' }, { status: 400 });
  }

  const result = await rotateApiKey({
    keyId: input.id,
    orgId: session.orgId,
    actorUserId: session.id,
    actorRole: session.role,
  });

  if (!result.ok) {
    return NextResponse.json(
      { error: ROTATION_MESSAGE[result.reason] },
      { status: ROTATION_STATUS[result.reason] },
    );
  }

  return NextResponse.json({
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
  if (!session) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });
  if (!can(session.role, 'apikey:manage')) {
    return NextResponse.json({ error: 'Your role cannot perform this action.' }, { status: 403 });
  }

  const id = new URL(req.url).searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'Provide a key id.' }, { status: 400 });

  // Delete only if the key belongs to a project in the caller's org.
  const result = await db.apiKey.deleteMany({
    where: { id, project: { orgId: session.orgId } },
  });
  if (result.count === 0) return NextResponse.json({ error: 'Key not found.' }, { status: 404 });

  return NextResponse.json({ ok: true });
}
