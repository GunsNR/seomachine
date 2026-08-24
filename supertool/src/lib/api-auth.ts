import 'server-only';
import { NextResponse } from 'next/server';
import { authenticateApiKey, type ApiScope, type KeyRejection } from './apikey';
import { db } from './db';
import type { EnvLike } from './client-ip';

/**
 * Authentication and CORS for the public `/api/v1` surface.
 *
 * Two Phase 2 changes live here.
 *
 * **Scopes.** `requireApiKey` now takes the scope the route needs. A key that
 * does not hold it is refused, so the visibility key pasted into a WordPress
 * settings screen cannot publish content.
 *
 * **CORS is no longer a wildcard.** It used to send
 * `Access-Control-Allow-Origin: *` on every response, which invites any page on
 * the internet to make cross-origin calls to this API from a visitor's browser.
 * Now an origin is echoed only when it is a registered destination for some
 * project, or explicitly allowlisted by configuration — and never `*`.
 */

/** Extra origins allowed by configuration, comma-separated. */
function configuredOrigins(env: EnvLike = process.env): readonly string[] {
  return (env.CORS_ALLOWED_ORIGINS ?? '')
    .split(',')
    .map((o) => o.trim().toLowerCase().replace(/\/$/, ''))
    .filter(Boolean);
}

/** Normalize a URL to scheme://host[:port], which is what an Origin header is. */
export function toOrigin(value: string): string {
  try {
    const u = new URL(value);
    return `${u.protocol}//${u.host}`.toLowerCase();
  } catch {
    return '';
  }
}

/**
 * True when this origin is a site some project has actually connected.
 *
 * The check is a lookup rather than a pattern: a customer proves ownership of a
 * destination by connecting it, and that connection is what earns the origin a
 * CORS grant.
 */
export async function isAllowedOrigin(
  origin: string,
  env: EnvLike = process.env,
): Promise<boolean> {
  const normalized = origin.trim().toLowerCase().replace(/\/$/, '');
  if (!normalized) return false;

  if (configuredOrigins(env).includes(normalized)) return true;

  // A connected site's URL may carry a path; compare on origin only.
  const connections = await db.siteConnection.findMany({ select: { siteUrl: true } });
  return connections.some((c) => toOrigin(c.siteUrl) === normalized);
}

/**
 * CORS headers for a response.
 *
 * Returns no CORS headers at all for an unrecognised origin — the browser then
 * blocks the read, which is the correct outcome. `Vary: Origin` is essential:
 * without it a cache can serve one tenant's allow-header to another tenant.
 */
export async function corsHeaders(
  req: Request,
  env: EnvLike = process.env,
): Promise<Record<string, string>> {
  const origin = req.headers.get('origin') ?? '';
  if (!origin) return {};
  if (!(await isAllowedOrigin(origin, env))) return { Vary: 'Origin' };

  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Credentials': 'false',
    Vary: 'Origin',
  };
}

/** Preflight response, scoped to a recognised origin. */
export async function corsPreflight(req: Request): Promise<Response> {
  const headers = await corsHeaders(req);

  // No grant: answer the preflight without allow headers rather than erroring.
  if (!headers['Access-Control-Allow-Origin']) {
    return new Response(null, { status: 204, headers: { Vary: 'Origin' } });
  }

  return new Response(null, {
    status: 204,
    headers: {
      ...headers,
      'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, X-SuperTool-Key, Authorization',
      'Access-Control-Max-Age': '86400',
    },
  });
}

/**
 * Message shown for a refused key.
 *
 * Revoked, expired and unknown all collapse to one sentence on purpose: telling
 * a caller which of those applies confirms that a key once existed. Quota and
 * scope are distinguished, because those are actionable by the legitimate owner
 * and reveal nothing about any other key.
 */
function rejectionResponse(reason: KeyRejection, extra: Record<string, string>): NextResponse {
  if (reason === 'quota') {
    return NextResponse.json(
      { error: 'This API key has reached its daily request limit.' },
      { status: 429, headers: extra },
    );
  }
  if (reason === 'scope') {
    return NextResponse.json(
      { error: 'This API key is not permitted to perform that action.' },
      { status: 403, headers: extra },
    );
  }
  return NextResponse.json(
    { error: 'Invalid or revoked API key.' },
    { status: 401, headers: extra },
  );
}

export interface ApiKeyProject {
  id: string;
  orgId: string;
  name: string;
  domain: string;
}

/**
 * Resolve the project behind an `X-SuperTool-Key` header (or `Authorization:
 * Bearer`), enforcing `scope`.
 *
 * Returns either the project or a ready-to-return error response.
 */
export async function requireApiKey(
  req: Request,
  scope?: ApiScope,
): Promise<
  | { project: ApiKeyProject; keyId: string; scopes: readonly ApiScope[]; response: null }
  | { project: null; keyId: null; scopes: null; response: NextResponse }
> {
  const cors = await corsHeaders(req);

  const header =
    req.headers.get('x-supertool-key') ??
    req.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ??
    '';

  if (!header) {
    return {
      project: null,
      keyId: null,
      scopes: null,
      response: NextResponse.json(
        { error: 'Missing API key. Send it as the X-SuperTool-Key header.' },
        { status: 401, headers: cors },
      ),
    };
  }

  const result = await authenticateApiKey(header, scope);
  if (!result.ok) {
    return { project: null, keyId: null, scopes: null, response: rejectionResponse(result.reason, cors) };
  }

  return { project: result.project, keyId: result.keyId, scopes: result.scopes, response: null };
}
