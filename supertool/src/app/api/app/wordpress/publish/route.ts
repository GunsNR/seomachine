import { NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { fail, withSession } from '@/lib/route-helpers';
import { publishPost } from '@/lib/wordpress';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const Body = z.object({
  articleId: z.string().min(1).max(64),
  status: z.enum(['draft', 'publish']).default('draft'),
});

/** Pushes an article to the project's connected WordPress site. */
export const POST = withSession(Body, async ({ session, body }) => {
  const article = await db.article.findFirst({
    where: { id: body.articleId, project: { orgId: session.orgId } },
    include: { project: { include: { connections: true } } },
  });
  if (!article) return fail('Article not found.', 404);

  if (!article.body.trim()) {
    return fail('This article has no body yet, so there is nothing to publish.', 422);
  }

  const connection = article.project.connections.find((c) => c.platform === 'wordpress');
  if (!connection || connection.status !== 'connected') {
    return fail('Connect a WordPress site in Settings before publishing.', 409);
  }

  const result = await publishPost(
    {
      siteUrl: connection.siteUrl,
      username: connection.username,
      appPassword: connection.appPassword,
    },
    {
      title: article.title,
      body: article.body,
      slug: article.slug,
      status: body.status,
      excerpt: article.metaDescription,
      metaTitle: article.metaTitle || article.title,
      metaDescription: article.metaDescription,
      // Update in place when we have already published this article once.
      postId: article.wpPostId ?? undefined,
    },
  );

  if (!result.ok) {
    // Mark the connection as failing so Settings shows it needs attention.
    await db.siteConnection.update({
      where: { id: connection.id },
      data: { status: 'error' },
    });
    return fail(result.error ?? 'WordPress rejected the post.', 502);
  }

  await db.$transaction([
    db.article.update({
      where: { id: article.id },
      data: {
        wpPostId: result.postId ?? article.wpPostId,
        publishedUrl: result.url ?? article.publishedUrl,
        status: body.status === 'publish' ? 'published' : 'review',
        publishedAt: body.status === 'publish' ? new Date() : article.publishedAt,
      },
    }),
    db.siteConnection.update({
      where: { id: connection.id },
      data: { status: 'connected', lastSyncAt: new Date() },
    }),
  ]);

  return NextResponse.json({
    ok: true,
    postId: result.postId,
    url: result.url,
    status: result.status,
  });
});
