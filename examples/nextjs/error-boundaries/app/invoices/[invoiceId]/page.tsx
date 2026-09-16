import { notFound } from 'next/navigation';
import ErrorBoundary from '@/app/ui/error-boundary';
import { findInvoice } from '@/lib/invoices';

async function InvoiceDetails({ id }: { id: string }) {
  const invoice = await findInvoice(id);
  if (!invoice) {
    // Thrown inside the catchError boundary below. catchError lets it
    // through, so not-found.tsx renders instead of the error fallback.
    notFound();
  }

  return (
    <dl>
      <dt>Customer</dt>
      <dd>{invoice.customer}</dd>
      <dt>Total</dt>
      <dd>${(invoice.totalCents / 100).toFixed(2)}</dd>
    </dl>
  );
}

export default async function InvoicePage({ params }: PageProps<'/invoices/[invoiceId]'>) {
  const { invoiceId } = await params;

  return (
    <main>
      <h1>Invoice {invoiceId}</h1>
      <ErrorBoundary title="Invoice failed to load">
        <InvoiceDetails id={invoiceId} />
      </ErrorBoundary>
    </main>
  );
}
