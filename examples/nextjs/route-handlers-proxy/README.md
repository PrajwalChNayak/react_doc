# Route Handlers and proxy.ts

A small Next.js 16.3.5 backend: Route Handlers with zod validation, a dynamic
handler typed with `RouteContext`, a CORS endpoint with an explicit preflight, a
Server-Sent Events stream, a signed webhook receiver that uses `after()`, and a
`proxy.ts` that tags requests and performs an optimistic session check. All data
is in memory.

## What it demonstrates

| File | What to look at |
|---|---|
| `app/api/items/route.ts` | `GET` with a zod-validated query string, `POST` with a zod-validated JSON body, `201` + `Location` |
| `app/api/items/[id]/route.ts` | `GET` / `PATCH` / `DELETE` typed with the generated global `RouteContext<'/api/items/[id]'>`, awaiting `params` |
| `app/api/public/items/route.ts` | CORS with an origin allow-list from `ALLOWED_ORIGINS`, `Vary: Origin`, and an explicit `OPTIONS` preflight |
| `app/api/stream/route.ts` | A pull-based `ReadableStream` sent as `text/event-stream`, with anti-buffering headers |
| `app/api/webhooks/orders/route.ts` | `request.text()` before parsing, HMAC-SHA256 verification with `timingSafeEqual`, idempotency by event id, `after()` for slow work |
| `app/api/session/route.ts` | Setting and deleting an `httpOnly` signed session cookie with `NextResponse` |
| `proxy.ts` | A matcher, a request id forwarded upstream with `NextResponse.next({ request: { headers } })`, and a redirect when `/dashboard` has no session cookie |
| `app/dashboard/page.tsx` | The page re-verifies the cookie signature, because proxy only checked that a cookie exists |
| `lib/env.ts` | Server environment variables validated with zod on first use, behind `server-only` |

Cache Components is **not** enabled in `next.config.ts`. Every `GET` handler here
reads the request, so each would still run per request with
`cacheComponents: true`.

## Doc pages it backs

- [Route Handlers](../../../content/nextjs-backend/route-handlers.md)
- [Proxy](../../../content/nextjs-backend/proxy.md)
- [Environment variables](../../../content/nextjs-backend/environment-variables.md)
- [Webhooks](../../../content/nextjs-backend/webhooks.md)
- [Streaming responses](../../../content/nextjs-backend/streaming-responses.md)
- [Background work](../../../content/nextjs-backend/background-work.md)

## Run it from a fresh clone

Requires Node.js 20.9.0 or later. All example apps share one npm workspace.

```bash
cd examples/nextjs
npm install
cp route-handlers-proxy/.env.example route-handlers-proxy/.env.local
npm run dev --workspace @nextjs-examples/route-handlers-proxy
```

Production build and server:

```bash
npm run build --workspace @nextjs-examples/route-handlers-proxy
npm run start --workspace @nextjs-examples/route-handlers-proxy
```

Type-check without building (generates the route types first):

```bash
npm run typecheck --workspace @nextjs-examples/route-handlers-proxy
```

There are no automated tests in this app. The `curl` commands below are the test
plan.

## Environment variables and external services

No database and no external services. Copy `.env.example` to `.env.local`
(ignored by git). The handlers that need a secret fail with a `500` and a server
log naming the missing variable if you skip this step.

| Variable | Used by |
|---|---|
| `WEBHOOK_SECRET` | `POST /api/webhooks/orders` signature check |
| `SESSION_SECRET` | Signing and verifying the demo session cookie |
| `ALLOWED_ORIGINS` | CORS allow-list for `/api/public/items` |

## Exercise every handler with curl

Run these from a Bash-compatible shell (macOS, Linux, Git Bash or WSL) while
`npm run dev` is running. The expected status is in each comment.

### Items: list, create, validate

```bash
# 200, two seeded items, plus the requestId that proxy.ts forwarded
curl -i "http://localhost:3000/api/items?limit=10"

# 400, limit must be between 1 and 100
curl -i "http://localhost:3000/api/items?limit=0"

# 201, with a Location header
curl -i -X POST http://localhost:3000/api/items \
  -H "Content-Type: application/json" \
  -d '{"name":"Desk lamp","quantity":3}'

# 422, quantity must be an integer
curl -i -X POST http://localhost:3000/api/items \
  -H "Content-Type: application/json" \
  -d '{"name":"Desk lamp","quantity":"three"}'

# 400, body is not JSON
curl -i -X POST http://localhost:3000/api/items \
  -H "Content-Type: application/json" \
  -d 'not json'
```

### One item: dynamic segment with RouteContext

```bash
# 200
curl -i http://localhost:3000/api/items/itm_1

# 200, quantity updated
curl -i -X PATCH http://localhost:3000/api/items/itm_1 \
  -H "Content-Type: application/json" \
  -d '{"quantity":7}'

# 422, an empty patch is rejected
curl -i -X PATCH http://localhost:3000/api/items/itm_1 \
  -H "Content-Type: application/json" \
  -d '{}'

# 204, then 404 on the second attempt
curl -i -X DELETE http://localhost:3000/api/items/itm_2
curl -i -X DELETE http://localhost:3000/api/items/itm_2

# 405, PUT is not exported from the route file
curl -i -X PUT http://localhost:3000/api/items/itm_1
```

### CORS: allow-list and preflight

```bash
# 204 with Access-Control-Allow-Origin: http://localhost:5173
curl -i -X OPTIONS http://localhost:3000/api/public/items \
  -H "Origin: http://localhost:5173" \
  -H "Access-Control-Request-Method: GET"

# 204 with no Access-Control-Allow-Origin header: the browser will block it
curl -i -X OPTIONS http://localhost:3000/api/public/items \
  -H "Origin: https://evil.example" \
  -H "Access-Control-Request-Method: GET"

# 200 with Access-Control-Allow-Origin and Vary: Origin
curl -i http://localhost:3000/api/public/items -H "Origin: http://localhost:5173"
```

### Streaming: Server-Sent Events

```bash
# One "tick" event every 500 ms, then "done". -N turns off curl's buffering.
curl -N "http://localhost:3000/api/stream?count=5"
```

### Webhook: signature, idempotency, after()

```bash
BODY='{"id":"evt_1001","type":"order.paid","data":{"orderId":"ord_42"}}'
SIG=$(node -e 'const c=require("node:crypto");process.stdout.write(c.createHmac("sha256",process.argv[1]).update(process.argv[2]).digest("hex"))' dev-webhook-secret-change-me "$BODY")

# 202 immediately. About 2 seconds later the dev server logs "[webhook] processed order.paid".
curl -i -X POST http://localhost:3000/api/webhooks/orders \
  -H "Content-Type: application/json" \
  -H "x-signature: sha256=$SIG" \
  --data-binary "$BODY"

# 200 with "duplicate": true, and no second log line
curl -i -X POST http://localhost:3000/api/webhooks/orders \
  -H "Content-Type: application/json" \
  -H "x-signature: sha256=$SIG" \
  --data-binary "$BODY"

# 401, the body changed after signing
curl -i -X POST http://localhost:3000/api/webhooks/orders \
  -H "Content-Type: application/json" \
  -H "x-signature: sha256=$SIG" \
  --data-binary '{"id":"evt_1001","type":"order.refunded","data":{"orderId":"ord_42"}}'

# 401, no signature header
curl -i -X POST http://localhost:3000/api/webhooks/orders \
  -H "Content-Type: application/json" \
  --data-binary "$BODY"
```

If you changed `WEBHOOK_SECRET` in `.env.local`, use your value in the `node -e`
command.

### proxy.ts: request id and the optimistic /dashboard check

```bash
# Every response carries an x-request-id header set by proxy.ts
curl -si http://localhost:3000/ | grep -i x-request-id

# 307 to /login?returnTo=%2Fdashboard: no session cookie, redirected by proxy.ts
curl -i http://localhost:3000/dashboard

# A forged cookie gets past proxy.ts (it only checks presence)...
# ...and the page's own check redirects to /login?...&reason=invalid-session
curl -i -b "session=ada.forged" http://localhost:3000/dashboard

# 200 with a signed cookie
curl -i -c cookies.txt -X POST http://localhost:3000/api/session \
  -H "Content-Type: application/json" \
  -d '{"userId":"ada"}'
curl -i -b cookies.txt http://localhost:3000/dashboard

# 204, clears the cookie
curl -i -b cookies.txt -c cookies.txt -X DELETE http://localhost:3000/api/session
rm cookies.txt
```

The forged-cookie request is the point of the app: `proxy.ts` is a fast,
optimistic filter, and the page, Route Handler or Server Action that reads
private data must verify the session itself.

## Files you will see after running it

`next dev` writes to `.next/dev`, `next build` writes to `.next`, and both
generate `next-env.d.ts`. All three are ignored by the repository root
`.gitignore`, as is `.env.local`.
