/**
 * Seeds a complete demo workspace so the dashboard is meaningful on first run.
 *
 * Everything here is generated deterministically from a fixed seed, so repeated
 * runs produce identical data and screenshots/tests stay stable.
 */
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { ENGINES } from '../src/lib/ai/engines';
import { generatePromptSet } from '../src/lib/ai/prompts';
import { analyzeAnswer } from '../src/lib/ai/analysis';
import { ask } from '../src/lib/ai/providers';
import { classifyIntent } from '../src/lib/seo/keywords';
import { keywordDifficulty } from '../src/lib/seo/metrics';

const db = new PrismaClient();

const DEMO_EMAIL = 'demo@ranklogicsupertool.com';
const DEMO_PASSWORD = 'supertool-demo';

function rng(seed: string) {
  let a = 2166136261 >>> 0;
  for (let i = 0; i < seed.length; i++) {
    a ^= seed.charCodeAt(i);
    a = Math.imul(a, 16777619) >>> 0;
  }
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const KEYWORDS = [
  'ai search visibility', 'generative engine optimization', 'chatgpt seo',
  'how to get cited by ai', 'ai citation tracking', 'perplexity seo',
  'answer engine optimization', 'ai overview impact on traffic', 'geo vs seo',
  'llm visibility tracking', 'ai brand monitoring', 'best ai seo tools',
  'ai seo platform pricing', 'track brand mentions in chatgpt', 'ai content optimization',
  'schema markup for ai search', 'content decay analysis', 'share of voice seo',
  'keyword difficulty explained', 'wordpress seo automation', 'rank tracking software',
  'technical seo audit checklist', 'e-e-a-t signals', 'featured snippet optimization',
  'ai referral traffic attribution',
];

async function main() {
  console.log('Seeding Rank Logic SuperTool demo workspace…');

  // Idempotent: wipe and rebuild the demo org so re-seeding is safe.
  const existing = await db.user.findUnique({ where: { email: DEMO_EMAIL }, include: { memberships: true } });
  if (existing) {
    for (const m of existing.memberships) {
      await db.organization.delete({ where: { id: m.orgId } }).catch(() => {});
    }
    await db.user.delete({ where: { id: existing.id } }).catch(() => {});
  }

  const org = await db.organization.create({
    data: { name: 'Rank Logic Demo Workspace', plan: 'growth' },
  });

  const user = await db.user.create({
    data: {
      email: DEMO_EMAIL,
      name: 'Demo Operator',
      passwordHash: await bcrypt.hash(DEMO_PASSWORD, 12),
      role: 'owner',
      memberships: { create: { orgId: org.id, role: 'owner' } },
    },
  });

  const project = await db.project.create({
    data: {
      orgId: org.id,
      name: 'Rank Logic SuperTool',
      domain: 'ranklogicsupertool.com',
      description: 'AI search visibility and SEO platform',
      country: 'us',
      competitors: {
        create: [
          { domain: 'semrush.com', label: 'Semrush' },
          { domain: 'ahrefs.com', label: 'Ahrefs' },
          { domain: 'moz.com', label: 'Moz' },
        ],
      },
    },
    include: { competitors: true },
  });

  /* ---------------- Keywords + 90 days of rank history ---------------- */
  const r = rng('keywords');
  for (const phrase of KEYWORDS) {
    // Longer, more specific phrases behave like real long-tail terms: lower
    // volume, and contested by weaker pages. Deriving the SERP profile from
    // phrase length gives a realistic difficulty spread instead of a uniform
    // wall of hard keywords.
    const longTail = phrase.split(' ').length >= 4;
    const volume = longTail
      ? Math.round(40 + r() * 900)
      : Math.round(400 + r() * 8000);

    const strength = longTail ? 0.32 : 1;
    const difficulty = keywordDifficulty(
      Array.from({ length: 10 }, () => ({
        domain: 'x.com',
        domainAuthority: Math.round((12 + r() * 74) * strength),
        referringDomains: Math.round(r() ** 2 * 2500 * strength),
        wordCount: Math.round(600 + r() * 2600 * strength),
      })),
    );

    const trend = Array.from({ length: 12 }, (_, i) =>
      Math.round(volume * (0.75 + r() * 0.2 + i * 0.02)),
    );

    const keyword = await db.keyword.create({
      data: {
        projectId: project.id,
        phrase,
        volume,
        difficulty,
        cpc: Math.round(r() * 2400) / 100,
        intent: classifyIntent(phrase),
        trend: JSON.stringify(trend),
      },
    });

    // Walk a position from a starting rank toward a slightly better one.
    let position = longTail ? Math.round(4 + r() * 16) : Math.round(6 + r() * 45);
    const snapshots = [];
    for (let day = 89; day >= 0; day -= 3) {
      position = Math.max(1, Math.min(100, position + Math.round((r() - 0.55) * 4)));
      snapshots.push({
        keywordId: keyword.id,
        engine: 'google',
        position,
        url: `https://${project.domain}/${phrase.replace(/\s+/g, '-')}`,
        capturedAt: new Date(Date.now() - day * 864e5),
      });
    }
    await db.rankSnapshot.createMany({ data: snapshots });
  }
  console.log(`  ${KEYWORDS.length} keywords with 90 days of rank history`);

  /* ---------------- Prompt set + AI checks across 6 engines ---------------- */
  const generated = generatePromptSet({
    brand: 'Rank Logic SuperTool',
    category: 'AI SEO platform',
    topics: ['AI search visibility', 'content decay', 'AI citation tracking'],
    competitors: project.competitors.map((c) => c.label),
    limit: 24,
  });

  const competitors = project.competitors.map((c) => ({ name: c.label, domain: c.domain }));
  let checkCount = 0;

  for (const g of generated) {
    const prompt = await db.aiPrompt.create({
      data: { projectId: project.id, text: g.text, cluster: g.cluster, intent: g.intent },
    });

    // Four weekly runs so the dashboard has a trend, not a single point.
    for (let week = 3; week >= 0; week--) {
      const runAt = new Date(Date.now() - week * 7 * 864e5);
      const rows = [];
      for (const engine of ENGINES) {
        const result = await ask({
          prompt: g.text,
          engine: engine.id,
          brand: 'Rank Logic SuperTool',
          domain: project.domain,
          competitors,
          seed: `${project.id}|w${week}`,
        });
        const a = analyzeAnswer({
          answer: result.answer,
          brand: 'Rank Logic SuperTool',
          domain: project.domain,
          competitors,
          providedCitations: result.citations,
        });
        rows.push({
          promptId: prompt.id,
          engine: engine.id,
          brandMentioned: a.brandMentioned,
          brandCited: a.brandCited,
          mentionRank: a.mentionRank,
          sentiment: a.sentiment,
          shareOfVoice: a.shareOfVoice,
          citedUrls: JSON.stringify(a.citedUrls),
          competitors: JSON.stringify(a.competitorsMentioned),
          excerpt: a.excerpt,
          simulated: result.simulated,
          runAt,
        });
      }
      await db.aiCheck.createMany({ data: rows });
      checkCount += rows.length;
    }
  }
  console.log(`  ${generated.length} prompts, ${checkCount} engine checks over 4 weeks`);

  /* ---------------- Articles ---------------- */
  const ar = rng('articles');
  const ARTICLES = [
    ['AI Search Visibility: The Complete 2026 Guide', 'ai-search-visibility', 'published'],
    ['How to Get Cited by ChatGPT', 'get-cited-by-chatgpt', 'published'],
    ['GEO vs SEO: What Actually Changed', 'geo-vs-seo', 'published'],
    ['Measuring Share of Voice in AI Answers', 'ai-share-of-voice', 'review'],
    ['Schema Markup That Answer Engines Read', 'schema-for-ai-search', 'draft'],
    ['Content Decay: Finding Pages Losing Ground', 'content-decay', 'published'],
    ['Why Your Rankings Held and Clicks Fell', 'rankings-held-clicks-fell', 'scheduled'],
  ] as const;

  for (const [title, slug, status] of ARTICLES) {
    const wordCount = Math.round(1100 + ar() * 1800);
    await db.article.create({
      data: {
        projectId: project.id,
        title,
        slug,
        metaTitle: `${title} | Rank Logic SuperTool`,
        metaDescription: `${title} — practical guidance from the Rank Logic research team on measuring and improving answer-engine visibility.`,
        status,
        wordCount,
        seoScore: Math.round(58 + ar() * 38),
        aiReadyScore: Math.round(45 + ar() * 48),
        readability: Math.round((48 + ar() * 26) * 10) / 10,
        publishedUrl: status === 'published' ? `https://${project.domain}/${slug}` : '',
        publishedAt: status === 'published' ? new Date(Date.now() - Math.round(ar() * 70) * 864e5) : null,
        wpPostId: status === 'published' ? Math.round(100 + ar() * 900) : null,
      },
    });
  }
  console.log(`  ${ARTICLES.length} articles`);

  /* ---------------- Audit run ---------------- */
  const audit = await db.auditRun.create({
    data: {
      projectId: project.id,
      status: 'complete',
      score: 78,
      pagesCrawled: 42,
      startedAt: new Date(Date.now() - 2 * 864e5),
      finishedAt: new Date(Date.now() - 2 * 864e5 + 96_000),
    },
  });

  await db.auditIssue.createMany({
    data: [
      { auditId: audit.id, url: `https://${project.domain}/blog/geo-vs-seo`, code: 'meta-missing', severity: 'warning', category: 'onpage', title: 'Missing meta description', detail: 'Google will scrape an arbitrary snippet instead of your pitch.' },
      { auditId: audit.id, url: `https://${project.domain}/pricing`, code: 'ai-no-faq', severity: 'warning', category: 'ai-readiness', title: 'No question-shaped content for answer engines', detail: '0 question headings and no FAQPage schema — little for an AI to quote.' },
      { auditId: audit.id, url: `https://${project.domain}/blog/content-decay`, code: 'ai-no-citations', severity: 'notice', category: 'ai-readiness', title: 'No outbound citations', detail: '1 external link. Answer engines strongly prefer sourced pages.' },
      { auditId: audit.id, url: `https://${project.domain}/about`, code: 'thin-content', severity: 'critical', category: 'onpage', title: 'Thin content', detail: 'Only 212 words of body copy.' },
      { auditId: audit.id, url: `https://${project.domain}/blog`, code: 'duplicate-meta', severity: 'notice', category: 'onpage', title: 'Duplicate meta description across 4 pages', detail: '4 URLs share the same description.' },
      { auditId: audit.id, url: `https://${project.domain}/resources/old-guide`, code: 'status-error', severity: 'critical', category: 'crawlability', title: 'HTTP 404 error', detail: 'Server returned 404 but 3 internal links still point here.' },
      { auditId: audit.id, url: `https://${project.domain}/platform`, code: 'img-alt', severity: 'notice', category: 'onpage', title: '3 images without alt text', detail: '3 of 8 images have no alt attribute.' },
      { auditId: audit.id, url: `https://${project.domain}/blog/schema-for-ai-search`, code: 'no-schema', severity: 'warning', category: 'schema', title: 'No structured data', detail: 'The page publishes no JSON-LD, so it is ineligible for rich results.' },
    ],
  });
  console.log('  1 audit run with 8 findings');

  /* ---------------- Leads ---------------- */
  const lr = rng('leads');
  const engines = ENGINES.map((e) => e.id);
  const leads = Array.from({ length: 34 }, (_, i) => {
    const fromAi = lr() < 0.58;
    return {
      projectId: project.id,
      source: fromAi ? 'ai' : lr() < 0.7 ? 'organic' : 'direct',
      engine: fromAi ? engines[Math.floor(lr() * engines.length)] : '',
      landingUrl: `https://${project.domain}/${ARTICLES[Math.floor(lr() * ARTICLES.length)][1]}`,
      email: `lead${i + 1}@example.com`,
      name: `Prospect ${i + 1}`,
      value: Math.round(lr() * 4800),
      status: (['new', 'qualified', 'demo', 'won', 'lost'] as const)[Math.floor(lr() * 5)],
      capturedAt: new Date(Date.now() - Math.round(lr() * 60) * 864e5),
    };
  });
  await db.lead.createMany({ data: leads });
  console.log(`  ${leads.length} attributed leads`);

  /* ---------------- Backlinks + WordPress connection ---------------- */
  const br = rng('backlinks');
  await db.backlink.createMany({
    data: Array.from({ length: 40 }, (_, i) => ({
      projectId: project.id,
      sourceUrl: `https://referrer${i + 1}.com/post/${i + 1}`,
      targetUrl: `https://${project.domain}/${ARTICLES[Math.floor(br() * ARTICLES.length)][1]}`,
      anchor: ['ai search visibility', 'this platform', 'Rank Logic SuperTool', 'read more'][Math.floor(br() * 4)],
      dofollow: br() < 0.72,
      authority: Math.round(br() * 85),
      firstSeen: new Date(Date.now() - Math.round(br() * 300) * 864e5),
    })),
  });

  await db.siteConnection.create({
    data: {
      projectId: project.id,
      platform: 'wordpress',
      siteUrl: `https://${project.domain}`,
      username: 'supertool',
      status: 'connected',
      lastSyncAt: new Date(Date.now() - 3 * 36e5),
    },
  });

  console.log('\nDone.');
  console.log(`  Sign in with ${DEMO_EMAIL} / ${DEMO_PASSWORD}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
