export type Invoice = {
  id: string;
  customer: string;
  totalCents: number;
};

const invoices: Invoice[] = [
  { id: 'inv-1001', customer: 'Acme Corp', totalCents: 129_900 },
  { id: 'inv-1002', customer: 'Globex', totalCents: 48_000 },
];

export async function findInvoice(id: string): Promise<Invoice | undefined> {
  await new Promise((resolve) => setTimeout(resolve, 200));
  return invoices.find((invoice) => invoice.id === id);
}
