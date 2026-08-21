import { NextResponse, type NextRequest } from 'next/server';

/**
 * Gate the dashboard at the edge.
 *
 * This only checks that a session cookie is *present* — the cookie's signature
 * is verified in `getSession()` on the server, which every /app page calls.
 * Doing the cheap presence check here avoids an unauthenticated render and a
 * flash of the dashboard shell.
 */
export function middleware(req: NextRequest) {
  const hasSession = req.cookies.has('supertool_session');

  if (!hasSession) {
    const url = req.nextUrl.clone();
    url.pathname = '/login';
    url.searchParams.set('next', req.nextUrl.pathname);
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/app/:path*'],
};
