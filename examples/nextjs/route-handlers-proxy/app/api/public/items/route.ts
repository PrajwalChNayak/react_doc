import { type NextRequest, NextResponse } from 'next/server';
import { getServerEnv } from '@/lib/env';
import { listItems } from '@/lib/items';

// A read-only endpoint that browsers on other origins may call.
// CORS is a browser rule, not access control: curl ignores it entirely.
// Only expose data here that is safe for anyone to read.

const ALLOWED_METHODS = 'GET, OPTIONS';
const ALLOWED_HEADERS = 'Content-Type';

function corsHeaders(origin: string | null): Headers {
  const headers = new Headers({ Vary: 'Origin' });
  if (origin && getServerEnv().ALLOWED_ORIGINS.includes(origin)) {
    // Echo the one matching origin. Never reflect an arbitrary Origin header.
    headers.set('Access-Control-Allow-Origin', origin);
  }
  return headers;
}

// Preflight. Defining OPTIONS replaces the automatic one Next.js adds.
export function OPTIONS(request: NextRequest) {
  const headers = corsHeaders(request.headers.get('origin'));
  if (headers.has('Access-Control-Allow-Origin')) {
    headers.set('Access-Control-Allow-Methods', ALLOWED_METHODS);
    headers.set('Access-Control-Allow-Headers', ALLOWED_HEADERS);
    headers.set('Access-Control-Max-Age', '600');
  }
  return new Response(null, { status: 204, headers });
}

// GET /api/public/items
export function GET(request: NextRequest) {
  const headers = corsHeaders(request.headers.get('origin'));
  const items = listItems(100).map(({ id, name }) => ({ id, name }));
  return NextResponse.json({ items }, { headers });
}
