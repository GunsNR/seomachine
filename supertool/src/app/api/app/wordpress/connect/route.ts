import { NextResponse } from 'next/server';
import { z } from 'zod';
import { encryptSecret } from '@/lib/crypto';
import { db } from '@/lib/db';
import { checkPublicUrl } from '@/lib/net-guard';
import { fail, loadProject, withSession } from '@/lib/route-helpers';
import { verifyConnection } from '@/lib/wordpress';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 45;

const Body = z.object({
  projectId: z.string().min(1).max(64),
  siteUrl: z
    .string()
    .min(4)
    .max(255)
    .transform((v) => {
      const trimmed = v.trim().replace(/\/+$/, '');
      return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
    })
    .refine((v) => {
      try { new URL(v); return true; } catch { return false; }
    }, 'Enter a valid site URL, like https://yourdomain.com'),
  username: z.string().min(1, 'Enter the WordPress username.').max(120),
  appPassword: z.string().min(8, 'Application passwords are longer than this.').max(200),
});

/**
 * Saves a WordPress connection, but only after proving the credentials work.
 * Storing an unverified credential just moves the failure to publish time,
 * where it is far more confusing.
 */
export const POST = withSession(Body, async ({ session, body }) => {
  const project = await loadProject(session.orgId, body.projectId);
  if (!project) return fail('Project not found.', 404);

  // The site URL is user-supplied and we are about to fetch it, so refuse
  // anything that would turn this into a probe of our own network.
  const host = checkPublicUrl(body.siteUrl);
  if (!host.allowed) return fail(host.reason ?? 'That site URL cannot be used.', 400);

  const check = await verifyConnection({
    siteUrl: body.siteUrl,
    username: body.username.trim(),
    appPassword: body.appPassword,
  });

  if (!check.ok) {
    return fail(check.error ?? 'Could not connect to that WordPress site.', 422);
  }

  const data = {
    projectId: project.id,
    platform: 'wordpress',
    siteUrl: body.siteUrl,
    username: body.username.trim(),
    appPassword: encryptSecret(body.appPassword),
    status: 'connected',
    lastSyncAt: new Date(),
  };

  const existing = await db.siteConnection.findFirst({
    where: { projectId: project.id, platform: 'wordpress' },
  });

  if (existing) {
    await db.siteConnection.update({ where: { id: existing.id }, data });
  } else {
    await db.siteConnection.create({ data });
  }

  return NextResponse.json({
    ok: true,
    siteName: check.siteName ?? '',
    authenticatedAs: check.user ?? '',
  });
}, 'project:write');

export const DELETE = withSession(null, async ({ session, req }) => {
  const projectId = new URL(req.url).searchParams.get('projectId');
  if (!projectId) return fail('Provide a projectId.');

  const result = await db.siteConnection.deleteMany({
    where: { projectId, project: { orgId: session.orgId }, platform: 'wordpress' },
  });
  if (result.count === 0) return fail('No WordPress connection to remove.', 404);

  return NextResponse.json({ ok: true });
}, 'project:write');
