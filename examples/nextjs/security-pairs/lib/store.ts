import 'server-only';

// In-memory data for the demo. Each vulnerable/fixed pair gets its own table so
// an exploit test against one route cannot change what another test sees.
//
// The tables live on globalThis because a production build can bundle this
// module into more than one server entry (pages, actions, Route Handlers). A
// module-level variable would give each entry its own copy.

export type Role = 'admin' | 'member';

export type User = {
  id: string;
  name: string;
  role: Role;
};

export type Invoice = {
  id: string;
  ownerId: string;
  customer: string;
  amountCents: number;
  internalNotes: string;
};

export type TableName = 'actions-vulnerable' | 'actions-fixed' | 'idor';

const USERS: Record<string, User> = {
  admin: { id: 'admin', name: 'Ada (admin)', role: 'admin' },
  alice: { id: 'alice', name: 'Alice', role: 'member' },
  bob: { id: 'bob', name: 'Bob', role: 'member' },
};

function seed(): Invoice[] {
  return [
    { id: 'inv_1001', ownerId: 'alice', customer: 'Northwind Traders', amountCents: 125_000, internalNotes: 'Net 30' },
    { id: 'inv_1002', ownerId: 'bob', customer: 'Contoso Ltd', amountCents: 98_000, internalNotes: 'Disputed, legal hold' },
    { id: 'inv_1003', ownerId: 'bob', customer: 'Fabrikam Inc', amountCents: 43_050, internalNotes: 'Paid by wire' },
  ];
}

type Db = Record<TableName, Invoice[]>;

const globalForDb = globalThis as typeof globalThis & { __securityPairsDb?: Db };

function db(): Db {
  globalForDb.__securityPairsDb ??= {
    'actions-vulnerable': seed(),
    'actions-fixed': seed(),
    idor: seed(),
  };
  return globalForDb.__securityPairsDb;
}

export function findUser(id: string): User | null {
  return Object.hasOwn(USERS, id) ? USERS[id] : null;
}

export function listInvoices(table: TableName): Invoice[] {
  return db()[table];
}

export function findInvoice(table: TableName, id: string): Invoice | null {
  return db()[table].find((invoice) => invoice.id === id) ?? null;
}

export function removeInvoice(table: TableName, id: string): boolean {
  const rows = db()[table];
  const index = rows.findIndex((invoice) => invoice.id === id);
  if (index === -1) return false;
  rows.splice(index, 1);
  return true;
}
