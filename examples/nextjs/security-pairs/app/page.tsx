import Link from 'next/link';

export default function Home() {
  return (
    <main>
      <h1>Next.js security pairs</h1>
      <p>
        Each pair has a vulnerable route and a fixed route. The Playwright tests in <code>e2e/</code> prove the
        vulnerable one is exploitable and the fixed one rejects the same request.
      </p>
      <p>
        Sessions are faked with a <code>demo_session</code> cookie whose value is a user ID: <code>admin</code>,{' '}
        <code>alice</code> or <code>bob</code>.
      </p>
      <ul>
        <li>
          Server Action authorization: <Link href="/vulnerable/invoices">vulnerable</Link> ·{' '}
          <Link href="/fixed/invoices">fixed</Link>
        </li>
        <li>
          <code>NEXT_PUBLIC_</code> secret leak: <Link href="/vulnerable/env-leak">vulnerable</Link> ·{' '}
          <Link href="/fixed/env-leak">fixed</Link>
        </li>
        <li>
          IDOR Route Handler: <code>/api/vulnerable/invoices/inv_1002</code> · <code>/api/fixed/invoices/inv_1002</code>
        </li>
        <li>
          Open redirect: <code>/vulnerable/auth/callback?next=https://evil.example</code> ·{' '}
          <code>/fixed/auth/callback?next=https://evil.example</code>
        </li>
      </ul>
    </main>
  );
}
