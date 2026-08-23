import { NextResponse } from 'next/server';
import { corsPreflight, requireApiKey } from '@/lib/api-auth';
import { db } from '@/lib/db';
import { brand } from '../../../../../../brand.config';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export function OPTIONS() {
  return corsPreflight();
}

/**
 * Handshake for the WordPress plugin. Echoes back the project so a wrong key
 * fails loudly in the plugin's settings screen rather than silently.
 */
export async function POST(req: Request) {
  const { project, response } = await requireApiKey(req);
  if (!project) return response;

  let siteUrl = '';
  try {
    const body = (await req.json()) as { siteUrl?: string };
    siteUrl = (body.siteUrl ?? '').trim().slice(0, 255);
  } catch {
    // Body is optional; a bare verify is valid.
  }

  if (siteUrl) {
    const existing = await db.siteConnection.findFirst({
      where: { projectId: project.id, platform: 'wordpress' },
    });
    if (existing) {
      await db.siteConnection.update({
        where: { id: existing.id },
        data: { siteUrl, status: 'connected', lastSyncAt: new Date() },
      });
    } else {
      await db.siteConnection.create({
        data: { projectId: project.id, platform: 'wordpress', siteUrl, status: 'connected', lastSyncAt: new Date() },
      });
    }
  }

  return NextResponse.json({
    ok: true,
    platform: brand.name,
    project: { id: project.id, name: project.name, domain: project.domain },
    connectedAt: new Date().toISOString(),
  });
}
