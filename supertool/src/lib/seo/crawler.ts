/**
 * Page fetcher and parser.
 *
 * Extracts everything the audit rules and content scorer need from a live URL
 * in a single pass. Network failures are returned as data, never thrown, so a
 * crawl of 200 URLs is never derailed by one bad host.
 */
import * as cheerio from 'cheerio';
import { words } from './text';

export interface CrawledLink {
  href: string;
  text: string;
  rel: string;
  internal: boolean;
}

export interface CrawledImage {
  src: string;
  alt: string;
  width?: string;
  height?: string;
  loading?: string;
}

export interface CrawledPage {
  url: string;
  finalUrl: string;
  ok: boolean;
  status: number;
  error?: string;
  fetchMs: number;
  bytes: number;
  contentType: string;

  title: string;
  metaDescription: string;
  metaRobots: string;
  canonical: string;
  lang: string;
  viewport: string;
  charset: string;

  h1: string[];
  h2: string[];
  h3: string[];
  headings: string[];

  bodyText: string;
  wordCount: number;

  links: CrawledLink[];
  internalLinks: CrawledLink[];
  externalLinks: CrawledLink[];
  images: CrawledImage[];

  openGraph: Record<string, string>;
  twitter: Record<string, string>;
  schemaTypes: string[];
  jsonLd: unknown[];

  hasFaqSchema: boolean;
  hasArticleSchema: boolean;
  hreflang: string[];
  scripts: number;
  stylesheets: number;
  inlineStyleBytes: number;
}

const UA =
  'Mozilla/5.0 (compatible; RankLogicSuperToolBot/1.0; +https://ranklogicsupertool.com/bot)';

function emptyPage(url: string, status: number, error: string, fetchMs: number): CrawledPage {
  return {
    url, finalUrl: url, ok: false, status, error, fetchMs, bytes: 0, contentType: '',
    title: '', metaDescription: '', metaRobots: '', canonical: '', lang: '', viewport: '', charset: '',
    h1: [], h2: [], h3: [], headings: [], bodyText: '', wordCount: 0,
    links: [], internalLinks: [], externalLinks: [], images: [],
    openGraph: {}, twitter: {}, schemaTypes: [], jsonLd: [],
    hasFaqSchema: false, hasArticleSchema: false, hreflang: [],
    scripts: 0, stylesheets: 0, inlineStyleBytes: 0,
  };
}

export function normalizeUrl(input: string): string {
  const withScheme = /^https?:\/\//i.test(input) ? input : `https://${input}`;
  try {
    const u = new URL(withScheme);
    u.hash = '';
    return u.toString();
  } catch {
    return withScheme;
  }
}

export async function fetchPage(
  rawUrl: string,
  opts: { timeoutMs?: number } = {},
): Promise<CrawledPage> {
  const url = normalizeUrl(rawUrl);
  const started = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? 15_000);

  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': UA, Accept: 'text/html,application/xhtml+xml' },
      redirect: 'follow',
      signal: controller.signal,
    });

    const contentType = res.headers.get('content-type') ?? '';
    if (!contentType.includes('html')) {
      const page = emptyPage(url, res.status, `Non-HTML response (${contentType || 'unknown'})`, Date.now() - started);
      page.ok = res.ok;
      page.contentType = contentType;
      page.finalUrl = res.url || url;
      return page;
    }

    const html = await res.text();
    const page = parseHtml(html, res.url || url);
    page.url = url;
    page.status = res.status;
    page.ok = res.ok;
    page.fetchMs = Date.now() - started;
    page.bytes = Buffer.byteLength(html, 'utf8');
    page.contentType = contentType;
    return page;
  } catch (err) {
    const message =
      err instanceof Error
        ? err.name === 'AbortError' ? `Timed out after ${opts.timeoutMs ?? 15_000}ms` : err.message
        : 'Unknown fetch error';
    return emptyPage(url, 0, message, Date.now() - started);
  } finally {
    clearTimeout(timer);
  }
}

export function parseHtml(html: string, finalUrl: string): CrawledPage {
  const $ = cheerio.load(html);
  const page = emptyPage(finalUrl, 200, '', 0);
  page.ok = true;
  page.finalUrl = finalUrl;

  let origin = '';
  try { origin = new URL(finalUrl).origin; } catch { /* relative-only mode */ }

  page.title = $('head title').first().text().trim();
  page.metaDescription = ($('meta[name="description"]').attr('content') ?? '').trim();
  page.metaRobots = ($('meta[name="robots"]').attr('content') ?? '').trim();
  page.canonical = ($('link[rel="canonical"]').attr('href') ?? '').trim();
  page.lang = ($('html').attr('lang') ?? '').trim();
  page.viewport = ($('meta[name="viewport"]').attr('content') ?? '').trim();
  page.charset =
    ($('meta[charset]').attr('charset') ?? $('meta[http-equiv="Content-Type"]').attr('content') ?? '').trim();

  const heading = (sel: string) =>
    $(sel).map((_, el) => $(el).text().replace(/\s+/g, ' ').trim()).get().filter(Boolean);

  page.h1 = heading('h1');
  page.h2 = heading('h2');
  page.h3 = heading('h3');
  page.headings = [...page.h2, ...page.h3];

  // Drop chrome before measuring body copy so nav/footer boilerplate does not
  // inflate the word count.
  const $body = $('body').clone();
  $body.find('script, style, noscript, nav, header, footer, aside, form, svg').remove();
  page.bodyText = $body.text().replace(/\s+/g, ' ').trim();
  page.wordCount = words(page.bodyText).length;

  $('a[href]').each((_, el) => {
    const href = ($(el).attr('href') ?? '').trim();
    if (!href || href.startsWith('#') || /^(mailto:|tel:|javascript:)/i.test(href)) return;
    let absolute = href;
    let internal = !/^https?:\/\//i.test(href);
    try {
      const resolved = new URL(href, finalUrl);
      absolute = resolved.toString();
      internal = !!origin && resolved.origin === origin;
    } catch { /* keep the raw href */ }
    const link: CrawledLink = {
      href: absolute,
      text: $(el).text().replace(/\s+/g, ' ').trim(),
      rel: ($(el).attr('rel') ?? '').trim(),
      internal,
    };
    page.links.push(link);
    (internal ? page.internalLinks : page.externalLinks).push(link);
  });

  $('img').each((_, el) => {
    page.images.push({
      src: ($(el).attr('src') ?? $(el).attr('data-src') ?? '').trim(),
      alt: ($(el).attr('alt') ?? '').trim(),
      width: $(el).attr('width'),
      height: $(el).attr('height'),
      loading: $(el).attr('loading'),
    });
  });

  $('meta[property^="og:"]').each((_, el) => {
    const k = $(el).attr('property')!.replace(/^og:/, '');
    page.openGraph[k] = ($(el).attr('content') ?? '').trim();
  });
  $('meta[name^="twitter:"]').each((_, el) => {
    const k = $(el).attr('name')!.replace(/^twitter:/, '');
    page.twitter[k] = ($(el).attr('content') ?? '').trim();
  });

  $('script[type="application/ld+json"]').each((_, el) => {
    const raw = $(el).contents().text();
    try {
      const parsed = JSON.parse(raw);
      page.jsonLd.push(parsed);
      collectSchemaTypes(parsed, page.schemaTypes);
    } catch { /* malformed JSON-LD is reported by the audit rules */ }
  });
  page.hasFaqSchema = page.schemaTypes.includes('FAQPage');
  page.hasArticleSchema = page.schemaTypes.some((t) => /Article|BlogPosting|NewsArticle/.test(t));

  page.hreflang = $('link[rel="alternate"][hreflang]')
    .map((_, el) => $(el).attr('hreflang')!).get();

  page.scripts = $('script[src]').length;
  page.stylesheets = $('link[rel="stylesheet"]').length;
  page.inlineStyleBytes = $('style').toArray()
    .reduce((sum, el) => sum + Buffer.byteLength($(el).contents().text(), 'utf8'), 0);

  return page;
}

function collectSchemaTypes(node: unknown, out: string[], depth = 0): void {
  if (depth > 6 || node === null || typeof node !== 'object') return;
  if (Array.isArray(node)) {
    for (const item of node) collectSchemaTypes(item, out, depth + 1);
    return;
  }
  const obj = node as Record<string, unknown>;
  const type = obj['@type'];
  if (typeof type === 'string' && !out.includes(type)) out.push(type);
  if (Array.isArray(type)) for (const t of type) if (typeof t === 'string' && !out.includes(t)) out.push(t);
  for (const key of ['@graph', 'mainEntity', 'itemListElement', 'hasPart']) {
    if (key in obj) collectSchemaTypes(obj[key], out, depth + 1);
  }
}

/**
 * Breadth-first crawl from a start URL, staying on-origin.
 * Bounded by `maxPages` and run with limited concurrency to stay polite.
 */
export async function crawlSite(
  startUrl: string,
  opts: { maxPages?: number; concurrency?: number; timeoutMs?: number } = {},
): Promise<CrawledPage[]> {
  const maxPages = opts.maxPages ?? 25;
  const concurrency = Math.max(1, opts.concurrency ?? 4);
  const start = normalizeUrl(startUrl);

  let origin = '';
  try { origin = new URL(start).origin; } catch { return []; }

  const queue: string[] = [start];
  const seen = new Set<string>([stripTrailing(start)]);
  const results: CrawledPage[] = [];

  while (queue.length && results.length < maxPages) {
    const batch = queue.splice(0, Math.min(concurrency, maxPages - results.length));
    const pages = await Promise.all(batch.map((u) => fetchPage(u, { timeoutMs: opts.timeoutMs })));

    for (const page of pages) {
      results.push(page);
      if (!page.ok) continue;
      for (const link of page.internalLinks) {
        if (results.length + queue.length >= maxPages * 3) break;
        try {
          const u = new URL(link.href);
          if (u.origin !== origin) continue;
          if (/\.(pdf|zip|jpg|jpeg|png|gif|svg|webp|mp4|mp3|css|js|xml|json)$/i.test(u.pathname)) continue;
          const key = stripTrailing(u.toString());
          if (seen.has(key)) continue;
          seen.add(key);
          queue.push(u.toString());
        } catch { /* skip unparseable */ }
      }
    }
  }

  return results;
}

function stripTrailing(u: string): string {
  return u.replace(/\/$/, '').replace(/\/index\.(html?|php)$/i, '');
}
