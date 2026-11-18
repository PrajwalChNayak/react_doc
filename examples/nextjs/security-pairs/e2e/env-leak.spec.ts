import { expect, test } from '@playwright/test';

import { LEAKED_MARKER, SERVER_ONLY_MARKER } from './markers';
import { downloadPageJavaScript } from './helpers';

// Backs content/nextjs-security/environment-variable-leaks.md.
// `npm run test:leak` runs the same check against every file in .next/static.

test('vulnerable: the NEXT_PUBLIC_ key is readable in the JavaScript the page ships', async ({ request }) => {
  const shipped = await downloadPageJavaScript(request, '/vulnerable/env-leak');

  expect(shipped).toContain(LEAKED_MARKER);
});

test('fixed: the server-only key appears in no HTML or JavaScript sent to the browser', async ({ request }) => {
  const shipped = await downloadPageJavaScript(request, '/fixed/env-leak');

  expect(shipped).toContain('/_next/static/');
  expect(shipped).not.toContain(SERVER_ONLY_MARKER);
});
