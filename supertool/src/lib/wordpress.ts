import 'server-only';
import { decryptSecret } from './crypto';

/**
 * WordPress REST client.
 *
 * Publishes through the core /wp/v2 API using an application password, so it
 * works on any WordPress 6.0+ site with no plugin installed. When the SuperTool
 * plugin *is* present it additionally accepts SEO metadata, which the plugin
 * writes through Yoast or Rank Math rather than replacing them.
 */

export interface WordPressCredentials {
  siteUrl: string;
  username: string;
  /** Encrypted at rest; decrypted here immediately before use. */
  appPassword: string;
}

export interface PublishInput {
  title: string;
  /** Markdown-ish body: ## headings, - lists, paragraphs. */
  body: string;
  slug?: string;
  status?: 'draft' | 'publish' | 'pending' | 'future';
  excerpt?: string;
  metaTitle?: string;
  metaDescription?: string;
  /** Update this post instead of creating a new one. */
  postId?: number;
}

export interface PublishResult {
  ok: boolean;
  postId?: number;
  url?: string;
  status?: string;
  error?: string;
}

function authHeader(creds: WordPressCredentials): string {
  const password = decryptSecret(creds.appPassword) || creds.appPassword;
  // WordPress prints application passwords in spaced groups; it accepts them
  // either way, but stripping spaces avoids a confusing 401 on a pasted value.
  const token = Buffer.from(`${creds.username}:${password.replace(/\s+/g, '')}`).toString('base64');
  return `Basic ${token}`;
}

function apiRoot(siteUrl: string): string {
  return `${siteUrl.trim().replace(/\/+$/, '')}/wp-json`;
}

/**
 * Converts the constrained markdown subset used by the content engine into
 * WordPress block markup, so posts land as native editable blocks rather than
 * one opaque Classic block.
 */
export function toBlocks(markdown: string): string {
  const escapeHtml = (s: string) =>
    s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  const inline = (s: string) =>
    escapeHtml(s)
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
      .replace(/(^|[\s(])\*([^*]+)\*/g, '$1<em>$2</em>')
      .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, '<a href="$2">$1</a>');

  const blocks: string[] = [];

  for (const raw of markdown.split(/\n{2,}/)) {
    const block = raw.trim();
    if (!block) continue;

    const heading = block.match(/^(#{2,4})\s+(.+)$/);
    if (heading) {
      const level = heading[1].length;
      blocks.push(
        `<!-- wp:heading {"level":${level}} -->\n<h${level}>${inline(heading[2])}</h${level}>\n<!-- /wp:heading -->`,
      );
      continue;
    }

    const lines = block.split('\n').map((l) => l.trim()).filter(Boolean);

    if (lines.every((l) => /^[-*+]\s+/.test(l))) {
      const items = lines.map((l) => `<li>${inline(l.replace(/^[-*+]\s+/, ''))}</li>`).join('\n');
      blocks.push(`<!-- wp:list -->\n<ul>\n${items}\n</ul>\n<!-- /wp:list -->`);
      continue;
    }

    if (lines.every((l) => /^\d+[.)]\s+/.test(l))) {
      const items = lines.map((l) => `<li>${inline(l.replace(/^\d+[.)]\s+/, ''))}</li>`).join('\n');
      blocks.push(`<!-- wp:list {"ordered":true} -->\n<ol>\n${items}\n</ol>\n<!-- /wp:list -->`);
      continue;
    }

    if (lines.every((l) => l.startsWith('>'))) {
      const quote = lines.map((l) => `<p>${inline(l.replace(/^>\s?/, ''))}</p>`).join('\n');
      blocks.push(`<!-- wp:quote -->\n<blockquote class="wp-block-quote">\n${quote}\n</blockquote>\n<!-- /wp:quote -->`);
      continue;
    }

    blocks.push(`<!-- wp:paragraph -->\n<p>${inline(lines.join(' '))}</p>\n<!-- /wp:paragraph -->`);
  }

  return blocks.join('\n\n');
}

/**
 * Turns a low-level fetch failure into something a site owner can act on.
 * Node reports almost every network problem as the bare string "fetch failed",
 * which tells the user nothing.
 */
function describeNetworkError(err: unknown, siteUrl: string): string {
  if (!(err instanceof Error)) return 'Unknown error contacting WordPress.';

  if (err.name === 'AbortError') {
    return 'WordPress did not respond within 20 seconds. The site may be slow or blocking our requests.';
  }

  const cause = (err as { cause?: { code?: string } }).cause;
  const code = cause?.code ?? '';

  const byCode: Record<string, string> = {
    ENOTFOUND: `We could not resolve ${siteUrl}. Check the domain is spelled correctly.`,
    ECONNREFUSED: `${siteUrl} refused the connection. Check the site is online and the URL includes the right port.`,
    ECONNRESET: `${siteUrl} closed the connection. A firewall or security plugin may be blocking us.`,
    ETIMEDOUT: `${siteUrl} did not respond in time. The site may be slow or firewalled.`,
    EPROTO: `The TLS handshake with ${siteUrl} failed. Check the site's certificate.`,
    DEPTH_ZERO_SELF_SIGNED_CERT: `${siteUrl} uses a self-signed certificate, which we cannot verify.`,
    UNABLE_TO_VERIFY_LEAF_SIGNATURE: `We could not verify the certificate for ${siteUrl}.`,
    CERT_HAS_EXPIRED: `The certificate for ${siteUrl} has expired.`,
  };

  if (byCode[code]) return byCode[code];

  if (err.message === 'fetch failed') {
    return `We could not reach ${siteUrl}. Check the URL is correct and the site is publicly accessible.`;
  }

  return err.message;
}

async function call(
  creds: WordPressCredentials,
  path: string,
  init: { method?: string; body?: unknown } = {},
): Promise<{ ok: boolean; status: number; data: unknown; error?: string }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20_000);

  try {
    const res = await fetch(`${apiRoot(creds.siteUrl)}${path}`, {
      method: init.method ?? 'GET',
      headers: {
        Authorization: authHeader(creds),
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: init.body ? JSON.stringify(init.body) : undefined,
      signal: controller.signal,
    });

    const text = await res.text();
    let data: unknown = null;
    try { data = text ? JSON.parse(text) : null; } catch { data = text; }

    if (!res.ok) {
      const message =
        data && typeof data === 'object' && 'message' in data
          ? String((data as { message: unknown }).message)
          : `WordPress returned HTTP ${res.status}.`;
      return { ok: false, status: res.status, data, error: message };
    }

    return { ok: true, status: res.status, data };
  } catch (err) {
    return { ok: false, status: 0, data: null, error: describeNetworkError(err, creds.siteUrl) };
  } finally {
    clearTimeout(timer);
  }
}

/** Confirms the credentials work and reports who they authenticate as. */
export async function verifyConnection(
  creds: WordPressCredentials,
): Promise<{ ok: boolean; user?: string; siteName?: string; error?: string }> {
  const me = await call(creds, '/wp/v2/users/me?context=edit');
  if (!me.ok) {
    // 401/403 almost always means a bad application password rather than an outage.
    const hint =
      me.status === 401 || me.status === 403
        ? 'Check the username and application password. Application passwords are created under Users → Profile in WordPress.'
        : me.error;
    return { ok: false, error: hint };
  }

  const user = me.data as { name?: string; slug?: string } | null;
  const root = await call(creds, '/');
  const site = root.data as { name?: string } | null;

  return { ok: true, user: user?.name ?? user?.slug ?? 'unknown', siteName: site?.name };
}

/** Creates or updates a post. */
export async function publishPost(
  creds: WordPressCredentials,
  input: PublishInput,
): Promise<PublishResult> {
  const payload: Record<string, unknown> = {
    title: input.title,
    content: toBlocks(input.body),
    status: input.status ?? 'draft',
  };

  if (input.slug) payload.slug = input.slug;
  if (input.excerpt) payload.excerpt = input.excerpt;

  // Consumed by the SuperTool plugin, which routes them into Yoast or Rank
  // Math. Core ignores unknown keys, so this is safe without the plugin.
  if (input.metaTitle || input.metaDescription) {
    payload.supertool_meta = {
      title: input.metaTitle ?? '',
      description: input.metaDescription ?? '',
    };
  }

  const path = input.postId ? `/wp/v2/posts/${input.postId}` : '/wp/v2/posts';
  const res = await call(creds, path, { method: 'POST', body: payload });

  if (!res.ok) return { ok: false, error: res.error };

  const post = res.data as { id?: number; link?: string; status?: string } | null;
  return { ok: true, postId: post?.id, url: post?.link, status: post?.status };
}
