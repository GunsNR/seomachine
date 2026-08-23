import { NextResponse, type NextRequest } from 'next/server';

/**
 * Gates the dashboard and exposes the current path to server components.
 *
 * The session cookie is only checked for *presence* here — its signature is
 * verified by `getSession()` on every /app page. Doing the cheap check at the
 * edge avoids rendering the dashboard shell for a signed-out visitor.
 *
 * `x-pathname` is injected because server components cannot otherwise read the
 * request path, and the app layout needs it to avoid redirect-looping on the
 * onboarding route.
 */
export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (!req.cookies.has('supertool_session')) {
    const url = req.nextUrl.clone();
    url.pathname = '/login';
    url.searchParams.set('next', pathname);
    return NextResponse.redirect(url);
  }

  const headers = new Headers(req.headers);
  headers.set('x-pathname', pathname);
  return NextResponse.next({ request: { headers } });
}

export const config = {
  matcher: ['/app/:path*'],
};
