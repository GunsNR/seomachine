import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createServer, type IncomingMessage, type Server } from 'node:http';
import { publishPost, verifyConnection } from '@/lib/wordpress';

/**
 * Exercises the WordPress client against a server that speaks the real
 * /wp-json protocol, so auth, payload shape, error mapping and the
 * create-vs-update path are all covered end to end.
 */

const USER = 'editor';
const PASSWORD = 'abcd efgh ijkl mnop qrst uvwx';

interface StoredPost {
  id: number;
  title: string;
  content: string;
  slug: string;
  status: string;
  supertool_meta?: { title: string; description: string };
}

let server: Server;
let baseUrl = '';
const posts = new Map<number, StoredPost>();
let nextId = 100;

/** WordPress accepts the application password with or without spaces. */
function authOk(req: IncomingMessage): boolean {
  const header = req.headers.authorization ?? '';
  if (!header.startsWith('Basic ')) return false;
  const [user, pass] = Buffer.from(header.slice(6), 'base64').toString('utf8').split(':');
  return user === USER && pass === PASSWORD.replace(/\s+/g, '');
}

function readJson(req: IncomingMessage): Promise<Record<string, unknown>> {
  return new Promise((resolve) => {
    let body = '';
    req.on('data', (c) => { body += c; });
    req.on('end', () => {
      try { resolve(JSON.parse(body || '{}')); } catch { resolve({}); }
    });
  });
}

beforeAll(async () => {
  server = createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', 'http://localhost');
    const send = (status: number, payload: unknown) => {
      res.writeHead(status, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(payload));
    };

    if (!authOk(req)) {
      return send(401, { code: 'rest_not_logged_in', message: 'Incorrect username or password.' });
    }

    if (url.pathname === '/wp-json/') {
      return send(200, { name: 'Test Site', description: 'A mock WordPress' });
    }

    if (url.pathname === '/wp-json/wp/v2/users/me') {
      return send(200, { id: 1, name: 'Editor Person', slug: USER });
    }

    if (url.pathname === '/wp-json/wp/v2/posts' && req.method === 'POST') {
      const body = await readJson(req);
      const id = nextId++;
      const post: StoredPost = {
        id,
        title: String(body.title ?? ''),
        content: String(body.content ?? ''),
        slug: String(body.slug ?? ''),
        status: String(body.status ?? 'draft'),
        supertool_meta: body.supertool_meta as StoredPost['supertool_meta'],
      };
      posts.set(id, post);
      return send(201, { id, link: `${baseUrl}/?p=${id}`, status: post.status });
    }

    const update = url.pathname.match(/^\/wp-json\/wp\/v2\/posts\/(\d+)$/);
    if (update && req.method === 'POST') {
      const id = Number(update[1]);
      const existing = posts.get(id);
      if (!existing) return send(404, { code: 'rest_post_invalid_id', message: 'Invalid post ID.' });
      const body = await readJson(req);
      Object.assign(existing, {
        title: String(body.title ?? existing.title),
        content: String(body.content ?? existing.content),
        status: String(body.status ?? existing.status),
      });
      return send(200, { id, link: `${baseUrl}/?p=${id}`, status: existing.status });
    }

    send(404, { code: 'rest_no_route', message: 'No route was found.' });
  });

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const addr = server.address();
  if (addr && typeof addr === 'object') baseUrl = `http://127.0.0.1:${addr.port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

const creds = () => ({ siteUrl: baseUrl, username: USER, appPassword: PASSWORD });

describe('verifyConnection', () => {
  it('authenticates and reports the site and user', async () => {
    const result = await verifyConnection(creds());
    expect(result.ok).toBe(true);
    expect(result.user).toBe('Editor Person');
    expect(result.siteName).toBe('Test Site');
  });

  it('gives an actionable hint on bad credentials rather than a raw 401', async () => {
    const result = await verifyConnection({ ...creds(), appPassword: 'wrong wrong wrong' });
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/application password/i);
  });

  it('explains an unreachable host instead of surfacing "fetch failed"', async () => {
    const result = await verifyConnection({ ...creds(), siteUrl: 'http://127.0.0.1:1' });
    expect(result.ok).toBe(false);
    expect(result.error).toBeTruthy();
    expect(result.error).not.toBe('fetch failed');
  });

  it('tolerates a trailing slash on the site URL', async () => {
    expect((await verifyConnection({ ...creds(), siteUrl: `${baseUrl}/` })).ok).toBe(true);
  });
});

describe('publishPost', () => {
  it('creates a post and returns its id and link', async () => {
    const result = await publishPost(creds(), {
      title: 'A New Article',
      body: '## Heading\n\nSome body copy.\n\n- one\n- two',
      slug: 'a-new-article',
      status: 'publish',
      metaTitle: 'A New Article | Brand',
      metaDescription: 'The description.',
    });

    expect(result.ok).toBe(true);
    expect(result.postId).toBeGreaterThan(0);
    expect(result.url).toContain('?p=');
    expect(result.status).toBe('publish');

    const stored = posts.get(result.postId!)!;
    expect(stored.content).toContain('<!-- wp:heading {"level":2} -->');
    expect(stored.content).toContain('<!-- wp:list -->');
    expect(stored.slug).toBe('a-new-article');
    expect(stored.supertool_meta?.description).toBe('The description.');
  });

  it('defaults to draft when no status is given', async () => {
    const result = await publishPost(creds(), { title: 'Quiet One', body: 'Text.' });
    expect(result.status).toBe('draft');
  });

  it('updates in place when given a post id, rather than duplicating', async () => {
    const created = await publishPost(creds(), { title: 'Original', body: 'First version.' });
    const before = posts.size;

    const updated = await publishPost(creds(), {
      title: 'Revised', body: 'Second version.', postId: created.postId,
    });

    expect(updated.ok).toBe(true);
    expect(updated.postId).toBe(created.postId);
    expect(posts.size).toBe(before);
    expect(posts.get(created.postId!)!.title).toBe('Revised');
    expect(posts.get(created.postId!)!.content).toContain('Second version.');
  });

  it('surfaces the WordPress error message on a bad post id', async () => {
    const result = await publishPost(creds(), { title: 'X', body: 'Y', postId: 999_999 });
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/Invalid post ID/i);
  });

  it('reports failure rather than throwing on bad credentials', async () => {
    const result = await publishPost(
      { ...creds(), appPassword: 'nope' },
      { title: 'X', body: 'Y' },
    );
    expect(result.ok).toBe(false);
    expect(result.error).toBeTruthy();
  });
});
