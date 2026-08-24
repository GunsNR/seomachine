import { NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { fail, loadProject, withSession } from '@/lib/route-helpers';
import { briefUpside, generateBrief } from '@/lib/seo/brief';
import { words } from '@/lib/seo/text';
import { parseJson } from '@/lib/utils';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const Body = z.object({
  projectId: z.string().min(1).max(64),
  keywordId: z.string().max(64).optional(),
  keyword: z.string().max(160).optional(),
  /** Persist the brief so it appears in the content pipeline. */
  save: z.boolean().optional(),
});

/**
 * Builds a brief from the project's own measured data: the prompts an engine
 * failed to name the brand on, the competitor URLs that took those citations,
 * and the keyword cluster around the target.
 */
export const POST = withSession(Body, async ({ session, body }) => {
  const project = await loadProject(session.orgId, body.projectId);
  if (!project) return fail('Project not found.', 404);

  const keyword = body.keywordId
    ? await db.keyword.findFirst({ where: { id: body.keywordId, projectId: project.id } })
    : body.keyword
      ? await db.keyword.findFirst({ where: { projectId: project.id, phrase: body.keyword.trim().toLowerCase() } })
      : null;

  const phrase = keyword?.phrase ?? body.keyword?.trim();
  if (!phrase) return fail('Provide a keyword to brief against.', 400);

  // Words from the target that make a prompt topically related.
  const topicWords = words(phrase).filter((w) => w.length > 3);

  const [prompts, allKeywords, articles] = await Promise.all([
    db.aiPrompt.findMany({
      where: { projectId: project.id },
      include: { checks: { orderBy: { runAt: 'desc' }, take: 6 } },
    }),
    db.keyword.findMany({ where: { projectId: project.id } }),
    db.article.findMany({ where: { projectId: project.id }, select: { wordCount: true } }),
  ]);

  // Prompts on this topic where the brand was never named in the latest run.
  const related = prompts.filter((p) => {
    const text = p.text.toLowerCase();
    return topicWords.length === 0 || topicWords.some((w) => text.includes(w));
  });

  const unanswered = related
    .filter((p) => p.checks.length > 0 && !p.checks.some((c) => c.brandMentioned))
    .map((p) => p.text);

  const ourHost = project.domain.replace(/^www\./, '');
  const competingUrls: string[] = [];
  for (const prompt of related) {
    for (const check of prompt.checks) {
      for (const url of parseJson<string[]>(check.citedUrls, [])) {
        try {
          const host = new URL(url).hostname.replace(/^www\./, '');
          if (!host.endsWith(ourHost)) competingUrls.push(url);
        } catch { /* skip unparseable */ }
      }
    }
  }

  const relatedKeywords = allKeywords
    .filter((k) => k.phrase !== phrase && topicWords.some((w) => k.phrase.includes(w)))
    .map((k) => ({ phrase: k.phrase, volume: k.volume }));

  const brief = generateBrief({
    targetKeyword: phrase,
    volume: keyword?.volume ?? 0,
    difficulty: keyword?.difficulty ?? 50,
    intent: keyword?.intent,
    unansweredPrompts: unanswered,
    competingUrls,
    relatedKeywords,
    competitorWordCounts: articles.map((a) => a.wordCount).filter((n) => n > 0),
    brand: project.name,
  });

  if (body.save) {
    await db.contentBrief.create({
      data: {
        projectId: project.id,
        topic: brief.topic,
        targetKeyword: brief.targetKeyword,
        intent: brief.intent,
        outline: JSON.stringify(brief.outline),
        questions: JSON.stringify(brief.questions),
        targetWords: brief.targetWords,
        status: 'ready',
      },
    });
  }

  return NextResponse.json({
    ok: true,
    brief,
    context: {
      volume: keyword?.volume ?? 0,
      difficulty: keyword?.difficulty ?? null,
      estimatedUpside: briefUpside(keyword?.volume ?? 0),
      unansweredPromptCount: unanswered.length,
      relatedPromptCount: related.length,
    },
    saved: Boolean(body.save),
  });
}, 'content:write');
