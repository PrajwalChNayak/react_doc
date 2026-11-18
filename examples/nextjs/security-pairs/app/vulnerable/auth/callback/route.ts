import { redirect } from 'next/navigation';
import type { NextRequest } from 'next/server';

// VULNERABLE (open redirect). A sign-in callback that sends the user wherever
// `next` says. `redirect()` accepts absolute URLs, so
// /vulnerable/auth/callback?next=https://evil.example/login sends a user who
// trusted this domain straight to a phishing page.
export async function GET(request: NextRequest) {
  // A real callback would verify the provider's response and set the session here.
  const next = request.nextUrl.searchParams.get('next') ?? '/dashboard';
  redirect(next);
}
