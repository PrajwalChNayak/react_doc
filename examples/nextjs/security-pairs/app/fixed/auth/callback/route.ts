import { redirect } from 'next/navigation';
import type { NextRequest } from 'next/server';

import { safeRedirectPath } from '@/lib/safe-redirect';

// FIXED. Only same-origin relative paths survive; everything else falls back
// to /dashboard.
export async function GET(request: NextRequest) {
  const next = safeRedirectPath(request.nextUrl.searchParams.get('next'));
  redirect(next);
}
