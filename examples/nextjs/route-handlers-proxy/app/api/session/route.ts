import { NextResponse } from 'next/server';
import { z } from 'zod';
import { SESSION_COOKIE, createSessionValue } from '@/lib/session';

const loginSchema = z.object({ userId: z.string().regex(/^[a-z0-9_-]{3,32}$/) });

// POST /api/session  {"userId":"ada"}
// Demo only: there is no password. It exists so you can get a signed cookie.
export async function POST(request: Request) {
  const body: unknown = await request.json().catch(() => null);
  const parsed = loginSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid userId' }, { status: 422 });
  }

  const response = NextResponse.json({ userId: parsed.data.userId });
  response.cookies.set({
    name: SESSION_COOKIE,
    value: createSessionValue(parsed.data.userId),
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 60 * 60,
  });
  return response;
}

// DELETE /api/session
export async function DELETE() {
  const response = new NextResponse(null, { status: 204 });
  response.cookies.delete(SESSION_COOKIE);
  return response;
}
