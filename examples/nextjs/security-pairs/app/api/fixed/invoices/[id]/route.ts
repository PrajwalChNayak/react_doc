import type { NextRequest } from 'next/server';

import { AccessError, getInvoiceForCurrentUser } from '@/lib/dal';

// FIXED. The ownership check lives in the DAL. A missing invoice and someone
// else's invoice both return 404, so IDs cannot be enumerated.
export async function GET(_request: NextRequest, ctx: RouteContext<'/api/fixed/invoices/[id]'>) {
  const { id } = await ctx.params;

  try {
    const invoice = await getInvoiceForCurrentUser(id);
    if (!invoice) return Response.json({ error: 'Not found' }, { status: 404 });
    return Response.json(invoice);
  } catch (error) {
    if (error instanceof AccessError) {
      return Response.json({ error: error.message }, { status: error.status });
    }
    throw error;
  }
}
