import { type NextRequest, NextResponse } from 'next/server';

// proxy.ts runs before routing, on the Node.js runtime, for every path the
// matcher selects. Keep it fast: no database calls, no slow fetches.
//
// It does two things here:
// 1. Tags every request with an id, forwarded upstream and echoed to the client.
// 2. Redirects /dashboard to /login when there is no session cookie at all.
//    That is an OPTIMISTIC check. It never verifies the cookie. The dashboard
//    page verifies the signature itself, and so must every Route Handler and
//    Server Action that touches private data.

const SESSION_COOKIE = 'session';

export function proxy(request: NextRequest) {
  // Always mint a fresh id. A client-supplied x-request-id is not trusted.
  const requestId = crypto.randomUUID();
  const { pathname } = request.nextUrl;

  if (pathname.startsWith('/dashboard') && !request.cookies.has(SESSION_COOKIE)) {
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('returnTo', pathname);
    const redirect = NextResponse.redirect(loginUrl);
    redirect.headers.set('x-request-id', requestId);
    return redirect;
  }

  // Forward the id to the route (request headers), not only to the client.
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-request-id', requestId);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set('x-request-id', requestId);
  return response;
}

export const config = {
  // Skip build assets and the favicon. Everything else, including /api, runs proxy.
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
