import { expect, test } from '@playwright/test';

import { invokeFormAction, pageListsInvoice, readActionId, sessionCookie } from './helpers';

// Backs content/nextjs-security/server-actions-authorization.md

test('vulnerable: a non-admin deletes an invoice by POSTing to the action directly', async ({ request }) => {
  const path = '/vulnerable/invoices';
  expect(await pageListsInvoice(request, path, 'inv_1002')).toBe(true);

  // Alice is not an admin, so her page has no delete button...
  const alicePage = await (await request.get(path, { headers: sessionCookie('alice') })).text();
  expect(alicePage).not.toContain('$ACTION_ID_');

  // ...but the endpoint does not care.
  const actionId = await readActionId(request, path);
  await invokeFormAction(request, path, actionId, { invoiceId: 'inv_1002' }, sessionCookie('alice'));

  expect(await pageListsInvoice(request, path, 'inv_1002')).toBe(false);
});

test('fixed: the same request from a non-admin does not delete anything', async ({ request }) => {
  const path = '/fixed/invoices';
  const actionId = await readActionId(request, path);

  await invokeFormAction(request, path, actionId, { invoiceId: 'inv_1002' }, sessionCookie('alice'));
  expect(await pageListsInvoice(request, path, 'inv_1002')).toBe(true);

  await invokeFormAction(request, path, actionId, { invoiceId: 'inv_1002' }, {});
  expect(await pageListsInvoice(request, path, 'inv_1002')).toBe(true);
});

test('fixed: an admin can still delete', async ({ request }) => {
  const path = '/fixed/invoices';
  const actionId = await readActionId(request, path);

  await invokeFormAction(request, path, actionId, { invoiceId: 'inv_1003' }, sessionCookie('admin'));

  expect(await pageListsInvoice(request, path, 'inv_1003')).toBe(false);
});
