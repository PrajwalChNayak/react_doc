export default async function LoginPage({ searchParams }: PageProps<'/login'>) {
  const { returnTo, reason } = await searchParams;

  return (
    <main>
      <h1>Sign in</h1>
      {reason === 'invalid-session' && <p role="alert">Your session cookie was not valid.</p>}
      <p>
        This demo has no login form. Get a signed session cookie from the API, then retry{' '}
        <code>{typeof returnTo === 'string' ? returnTo : '/dashboard'}</code>:
      </p>
      <pre>
        {`curl -i -c cookies.txt -X POST http://localhost:3000/api/session \\
  -H "Content-Type: application/json" -d '{"userId":"ada"}'
curl -i -b cookies.txt http://localhost:3000/dashboard`}
      </pre>
    </main>
  );
}
