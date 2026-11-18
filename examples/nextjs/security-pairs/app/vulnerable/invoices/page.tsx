import { getCurrentUser } from '@/lib/session';
import { listInvoices } from '@/lib/store';

import { deleteInvoice } from './actions';

export default async function VulnerableInvoicesPage() {
  const user = await getCurrentUser();
  const invoices = listInvoices('actions-vulnerable');

  return (
    <main>
      <h1>Invoices (vulnerable)</h1>
      <p>Signed in as: {user ? user.name : 'nobody'}</p>
      <ul>
        {invoices.map((invoice) => (
          <li key={invoice.id} data-invoice-id={invoice.id}>
            {invoice.id}: {invoice.customer}
            {/* Hiding the button is UI, not authorization. */}
            {user?.role === 'admin' && (
              <form action={deleteInvoice}>
                <input type="hidden" name="invoiceId" value={invoice.id} />
                <button type="submit">Delete</button>
              </form>
            )}
          </li>
        ))}
      </ul>
    </main>
  );
}
