'use server';

import { revalidatePath } from 'next/cache';

import { deleteInvoiceAsAdmin } from '@/lib/dal';

// FIXED. The action stays thin and delegates to the Data Access Layer, which
// authenticates, checks the admin role and validates the ID before deleting.
// The check runs on every invocation, however the request was produced.
export async function deleteInvoice(formData: FormData): Promise<void> {
  await deleteInvoiceAsAdmin(formData.get('invoiceId'));
  revalidatePath('/fixed/invoices');
}
