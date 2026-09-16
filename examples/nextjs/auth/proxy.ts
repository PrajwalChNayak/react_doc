import { NextResponse, type NextRequest } from 'next/server';

// Optimistic check only. It looks for the presence of a session cookie so a
// signed-out browser is redirected before any page work starts. It does NOT
// verify the cookie, and it does not run for /api at all. The authoritative
// checks live in lib/dal.ts and run in every page, Server Action and Route
// Handler that touches protected data.
export function proxy(request: NextRequest) {
  const hasSessionCookie = request.cookies.has('session');
  if (!hasSessionCookie) {
    return NextResponse.redirect(new URL('/login', request.nextUrl));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/dashboard/:path*', '/admin/:path*'],
};
