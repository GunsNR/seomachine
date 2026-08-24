import { NextResponse } from 'next/server';
import { z } from 'zod';
import { generatePromptSet } from '@/lib/ai/prompts';
import { db } from '@/lib/db';
import { assertWithinLimit } from '@/lib/plan';
import { extractTerms } from '@/lib/seo/keywords';
import { fetchKeywordMetrics } from '@/lib/seo/providers/keyword-data';
import { fetchPage, normalizeUrl } from '@/lib/seo/crawler';
import { withSession } from '@/lib/route-helpers';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const domainField = z
  .string()
  .min(3)
  .max(255)
  .transform((v) => v.trim().replace(/^https?:\/\//i, '').replace(/\/.*$/, '').replace(/^www\./i, '').toLowerCase())
  .refine((v) => /^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(v), 'Enter a valid domain, like example.com');

const Body = z.object({
  name: z.string().min(1, 'Give the project a name.').max(120),
  domain: domainField,
  category: z.string().min(2, 'Describe what you sell.').max(160),
  competitors: z.array(z.string().max(255)).max(5).optional(),
  /** Reuse the empty project created at signup instead of making a second one. */
  projectId: z.string().max(64).optional(),
});

/** Terms too generic to be worth tracking as keywords. */
const BORING = new Set([
  'privacy policy', 'terms of service', 'contact us', 'learn more', 'read more',
  'sign up', 'log in', 'get started', 'all rights', 'rights reserved', 'cookie policy',
]);

/**
 * One-shot workspace setup.
 *
 * Reads the customer's own homepage to derive real keyword and topic
 * candidates, then builds a funnel-balanced prompt set around their category
 * and competitors. Everything it creates is editable afterwards — this is a
 * head start, not a lock-in.
 */
export const POST = withSession(Body, async ({ session, body }) => {
  const competitorDomains = [
    ...new Set(
      (body.competitors ?? [])
        .map((c) => c.trim().replace(/^https?:\/\//i, '').replace(/\/.*$/, '').replace(/^www\./i, '').toLowerCase())
        .filter((c) => /^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(c)),
    ),
  ].slice(0, 5);

  // Reuse the placeholder project from signup where possible.
  let project = body.projectId
    ? await db.project.findFirst({ where: { id: body.projectId, orgId: session.orgId } })
    : null;

  if (project) {
    project = await db.project.update({
      where: { id: project.id },
      data: { name: body.name.trim(), domain: body.domain, description: body.category.trim() },
    });
  } else {
    await assertWithinLimit(session.orgId, 'projects');
    project = await db.project.create({
      data: {
        orgId: session.orgId,
        name: body.name.trim(),
        domain: body.domain,
        description: body.category.trim(),
      },
    });
  }

  /* -------- Competitors -------- */
  if (competitorDomains.length) {
    await db.competitor.createMany({
      data: competitorDomains.map((domain) => ({
        projectId: project!.id,
        domain,
        label: domain.split('.')[0],
      })),
    });
  }

  /* -------- Read their homepage for real topic candidates -------- */
  let siteRead = false;
  let suggestedKeywords: string[] = [];

  const home = await fetchPage(normalizeUrl(body.domain), { timeoutMs: 10_000 });
  if (home.ok && home.wordCount > 50) {
    siteRead = true;
    const corpus = [home.title, home.metaDescription, home.headings.join('. '), home.bodyText].join('. ');
    suggestedKeywords = extractTerms(corpus, 60)
      .filter((t) => t.words >= 2 && t.term.length >= 8 && !BORING.has(t.term))
      .filter((t) => !t.term.includes(project!.name.toLowerCase()))
      .slice(0, 25)
      .map((t) => t.term);
  }

  // Always seed a few category terms so the workspace is never empty, even
  // when the site is unreachable from our network.
  const category = body.category.trim().toLowerCase();
  const seeded = [
    category,
    `best ${category}`,
    `${category} pricing`,
    `${category} alternatives`,
    `how to choose a ${category}`,
    ...competitorDomains.map((c) => `${c.split('.')[0]} alternatives`),
  ].map((k) => k.replace(/\s+/g, ' ').trim());

  const phrases = [...new Set([...seeded, ...suggestedKeywords])]
    .filter((p) => p.length >= 3 && p.length <= 160)
    .slice(0, 40);

  /* -------- Keywords -------- */
  const existingKeywords = await db.keyword.findMany({
    where: { projectId: project.id },
    select: { phrase: true },
  });
  const knownKeywords = new Set(existingKeywords.map((k) => k.phrase));
  const freshKeywords = phrases.filter((p) => !knownKeywords.has(p));

  let keywordsAdded = 0;
  if (freshKeywords.length) {
    try {
      await assertWithinLimit(session.orgId, 'keywords', freshKeywords.length);
      const metrics = await fetchKeywordMetrics(freshKeywords);
      await db.keyword.createMany({
        data: metrics.map((m) => ({
          projectId: project!.id,
          phrase: m.phrase,
          volume: m.volume,
          difficulty: m.difficulty,
          cpc: m.cpc,
          intent: m.intent,
          trend: JSON.stringify(m.trend),
          dataSource: m.source,
          volumeSource: m.sources.volume,
          difficultySource: m.sources.difficulty,
          cpcSource: m.sources.cpc,
          dataProvider: m.provider ?? '',
        })),
      });
      keywordsAdded = metrics.length;
    } catch {
      // A plan limit here should not abort onboarding; the workspace is still
      // usable and the limit is reported on the keywords screen.
      keywordsAdded = 0;
    }
  }

  /* -------- Prompt set -------- */
  const generated = generatePromptSet({
    brand: project.name,
    category: body.category.trim(),
    topics: suggestedKeywords.slice(0, 3),
    competitors: competitorDomains.map((c) => c.split('.')[0]),
    limit: 24,
  });

  const existingPrompts = await db.aiPrompt.findMany({
    where: { projectId: project.id },
    select: { text: true },
  });
  const knownPrompts = new Set(existingPrompts.map((p) => p.text.toLowerCase()));
  const freshPrompts = generated.filter((p) => !knownPrompts.has(p.text.toLowerCase()));

  let promptsAdded = 0;
  if (freshPrompts.length) {
    try {
      await assertWithinLimit(session.orgId, 'prompts', freshPrompts.length);
      await db.aiPrompt.createMany({
        data: freshPrompts.map((p) => ({
          projectId: project!.id,
          text: p.text,
          cluster: p.cluster,
          intent: p.intent,
        })),
      });
      promptsAdded = freshPrompts.length;
    } catch {
      promptsAdded = 0;
    }
  }

  return NextResponse.json({
    ok: true,
    project: { id: project.id, name: project.name, domain: project.domain },
    siteRead,
    homepageTitle: home.ok ? home.title : '',
    keywordsAdded,
    promptsAdded,
    competitorsAdded: competitorDomains.length,
    suggestedFromSite: suggestedKeywords.length,
  });
}, 'project:write');
