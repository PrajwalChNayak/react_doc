import Link from 'next/link';

const endpoints = [
  ['GET, POST', '/api/items', 'List and create items (zod-validated query and body)'],
  ['GET, PATCH, DELETE', '/api/items/[id]', 'One item, typed with RouteContext'],
  ['GET, OPTIONS', '/api/public/items', 'CORS with an origin allow-list and explicit preflight'],
  ['GET', '/api/stream', 'Server-Sent Events from a ReadableStream'],
  ['POST', '/api/webhooks/orders', 'HMAC signature check, idempotency, after()'],
  ['POST, DELETE', '/api/session', 'Set or clear the demo session cookie'],
] as const;

export default function HomePage() {
  return (
    <main>
      <h1>Route Handlers and proxy.ts</h1>
      <p>
        The endpoints below are meant to be called with <code>curl</code>. The README lists the
        exact commands.
      </p>
      <table>
        <thead>
          <tr>
            <th align="left">Methods</th>
            <th align="left">Path</th>
            <th align="left">Demonstrates</th>
          </tr>
        </thead>
        <tbody>
          {endpoints.map(([methods, path, description]) => (
            <tr key={path}>
              <td>{methods}</td>
              <td>
                <code>{path}</code>
              </td>
              <td>{description}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p>
        <Link href="/dashboard">/dashboard</Link> is guarded twice: <code>proxy.ts</code> redirects
        when no session cookie is present, and the page verifies the cookie signature itself.
      </p>
    </main>
  );
}
