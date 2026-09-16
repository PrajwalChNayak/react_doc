import { type NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createItem, createItemSchema, listItems } from '@/lib/items';

const listQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

// GET /api/items?limit=10
export async function GET(request: NextRequest) {
  const query = listQuerySchema.safeParse({
    limit: request.nextUrl.searchParams.get('limit') ?? undefined,
  });
  if (!query.success) {
    return NextResponse.json(
      { error: 'Invalid query', issues: z.flattenError(query.error).fieldErrors },
      { status: 400 },
    );
  }

  return NextResponse.json({
    items: listItems(query.data.limit),
    // Set by proxy.ts and forwarded upstream as a request header.
    requestId: request.headers.get('x-request-id'),
  });
}

// POST /api/items  {"name":"Desk lamp","quantity":3}
export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Body must be valid JSON' }, { status: 400 });
  }

  const parsed = createItemSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid item', issues: z.flattenError(parsed.error).fieldErrors },
      { status: 422 },
    );
  }

  const item = createItem(parsed.data);
  return NextResponse.json(item, {
    status: 201,
    headers: { Location: `/api/items/${item.id}` },
  });
}
