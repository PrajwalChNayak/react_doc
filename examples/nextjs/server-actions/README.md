# Server Actions example

A small todo list for Next.js 16.3.5 that shows how Server Actions behave in a
real App Router app: validated input, a session checked inside every action,
per-record authorization, errors returned as state, and an optimistic add that
rolls back when the server says no.

It uses an in-memory store and a fake signed-cookie session, so it needs **no
database, no auth provider and no environment variables**. Data and sessions
reset when the server restarts.

## What it demonstrates

| File | What to look at |
|---|---|
| `app/actions.ts` | A `"use server"` module. `addTodo` authenticates, validates with Zod 4 (`z.flattenError`), writes, then calls `refresh()`. `deleteTodo` also checks that the caller owns the todo or is an admin. `signIn` / `signOut` set and delete an `httpOnly` cookie. |
| `app/page.tsx` | An async Server Component that reads the session and the list. The sign-in form passes a Server Action straight to `<form action>`. |
| `app/todos.tsx` | A Client Component with `useActionState` for validation errors and `useOptimistic` for the pending todo. |
| `app/delete-todo-button.tsx` | `useActionState(deleteTodo.bind(null, todoId), …)`: a bound Server Action that still works without JavaScript. |
| `app/error.tsx` | The boundary for unexpected errors, with `retry()`. Expected errors never reach it. |
| `lib/session.ts`, `lib/todos.ts` | Data modules marked `import 'server-only'`. |
| `next.config.ts` | `experimental.serverActions.bodySizeLimit` lowered to `100kb`. |

> The session is a demo. The cookie is signed with a random per-process secret
> so it cannot be forged by editing it, but there are no passwords. Use a real
> session library in an application.

## Doc pages it backs

- [Server Actions](../../../content/nextjs-mutations/server-actions.md)
- [Forms](../../../content/nextjs-mutations/forms.md)
- [Revalidating after mutations](../../../content/nextjs-mutations/revalidating-after-mutations.md)
- [Optimistic updates](../../../content/nextjs-mutations/optimistic-updates.md)
- [Error handling in Server Actions](../../../content/nextjs-mutations/error-handling.md)
- [Progressive enhancement](../../../content/nextjs-mutations/progressive-enhancement.md)

## Run it from a fresh clone

Requires Node.js 20.9.0 or later. All example apps share one npm workspace.

```bash
cd examples/nextjs
npm install
npm run dev --workspace @nextjs-examples/server-actions
```

Open http://localhost:3000.

Production build:

```bash
cd examples/nextjs
npm run build --workspace @nextjs-examples/server-actions
npm run start --workspace @nextjs-examples/server-actions
```

Type-check only:

```bash
cd examples/nextjs
npm run typecheck --workspace @nextjs-examples/server-actions
```

## Things to try

### Validation errors

1. Sign in as **Ada**.
2. Submit the empty form. `Write something first.` appears under the input. No
   optimistic todo is shown, because the client skips it for input that cannot
   pass validation.
3. Type more than 120 characters and submit. The Zod message appears and the
   input keeps your text, because the action returns it in `state.text`.

### Optimistic add and rollback

1. Signed in as Ada, add `Buy milk`. The todo appears at once, faded, with
   "(saving…)". About a second later it is replaced by the saved todo from the
   server.
2. Add `Buy milk` again. The faded todo appears, then disappears when the action
   returns `You already have a todo with that text.` That is the rollback:
   `useOptimistic` drops the overlay when the action finishes, and the real list
   does not contain the todo.

### Authentication and authorization

1. Sign out and submit a todo. The server answers `Sign in to add todos.` The
   form is rendered for signed-out visitors on purpose: hiding it would not
   protect the endpoint.
2. Sign in as **Grace** and delete Ada's todo. The server answers `Only the owner
   or an admin can delete this todo.`
3. Sign in as **Admin** and delete it. It succeeds.

Watch the `next dev` terminal while you do this. Next.js logs each Server
Function call with its name, arguments and duration.

### Without JavaScript

Disable JavaScript in your browser's DevTools and reload.

- **Sign in, sign out and Delete still work.** They pass Server Actions straight
  to `action`, so React renders real HTML forms that post to the server. The
  delete error message still appears, because `useActionState` carries the
  returned state through the full-page response.
- **Add does not work**, and a `<noscript>` note says so. Its action is a client
  function that calls `useOptimistic` before calling the Server Action, and a
  client function cannot run without JavaScript. The
  [progressive enhancement page](../../../content/nextjs-mutations/progressive-enhancement.md)
  shows the trade-off and an alternative.

### Call an action directly, without the UI

A Server Action is a public POST endpoint. To see that the checks inside it are
what protect it:

1. Sign in as Grace, open DevTools > Network, and click **Delete** on Ada's
   todo.
2. Right-click the `POST /` request and choose **Copy as cURL (bash)**. The
   request carries a `Next-Action` header, the encrypted action ID.
3. Paste the command into a terminal and **remove the cookie**: delete the
   `-b '…'` argument, or the `cookie:` header line, whichever your browser
   produced.
4. Run it. The response body is an RSC payload that contains
   `Sign in to delete todos.`, and the todo is still there.

Put the cookie back and change nothing else, and the response contains `Only the
owner or an admin can delete this todo.` instead. Action IDs change between
builds, so copy a fresh request after restarting `next dev` or rebuilding.
