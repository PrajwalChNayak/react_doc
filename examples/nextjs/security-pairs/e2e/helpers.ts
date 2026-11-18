import type { APIRequestContext } from '@playwright/test';

export function sessionCookie(userId: 'admin' | 'alice' | 'bob'): Record<string, string> {
  return { Cookie: `demo_session=${userId}` };
}

// A <form action={serverAction}> renders a hidden input named
// "$ACTION_ID_<id>" so the form still works before JavaScript loads. The same
// ID is shared by every user of a build. Here the test reads it from the page
// an admin sees, standing in for any way an attacker learns it: a former admin,
// a public JS chunk that imports the action, or an unpatched ID disclosure bug.
export async function readActionId(request: APIRequestContext, path: string): Promise<string> {
  const response = await request.get(path, { headers: sessionCookie('admin') });
  const html = await response.text();
  const match = /name="\$ACTION_ID_([0-9a-f]+)"/.exec(html);
  if (!match) throw new Error(`No Server Action ID found on ${path}`);
  return match[1];
}

// Replays the progressive-enhancement form POST: multipart/form-data with the
// action ID field plus the form's own fields. No browser, no JavaScript.
export async function invokeFormAction(
  request: APIRequestContext,
  path: string,
  actionId: string,
  fields: Record<string, string>,
  headers: Record<string, string>,
) {
  return request.post(path, {
    headers,
    multipart: { [`$ACTION_ID_${actionId}`]: '', ...fields },
    maxRedirects: 0,
  });
}

export async function pageListsInvoice(request: APIRequestContext, path: string, invoiceId: string): Promise<boolean> {
  const response = await request.get(path, { headers: sessionCookie('alice') });
  return (await response.text()).includes(`data-invoice-id="${invoiceId}"`);
}

// Collects every /_next/static JavaScript file a page references and returns
// their combined source, the same files a browser downloads.
export async function downloadPageJavaScript(request: APIRequestContext, path: string): Promise<string> {
  const html = await (await request.get(path)).text();
  const urls = new Set(html.match(/\/_next\/static\/[^"'\s\\]+\.js/g) ?? []);
  const sources = await Promise.all([...urls].map(async (url) => (await request.get(url)).text()));
  return `${html}\n${sources.join('\n')}`;
}
