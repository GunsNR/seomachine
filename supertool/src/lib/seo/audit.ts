/**
 * Technical + on-page site audit.
 *
 * Each rule inspects one crawled page and returns zero or more findings.
 * Site-wide rules (duplicate titles, orphan pages, thin-content ratio) run
 * once over the whole crawl. The health score is severity-weighted against
 * the number of checks actually performed, so a 5-page site and a 500-page
 * site are graded on the same curve.
 */
import type { CrawledPage } from './crawler';

export type Severity = 'critical' | 'warning' | 'notice';
export type Category = 'crawlability' | 'onpage' | 'performance' | 'schema' | 'ai-readiness';

export interface Finding {
  code: string;
  title: string;
  detail: string;
  severity: Severity;
  category: Category;
  url: string;
  howToFix: string;
}

const SEVERITY_WEIGHT: Record<Severity, number> = { critical: 5, warning: 2, notice: 0.6 };

interface Rule {
  code: string;
  category: Category;
  run(page: CrawledPage): Omit<Finding, 'code' | 'category' | 'url'> | null;
}

const PAGE_RULES: Rule[] = [
  {
    code: 'status-error', category: 'crawlability',
    run: (p) => p.ok ? null : {
      title: p.status >= 400 ? `HTTP ${p.status} error` : 'Page could not be fetched',
      detail: p.error || `Server returned ${p.status}.`,
      severity: 'critical',
      howToFix: 'Restore the page or remove every internal link pointing at it, then redirect the URL if it earned links.',
    },
  },
  {
    code: 'title-missing', category: 'onpage',
    run: (p) => p.ok && !p.title ? {
      title: 'Missing title tag',
      detail: 'The page has no <title>, so search engines invent one.',
      severity: 'critical',
      howToFix: 'Add a 30-60 character title that leads with the primary keyword.',
    } : null,
  },
  {
    code: 'title-length', category: 'onpage',
    run: (p) => {
      if (!p.ok || !p.title) return null;
      const n = p.title.length;
      if (n >= 30 && n <= 60) return null;
      return {
        title: n < 30 ? 'Title tag too short' : 'Title tag too long',
        detail: `${n} characters. Titles outside 30-60 get truncated or waste SERP space.`,
        severity: 'warning',
        howToFix: 'Rewrite to 30-60 characters, keyword first, brand last.',
      };
    },
  },
  {
    code: 'meta-missing', category: 'onpage',
    run: (p) => p.ok && !p.metaDescription ? {
      title: 'Missing meta description',
      detail: 'Google will scrape an arbitrary snippet instead of your pitch.',
      severity: 'warning',
      howToFix: 'Write a 120-158 character description containing the keyword and a reason to click.',
    } : null,
  },
  {
    code: 'meta-length', category: 'onpage',
    run: (p) => {
      if (!p.ok || !p.metaDescription) return null;
      const n = p.metaDescription.length;
      if (n >= 120 && n <= 158) return null;
      return {
        title: n < 120 ? 'Meta description too short' : 'Meta description too long',
        detail: `${n} characters (target 120-158).`,
        severity: 'notice',
        howToFix: 'Resize to 120-158 characters so the full snippet renders.',
      };
    },
  },
  {
    code: 'h1-missing', category: 'onpage',
    run: (p) => p.ok && p.h1.length === 0 ? {
      title: 'Missing H1',
      detail: 'No H1 heading found, weakening the page’s topical signal.',
      severity: 'critical',
      howToFix: 'Add exactly one H1 that states what the page is about.',
    } : null,
  },
  {
    code: 'h1-multiple', category: 'onpage',
    run: (p) => p.ok && p.h1.length > 1 ? {
      title: `${p.h1.length} H1 headings`,
      detail: `Multiple H1s split the topical signal: ${p.h1.slice(0, 3).map((h) => `"${h}"`).join(', ')}.`,
      severity: 'warning',
      howToFix: 'Keep one H1 and demote the rest to H2.',
    } : null,
  },
  {
    code: 'thin-content', category: 'onpage',
    run: (p) => {
      if (!p.ok || p.wordCount === 0) return null;
      if (p.wordCount >= 300) return null;
      return {
        title: 'Thin content',
        detail: `Only ${p.wordCount} words of body copy.`,
        severity: p.wordCount < 150 ? 'critical' : 'warning',
        howToFix: 'Expand past 300 words, or consolidate the page into a stronger one and redirect.',
      };
    },
  },
  {
    code: 'canonical-missing', category: 'crawlability',
    run: (p) => p.ok && !p.canonical ? {
      title: 'No canonical tag',
      detail: 'Without a canonical, parameterised and duplicate URLs compete with each other.',
      severity: 'warning',
      howToFix: 'Add <link rel="canonical"> pointing at the preferred absolute URL.',
    } : null,
  },
  {
    code: 'noindex', category: 'crawlability',
    run: (p) => p.ok && /noindex/i.test(p.metaRobots) ? {
      title: 'Page is set to noindex',
      detail: `robots meta is "${p.metaRobots}", so this page cannot rank.`,
      severity: 'critical',
      howToFix: 'Remove noindex if the page is meant to be found in search.',
    } : null,
  },
  {
    code: 'img-alt', category: 'onpage',
    run: (p) => {
      if (!p.ok || p.images.length === 0) return null;
      const missing = p.images.filter((i) => !i.alt).length;
      if (missing === 0) return null;
      return {
        title: `${missing} image${missing === 1 ? '' : 's'} without alt text`,
        detail: `${missing} of ${p.images.length} images have no alt attribute.`,
        severity: missing / p.images.length > 0.5 ? 'warning' : 'notice',
        howToFix: 'Describe each image in alt text. Decorative images take alt="".',
      };
    },
  },
  {
    code: 'img-dimensions', category: 'performance',
    run: (p) => {
      if (!p.ok || p.images.length === 0) return null;
      const missing = p.images.filter((i) => !i.width || !i.height).length;
      if (missing === 0) return null;
      return {
        title: `${missing} image${missing === 1 ? '' : 's'} missing width/height`,
        detail: 'Images without intrinsic dimensions cause layout shift, hurting CLS.',
        severity: 'notice',
        howToFix: 'Set explicit width and height attributes so the browser reserves space.',
      };
    },
  },
  {
    code: 'viewport', category: 'performance',
    run: (p) => p.ok && !p.viewport ? {
      title: 'No mobile viewport tag',
      detail: 'The page will render at desktop width on phones.',
      severity: 'critical',
      howToFix: 'Add <meta name="viewport" content="width=device-width, initial-scale=1">.',
    } : null,
  },
  {
    code: 'lang', category: 'onpage',
    run: (p) => p.ok && !p.lang ? {
      title: 'No lang attribute',
      detail: 'The <html> element declares no language, hurting accessibility and international targeting.',
      severity: 'notice',
      howToFix: 'Set lang on the html element, e.g. <html lang="en">.',
    } : null,
  },
  {
    code: 'slow-response', category: 'performance',
    run: (p) => p.ok && p.fetchMs > 1500 ? {
      title: 'Slow server response',
      detail: `Document took ${p.fetchMs}ms to return.`,
      severity: p.fetchMs > 3000 ? 'warning' : 'notice',
      howToFix: 'Target under 800ms TTFB: add page caching, a CDN, and trim blocking server work.',
    } : null,
  },
  {
    code: 'page-weight', category: 'performance',
    run: (p) => p.ok && p.bytes > 250_000 ? {
      title: 'Heavy HTML document',
      detail: `${Math.round(p.bytes / 1024)}KB of HTML before assets.`,
      severity: 'notice',
      howToFix: 'Trim inline styles and page-builder markup bloat; move CSS to cacheable files.',
    } : null,
  },
  {
    code: 'no-schema', category: 'schema',
    run: (p) => p.ok && p.schemaTypes.length === 0 ? {
      title: 'No structured data',
      detail: 'The page publishes no JSON-LD, so it is ineligible for rich results.',
      severity: 'warning',
      howToFix: 'Add Article, Product, LocalBusiness or FAQPage JSON-LD matching the page type.',
    } : null,
  },
  {
    code: 'og-missing', category: 'schema',
    run: (p) => {
      if (!p.ok) return null;
      const missing = ['title', 'description', 'image'].filter((k) => !p.openGraph[k]);
      if (missing.length === 0) return null;
      return {
        title: 'Incomplete Open Graph tags',
        detail: `Missing og:${missing.join(', og:')}.`,
        severity: 'notice',
        howToFix: 'Add og:title, og:description and a 1200x630 og:image so shared links render properly.',
      };
    },
  },
  // ---- AI answer-engine readiness -------------------------------------
  {
    code: 'ai-no-faq', category: 'ai-readiness',
    run: (p) => {
      if (!p.ok || p.wordCount < 400) return null;
      const questionHeadings = p.headings.filter((h) => /\?$/.test(h) || /^(how|what|why|when|which|can|does|is)\b/i.test(h)).length;
      if (p.hasFaqSchema || questionHeadings >= 2) return null;
      return {
        title: 'No question-shaped content for answer engines',
        detail: `${questionHeadings} question headings and no FAQPage schema — little for an AI to quote.`,
        severity: 'warning',
        howToFix: 'Rewrite two or more H2s as the questions buyers ask, answer each in the first sentence below, and add FAQPage JSON-LD.',
      };
    },
  },
  {
    code: 'ai-no-citations', category: 'ai-readiness',
    run: (p) => {
      if (!p.ok || p.wordCount < 500) return null;
      const authoritative = p.externalLinks.filter((l) => /\.(gov|edu|org)(\/|$)/i.test(l.href)).length;
      if (authoritative > 0 || p.externalLinks.length >= 3) return null;
      return {
        title: 'No outbound citations',
        detail: `${p.externalLinks.length} external links. Answer engines strongly prefer sourced pages.`,
        severity: 'notice',
        howToFix: 'Cite two or more named primary sources inline and link them.',
      };
    },
  },
  {
    code: 'ai-no-author', category: 'ai-readiness',
    run: (p) => {
      if (!p.ok || p.wordCount < 600) return null;
      const hasAuthor = p.schemaTypes.includes('Person') ||
        p.jsonLd.some((j) => JSON.stringify(j).includes('"author"'));
      return hasAuthor ? null : {
        title: 'No author attribution in structured data',
        detail: 'Nothing identifies who wrote this, weakening E-E-A-T and citation confidence.',
        severity: 'notice',
        howToFix: 'Add an author property with a Person entity, plus a visible byline linking to a bio.',
      };
    },
  },
];

export interface AuditReport {
  score: number;
  grade: 'A' | 'B' | 'C' | 'D' | 'F';
  pagesCrawled: number;
  pagesOk: number;
  findings: Finding[];
  byCategory: Record<Category, { critical: number; warning: number; notice: number }>;
  totals: { critical: number; warning: number; notice: number };
}

export function auditPages(pages: CrawledPage[]): AuditReport {
  const findings: Finding[] = [];

  for (const page of pages) {
    for (const rule of PAGE_RULES) {
      const hit = rule.run(page);
      if (hit) findings.push({ ...hit, code: rule.code, category: rule.category, url: page.url });
    }
  }

  findings.push(...siteWideFindings(pages));

  const totals = { critical: 0, warning: 0, notice: 0 };
  const byCategory = {
    crawlability: { critical: 0, warning: 0, notice: 0 },
    onpage: { critical: 0, warning: 0, notice: 0 },
    performance: { critical: 0, warning: 0, notice: 0 },
    schema: { critical: 0, warning: 0, notice: 0 },
    'ai-readiness': { critical: 0, warning: 0, notice: 0 },
  } satisfies AuditReport['byCategory'];

  let penalty = 0;
  for (const f of findings) {
    totals[f.severity]++;
    byCategory[f.category][f.severity]++;
    penalty += SEVERITY_WEIGHT[f.severity];
  }

  // Normalise against the checks that could have fired, so score is
  // comparable across crawls of different sizes.
  const checksRun = Math.max(1, pages.length * PAGE_RULES.length);
  const maxPenalty = checksRun * 1.15;
  const score = Math.round(Math.max(0, Math.min(100, 100 - (penalty / maxPenalty) * 100)));

  const pagesOk = pages.filter((p) => p.ok).length;

  return {
    score,
    grade: score >= 90 ? 'A' : score >= 78 ? 'B' : score >= 62 ? 'C' : score >= 45 ? 'D' : 'F',
    pagesCrawled: pages.length,
    pagesOk,
    findings: findings.sort(
      (a, b) => SEVERITY_WEIGHT[b.severity] - SEVERITY_WEIGHT[a.severity] || a.code.localeCompare(b.code),
    ),
    byCategory,
    totals,
  };
}

function siteWideFindings(pages: CrawledPage[]): Finding[] {
  const out: Finding[] = [];
  const ok = pages.filter((p) => p.ok);
  if (ok.length < 2) return out;

  const group = (key: (p: CrawledPage) => string) => {
    const map = new Map<string, CrawledPage[]>();
    for (const p of ok) {
      const k = key(p).trim().toLowerCase();
      if (!k) continue;
      map.set(k, [...(map.get(k) ?? []), p]);
    }
    return [...map.entries()].filter(([, v]) => v.length > 1);
  };

  for (const [title, dupes] of group((p) => p.title)) {
    out.push({
      code: 'duplicate-title', category: 'onpage', severity: 'warning',
      url: dupes[0].url,
      title: `Duplicate title across ${dupes.length} pages`,
      detail: `"${title}" is used by ${dupes.length} URLs, e.g. ${dupes.slice(0, 3).map((p) => p.url).join(', ')}.`,
      howToFix: 'Give every page a unique title describing its own topic.',
    });
  }

  for (const [, dupes] of group((p) => p.metaDescription)) {
    out.push({
      code: 'duplicate-meta', category: 'onpage', severity: 'notice',
      url: dupes[0].url,
      title: `Duplicate meta description across ${dupes.length} pages`,
      detail: `${dupes.length} URLs share the same description.`,
      howToFix: 'Write a distinct description per page.',
    });
  }

  // Orphans: crawled but never linked from any other crawled page.
  const linkedTo = new Set<string>();
  for (const p of ok) for (const l of p.internalLinks) linkedTo.add(l.href.replace(/\/$/, ''));
  const orphans = ok.slice(1).filter((p) => !linkedTo.has(p.finalUrl.replace(/\/$/, '')));
  if (orphans.length) {
    out.push({
      code: 'orphan-pages', category: 'crawlability', severity: 'warning',
      url: orphans[0].url,
      title: `${orphans.length} orphan page${orphans.length === 1 ? '' : 's'}`,
      detail: `Reachable in the crawl but not linked from any other crawled page: ${orphans.slice(0, 3).map((p) => p.url).join(', ')}.`,
      howToFix: 'Link orphans from a relevant hub page so authority and crawlers can reach them.',
    });
  }

  return out;
}
