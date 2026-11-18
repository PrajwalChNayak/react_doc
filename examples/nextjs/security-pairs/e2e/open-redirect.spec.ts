import { expect, test } from '@playwright/test';

// Backs content/nextjs-security/open-redirects.md

function callback(prefix: 'vulnerable' | 'fixed', next: string): string {
  return `/${prefix}/auth/callback?next=${encodeURIComponent(next)}`;
}

test('vulnerable: next=https://evil.example sends the user off-site', async ({ request }) => {
  const response = await request.get(callback('vulnerable', 'https://evil.example/login'), { maxRedirects: 0 });

  expect(response.status()).toBe(307);
  expect(response.headers()['location']).toBe('https://evil.example/login');
});

const attacks = [
  'https://evil.example/login',
  '//evil.example/login',
  '/\\evil.example/login',
  '/.//evil.example/login',
  `/${String.fromCharCode(9)}/evil.example/login`,
  'javascript:alert(document.cookie)',
  'evil.example',
];

for (const next of attacks) {
  test(`fixed: rejects ${JSON.stringify(next)}`, async ({ request, baseURL }) => {
    const response = await request.get(callback('fixed', next), { maxRedirects: 0 });

    expect(response.status()).toBe(307);
    const target = new URL(response.headers()['location'], baseURL);
    expect(target.origin).toBe(new URL(baseURL!).origin);
    expect(target.pathname).toBe('/dashboard');
  });
}

test('fixed: keeps a legitimate relative path with its query string', async ({ request, baseURL }) => {
  const response = await request.get(callback('fixed', '/invoices?page=2'), { maxRedirects: 0 });

  expect(response.status()).toBe(307);
  const target = new URL(response.headers()['location'], baseURL);
  expect(target.origin).toBe(new URL(baseURL!).origin);
  expect(`${target.pathname}${target.search}`).toBe('/invoices?page=2');
});
