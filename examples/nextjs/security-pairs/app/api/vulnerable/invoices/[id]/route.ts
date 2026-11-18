import type { NextRequest } from 'next/server';

import { getCurrentUser } from '@/lib/session';
import { findInvoice } from '@/lib/store';

// VULNERABLE (IDOR). It checks that *someone* is signed in, then returns any
// invoice by ID, including internal fields, without checking who owns it.
export async function GET(_request: NextRequest, ctx: RouteContext<'/api/vulnerable/invoices/[id]'>) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await ctx.params;
  const invoice = findInvoice('idor', id);
  if (!invoice) return Response.json({ error: 'Not found' }, { status: 404 });

  return Response.json(invoice);
}
