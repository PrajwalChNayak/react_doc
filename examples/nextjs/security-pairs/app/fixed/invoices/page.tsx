import { getCurrentUser } from '@/lib/session';
import { listInvoices } from '@/lib/store';

import { deleteInvoice } from './actions';

export default async function FixedInvoicesPage() {
  const user = await getCurrentUser();
  const invoices = listInvoices('actions-fixed');

  return (
    <main>
      <h1>Invoices (fixed)</h1>
      <p>Signed in as: {user ? user.name : 'nobody'}</p>
      <ul>
        {invoices.map((invoice) => (
          <li key={invoice.id} data-invoice-id={invoice.id}>
            {invoice.id}: {invoice.customer}
            {/* Still hidden for non-admins, for UX. The action enforces the rule. */}
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
