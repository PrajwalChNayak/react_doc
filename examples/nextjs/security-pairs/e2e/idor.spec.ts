import { expect, test } from '@playwright/test';

import { sessionCookie } from './helpers';

// Backs content/nextjs-security/idor.md. inv_1002 belongs to bob.

test('vulnerable: alice reads bob\'s invoice by changing the ID', async ({ request }) => {
  const response = await request.get('/api/vulnerable/invoices/inv_1002', { headers: sessionCookie('alice') });

  expect(response.status()).toBe(200);
  const body = await response.json();
  expect(body.ownerId).toBe('bob');
  expect(body.internalNotes).toBe('Disputed, legal hold');
});

test('fixed: alice gets 404 for bob\'s invoice, the same as for a missing one', async ({ request }) => {
  const other = await request.get('/api/fixed/invoices/inv_1002', { headers: sessionCookie('alice') });
  const missing = await request.get('/api/fixed/invoices/inv_9999', { headers: sessionCookie('alice') });

  expect(other.status()).toBe(404);
  expect(missing.status()).toBe(404);
  expect(await other.json()).toEqual(await missing.json());
});

test('fixed: no session gets 401, the owner gets a DTO without internal fields', async ({ request }) => {
  const anonymous = await request.get('/api/fixed/invoices/inv_1002');
  expect(anonymous.status()).toBe(401);

  const owner = await request.get('/api/fixed/invoices/inv_1002', { headers: sessionCookie('bob') });
  expect(owner.status()).toBe(200);
  expect(await owner.json()).toEqual({ id: 'inv_1002', customer: 'Contoso Ltd', amountCents: 98_000 });
});
