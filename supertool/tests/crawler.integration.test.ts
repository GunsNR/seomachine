import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createServer, type Server } from 'node:http';
import { auditPages } from '@/lib/seo/audit';
import { crawlSite, fetchPage } from '@/lib/seo/crawler';

/**
 * Exercises the crawler against a real HTTP server rather than a string, so
 * redirects, content types, link resolution and multi-page traversal are all
 * covered end to end.
 */
const PAGES: Record<string, { status?: number; type?: string; body: string }> = {
  '/': {
    body: `<!doctype html><html lang="en"><head>
      <meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
      <title>Fixture Home — A Title Of Reasonable Length</title>
      <meta name="description" content="A home page description written to sit comfortably inside the recommended one hundred and twenty to one hundred and fifty eight character window.">
      <link rel="canonical" href="http://HOST/">
      <meta property="og:title" content="Home"><meta property="og:description" content="d"><meta property="og:image" content="i">
      <script type="application/ld+json">{"@type":"Organization","author":{"@type":"Person","name":"A"}}</script>
      </head><body>
      <h1>Fixture Home</h1><h2>What is this?</h2>
      <p>${'Body copy that comfortably clears the thin content threshold for auditing. '.repeat(40)}</p>
      <a href="/about">About</a><a href="/thin">Thin</a>
      <a href="https://www.nih.gov/study">External source</a>
      <img src="/a.png" alt="described" width="8" height="8">
      </body></html>`,
  },
  '/about': {
    body: `<!doctype html><html lang="en"><head>
      <meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
      <title>Fixture About — Another Title Of Fine Length</title>
      <meta name="description" content="An about page description also written to sit comfortably inside the recommended one hundred and twenty to one hundred fifty eight character window.">
      </head><body><h1>About</h1>
      <p>${'More than sufficient body copy for the about page of this fixture site. '.repeat(40)}</p>
      <a href="/">Home</a></body></html>`,
  },
  // Deliberately broken: no title, no h1, no viewport, almost no copy.
  '/thin': { body: '<!doctype html><html><body><p>tiny</p></body></html>' },
  '/gone': { status: 404, body: 'not found' },
  '/data.json': { type: 'application/json', body: '{"a":1}' },
};

let server: Server;
let base = '';

beforeAll(async () => {
  server = createServer((req, res) => {
    const path = (req.url ?? '/').split('?')[0];
    const page = PAGES[path];
    if (!page) {
      res.writeHead(404, { 'Content-Type': 'text/html' });
      res.end('<html><body>404</body></html>');
      return;
    }
    res.writeHead(page.status ?? 200, { 'Content-Type': page.type ?? 'text/html; charset=utf-8' });
    res.end(page.body.replaceAll('HOST', base.replace(/^https?:\/\//, '')));
  });

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const addr = server.address();
  if (addr && typeof addr === 'object') base = `http://127.0.0.1:${addr.port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

describe('fetchPage over real HTTP', () => {
  it('parses a live page', async () => {
    const p = await fetchPage(`${base}/`);
    expect(p.ok).toBe(true);
    expect(p.status).toBe(200);
    expect(p.title).toContain('Fixture Home');
    expect(p.h1).toEqual(['Fixture Home']);
    expect(p.wordCount).toBeGreaterThan(300);
    expect(p.internalLinks.length).toBeGreaterThanOrEqual(2);
    expect(p.externalLinks.map((l) => l.href)).toContain('https://www.nih.gov/study');
    expect(p.bytes).toBeGreaterThan(0);
    expect(p.fetchMs).toBeGreaterThanOrEqual(0);
  });

  it('reports a 404 as data rather than throwing', async () => {
    const p = await fetchPage(`${base}/gone`);
    expect(p.ok).toBe(false);
    expect(p.status).toBe(404);
  });

  it('flags a non-HTML response instead of parsing it', async () => {
    const p = await fetchPage(`${base}/data.json`);
    expect(p.error).toMatch(/Non-HTML/);
    expect(p.wordCount).toBe(0);
  });

  it('returns an error object for an unreachable host', async () => {
    const p = await fetchPage('http://127.0.0.1:1/', { timeoutMs: 2000 });
    expect(p.ok).toBe(false);
    expect(p.error).toBeTruthy();
  });
});

describe('crawlSite over real HTTP', () => {
  it('follows internal links and stays on-origin', async () => {
    const pages = await crawlSite(base, { maxPages: 10, concurrency: 2, timeoutMs: 8000 });
    const paths = pages.map((p) => new URL(p.finalUrl).pathname).sort();
    expect(paths).toContain('/');
    expect(paths).toContain('/about');
    expect(paths).toContain('/thin');
    // Never leaves the origin.
    expect(pages.every((p) => p.finalUrl.startsWith(base))).toBe(true);
  });

  it('respects maxPages', async () => {
    const pages = await crawlSite(base, { maxPages: 2, concurrency: 1 });
    expect(pages.length).toBeLessThanOrEqual(2);
  });

  it('produces an audit that catches the deliberately broken page', async () => {
    const pages = await crawlSite(base, { maxPages: 10, concurrency: 2 });
    const report = auditPages(pages);

    const thinFindings = report.findings.filter((f) => f.url.endsWith('/thin'));
    const codes = thinFindings.map((f) => f.code);
    expect(codes).toContain('title-missing');
    expect(codes).toContain('h1-missing');
    expect(codes).toContain('thin-content');
    expect(codes).toContain('viewport');

    expect(report.score).toBeGreaterThanOrEqual(0);
    expect(report.score).toBeLessThanOrEqual(100);
    expect(report.pagesCrawled).toBeGreaterThanOrEqual(3);
  });
});
