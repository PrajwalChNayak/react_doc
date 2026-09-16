# Auth example: sessions, a Data Access Layer and roles

A Next.js 16.3.5 App Router app that signs users in with a Server Action, keeps
the session in a jose-signed cookie, and authorizes every protected read in a
`server-only` Data Access Layer (DAL). `proxy.ts` only redirects browsers
early. The app is built so you can prove that with `curl`.

## What it demonstrates

- **Login and logout Server Actions** (`app/actions/auth.ts`) that validate
  input with Zod 4, set the session cookie with `await cookies()`, and
  `redirect()` outside any `try/catch`.
- **A stateless session** (`lib/session.ts`): an HS256 JWT signed with
  `SignJWT` and verified with `jwtVerify` from `jose` 6. The cookie is
  `httpOnly`, `sameSite: 'lax'`, `secure` in production, and expires after seven
  days. The payload holds only the user ID and a session version.
- **The DAL** (`lib/dal.ts`): `import 'server-only'`, `verifySession()` wrapped
  in React `cache()`, a role-to-permission map, and DTOs that never return the
  password hash or internal notes. The role is looked up on every request, not
  read from the cookie, and bumping `sessionVersion` in the store revokes old
  cookies.
- **An optimistic `proxy.ts`** that redirects `/dashboard` and `/admin` to
  `/login` when no `session` cookie is present. It does not verify the cookie
  and does not match `/api`.
- **`/dashboard`**, which re-verifies the session in the DAL, and **`/admin`**,
  which calls the same DAL function as the API and uses `forbidden()` for
  signed-in non-admins.
- **`GET /api/admin/users`**, a Route Handler that returns `401` or `403` from
  the DAL with no help from `proxy.ts`.

> `forbidden()` and `app/forbidden.tsx` are **Experimental** in Next.js 16.3.
> They need `experimental.authInterrupts: true`, which `next.config.ts` sets.

## Doc pages it backs

- [Authentication overview](../../../content/nextjs-auth/overview.md)
- [Sessions](../../../content/nextjs-auth/sessions.md)
- [Auth libraries](../../../content/nextjs-auth/auth-libraries.md)
- [Data Access Layer](../../../content/nextjs-auth/data-access-layer.md)
- [Protecting routes](../../../content/nextjs-auth/protecting-routes.md)
- [Role-based access](../../../content/nextjs-auth/role-based-access.md)

## Run it from a fresh clone

Requires Node.js 20.9.0 or later. All example apps share one npm workspace.

```bash
cd examples/nextjs
npm install
cp auth/.env.example auth/.env.local
```

Edit `auth/.env.local` and replace `SESSION_SECRET` with a random value of at
least 32 characters, for example the output of `openssl rand -base64 32`. The
app throws on the first session read or write if the secret is missing or
short.

```bash
npm run dev --workspace @nextjs-examples/auth
```

Open http://localhost:3000.

Production build and server:

```bash
npm run build --workspace @nextjs-examples/auth
npm run start --workspace @nextjs-examples/auth
```

Type-check without building:

```bash
npm run typecheck --workspace @nextjs-examples/auth
```

There are no automated tests in this app. The `curl` session below is the check.

## Demo users

Users live in memory in `lib/users.ts`, with scrypt-hashed passwords. They reset
when the server restarts.

| Email | Password | Role |
|---|---|---|
| `ada@example.com` | `admin-demo-password` | `admin` |
| `grace@example.com` | `member-demo-password` | `member` |

## Prove that proxy.ts is not the security boundary

Run these against `npm run dev` (or `npm run start`) on port 3000.

**1. A browser without a cookie is redirected by `proxy.ts`.**

```bash
curl -i http://localhost:3000/dashboard
```

Expect a `307` whose `location` header points at `/login`. This is the optimistic check.

**2. The API is not covered by `proxy.ts`, and the DAL still rejects the call.**

```bash
curl -i http://localhost:3000/api/admin/users
```

Expect `401` and `{"error":"Not signed in."}`. No redirect happened, because
the matcher does not include `/api`. The Route Handler refused on its own.

**3. A forged cookie gets past `proxy.ts`, and not past the DAL.**

```bash
curl -i -H "Cookie: session=forged" http://localhost:3000/api/admin/users
curl -i -H "Cookie: session=forged" http://localhost:3000/dashboard
```

The first returns `401`. The second passes `proxy.ts` (a cookie is present),
then `requireSession()` fails to verify the signature and redirects to
`/login`.

**4. A real member session is authenticated but not authorized.**

Sign in as Grace in the browser, copy the `session` cookie value from the
developer tools, then:

```bash
curl -i -H "Cookie: session=PASTE_GRACE_COOKIE" http://localhost:3000/api/admin/users
```

Expect `403` and `{"error":"Admins only."}`. With Ada's cookie the same request
returns `200` and a user list with no password hashes in it. Visiting
`/admin` as Grace renders `app/forbidden.tsx` with a `403` status.

## Environment variables and external services

| Variable | Required | Purpose |
|---|---|---|
| `SESSION_SECRET` | yes | HMAC key for signing session tokens. At least 32 characters. |

Commit only `.env.example`. `.env` and `.env.local` are ignored by the
repository root `.gitignore`. No database or network service is needed.

## Files you will see after running it

`next dev` writes to `.next/dev`, `next build` writes to `.next`, and both
generate `next-env.d.ts`. All are ignored by the repository root `.gitignore`.
