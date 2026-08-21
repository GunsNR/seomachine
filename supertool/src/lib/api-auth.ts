import 'server-only';
import { NextResponse } from 'next/server';
import { authenticateApiKey } from './apikey';

/**
 * Resolve the project behind an `X-SuperTool-Key` header (or `Authorization:
 * Bearer`). Returns either the project or a ready-to-return 401 response.
 */
export async function requireApiKey(req: Request) {
  const header =
    req.headers.get('x-supertool-key') ??
    req.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ??
    '';

  if (!header) {
    return {
      project: null,
      response: NextResponse.json(
        { error: 'Missing API key. Send it as the X-SuperTool-Key header.' },
        { status: 401 },
      ),
    } as const;
  }

  const project = await authenticateApiKey(header);
  if (!project) {
    return {
      project: null,
      response: NextResponse.json({ error: 'Invalid or revoked API key.' }, { status: 401 }),
    } as const;
  }

  return { project, response: null } as const;
}

/** Preflight support for the plugin's cross-origin calls. */
export function corsPreflight() {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, X-SuperTool-Key, Authorization',
      'Access-Control-Max-Age': '86400',
    },
  });
}
