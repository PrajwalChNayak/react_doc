'use server';

import { revalidatePath } from 'next/cache';

import { removeInvoice } from '@/lib/store';

// VULNERABLE. No authentication, no authorization, no validation. The page only
// renders the delete button for admins, but this function is a public endpoint:
// anyone who knows its action ID can POST to it.
export async function deleteInvoice(formData: FormData): Promise<void> {
  const invoiceId = formData.get('invoiceId') as string;
  removeInvoice('actions-vulnerable', invoiceId);
  revalidatePath('/vulnerable/invoices');
}
