import 'server-only';

import { z } from 'zod';

import { getCurrentUser } from './session';
import { findInvoice, removeInvoice, type User } from './store';

// The Data Access Layer used by every /fixed route. Each exported function
// authenticates and authorizes before it touches data, so a caller cannot
// reach the data without passing the check.

export class AccessError extends Error {
  constructor(
    readonly status: 401 | 403 | 404,
    message: string,
  ) {
    super(message);
    this.name = 'AccessError';
  }
}

const invoiceId = z.string().regex(/^inv_\d{4}$/);

export async function requireUser(): Promise<User> {
  const user = await getCurrentUser();
  if (!user) throw new AccessError(401, 'Sign in required');
  return user;
}

export async function deleteInvoiceAsAdmin(rawInvoiceId: unknown): Promise<void> {
  const user = await requireUser();
  if (user.role !== 'admin') throw new AccessError(403, 'Admins only');

  const parsed = invoiceId.safeParse(rawInvoiceId);
  if (!parsed.success) throw new AccessError(404, 'Invoice not found');

  if (!removeInvoice('actions-fixed', parsed.data)) {
    throw new AccessError(404, 'Invoice not found');
  }
}

export type InvoiceDTO = {
  id: string;
  customer: string;
  amountCents: number;
};

// Returns null both when the invoice does not exist and when it belongs to
// someone else, so the caller answers 404 in both cases and an attacker cannot
// tell which invoice IDs exist.
export async function getInvoiceForCurrentUser(rawInvoiceId: string): Promise<InvoiceDTO | null> {
  const user = await requireUser();

  const parsed = invoiceId.safeParse(rawInvoiceId);
  if (!parsed.success) return null;

  const invoice = findInvoice('idor', parsed.data);
  if (!invoice || invoice.ownerId !== user.id) return null;

  // A DTO: internalNotes and ownerId never leave the server.
  return { id: invoice.id, customer: invoice.customer, amountCents: invoice.amountCents };
}
