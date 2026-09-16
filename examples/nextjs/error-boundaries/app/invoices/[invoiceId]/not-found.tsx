import Link from 'next/link';

export default function InvoiceNotFound() {
  return (
    <main>
      <h1>Invoice not found</h1>
      <p>No invoice has that number. This is not-found.tsx, not the catchError fallback.</p>
      <Link href="/invoices/inv-1001">View invoice inv-1001</Link>
    </main>
  );
}
