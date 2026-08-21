import { NextResponse } from 'next/server';
import { z } from 'zod';
import { generateKey } from '@/lib/apikey';
import { getSession } from '@/lib/auth';
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

export async function DELETE(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });

  const id = new URL(req.url).searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'Provide a key id.' }, { status: 400 });

  // Delete only if the key belongs to a project in the caller's org.
  const result = await db.apiKey.deleteMany({
    where: { id, project: { orgId: session.orgId } },
  });
  if (result.count === 0) return NextResponse.json({ error: 'Key not found.' }, { status: 404 });

  return NextResponse.json({ ok: true });
}
