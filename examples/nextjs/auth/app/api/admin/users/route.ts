import { listUsersForAdmin } from '@/lib/dal';

// proxy.ts does not match /api, and even if it did, a Route Handler is a
// public endpoint that anyone can call with curl. The DAL decides.
export async function GET() {
  const result = await listUsersForAdmin();

  if (result.status === 'unauthenticated') {
    return Response.json({ error: 'Not signed in.' }, { status: 401 });
  }
  if (result.status === 'forbidden') {
    return Response.json({ error: 'Admins only.' }, { status: 403 });
  }

  return Response.json({ users: result.data });
}
