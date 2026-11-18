---
title: SQL injection
description: Parameterize with Prisma tagged templates and Drizzle sql, allow-list dynamic identifiers like ORDER BY columns, and never concatenate user input into a query.
group: nextjs-security
order: 60
status: current
related: [nextjs-databases/prisma, nextjs-databases/drizzle, nextjs-security/input-validation, nextjs-backend/route-handlers]
---

## Overview

SQL injection happens when user input is treated as SQL rather than as data.
Both ORMs this site documents give you a safe default and an unsafe escape
hatch, and the unsafe one is a normal-looking method away:

- **Prisma:** `$queryRaw` (a tagged template) parameterizes; `$queryRawUnsafe`
  takes a string you built.
- **Drizzle:** the `` sql`...` `` tag parameterizes; `sql.raw(...)` does not.

The safe forms send your values to the database *separately* from the query
text, so the database never parses them as SQL. This page shows both a Route
Handler and a Server Action, the classic exploit strings, the fix, and the one
case parameters cannot cover: dynamic identifiers such as an `ORDER BY` column.

## The threat

Any value that reaches a query is untrusted: query parameters, route params,
`FormData`, JSON bodies, headers, cookies. An attacker who can steer the query
text can read other tables, bypass a `WHERE` clause, or destroy data.

TypeScript does not help here. A parameter typed `string` is still an arbitrary
string at runtime, and a value pulled from `searchParams` is `string`
regardless of what it contains.

## Exploit

### Prisma: `$queryRawUnsafe` with interpolation

```ts file="app/api/products/route.ts" vulnerable
import type { NextRequest } from 'next/server';
import { prisma } from '@/lib/db/prisma';

export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams.get('q') ?? '';

  // The value is concatenated straight into the SQL string.
  const products = await prisma.$queryRawUnsafe(
    `SELECT id, name, price FROM products WHERE name LIKE '%${q}%'`,
  );

  return Response.json(products);
}
```

```bash
# Return every row regardless of the search term:
curl "https://app.example.com/api/products?q=%25'%20OR%20'1'%3D'1"
# name LIKE '%%' OR '1'='1%'  -> always true

# Read another table with UNION:
curl "https://app.example.com/api/products?q=%25'%20UNION%20SELECT%20id,email,password_hash%20FROM%20users--%20"
```

The first payload is `%' OR '1'='1`; the second is
`%' UNION SELECT id, email, password_hash FROM users-- `.

### Drizzle: `sql.raw` in a Server Action

```ts file="app/reviews/actions.ts" vulnerable
'use server';

import { sql } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';

export async function searchReviews(formData: FormData): Promise<unknown> {
  const term = String(formData.get('term') ?? '');

  // sql.raw does no escaping and no parameterization.
  return db.execute(sql.raw(`SELECT id, body FROM reviews WHERE body LIKE '%${term}%'`));
}
```

`term = '; DROP TABLE reviews; --` ends the statement and runs a second one on
drivers that allow multiple statements.

## Fix

### Prisma: tagged template, or `Prisma.sql`

`$queryRaw` as a tagged template turns each `${...}` into a bound parameter.
Note the backtick call — `$queryRaw(...)` with parentheses is the unsafe path.

```ts file="app/api/products/route.ts"
import type { NextRequest } from 'next/server';
import { Prisma } from '@/lib/generated/prisma/client';
import { prisma } from '@/lib/db/prisma';

export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams.get('q') ?? '';

  // ${q} becomes a bound parameter. The database receives the query text and
  // the value separately, so the value is never parsed as SQL.
  const products = await prisma.$queryRaw`
    SELECT id, name, price FROM products
    WHERE name LIKE ${'%' + q + '%'}
  `;

  return Response.json(products);
}
```

`Prisma.sql` composes fragments while keeping every value bound, and
`Prisma.join` parameterizes a list:

```ts file="app/api/products/search.ts"
import { Prisma } from '@/lib/generated/prisma/client';
import { prisma } from '@/lib/db/prisma';

export async function searchProducts(term: string, categoryIds: number[]) {
  const filters = [Prisma.sql`name LIKE ${'%' + term + '%'}`];
  if (categoryIds.length > 0) {
    filters.push(Prisma.sql`category_id IN (${Prisma.join(categoryIds)})`);
  }
  return prisma.$queryRaw`
    SELECT id, name, price FROM products
    WHERE ${Prisma.join(filters, ' AND ')}
  `;
}
```

For most reads you do not need raw SQL at all: `prisma.product.findMany({ where: { name: { contains: q } } })` is parameterized by construction. Reach for
raw SQL only when the query builder cannot express the query.

### Drizzle: the `` sql`...` `` tag

```ts file="app/reviews/actions.ts"
'use server';

import { sql } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';

export async function searchReviews(formData: FormData): Promise<unknown> {
  const term = String(formData.get('term') ?? '');

  // ${term} is mapped to a $1 placeholder; the value is sent separately.
  return db.execute(sql`SELECT id, body FROM reviews WHERE body LIKE ${'%' + term + '%'}`);
}
```

Better still, use the query builder, whose `eq`, `like` and friends parameterize:

```ts file="app/reviews/search.ts"
import { like } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { reviews } from '@/lib/db/schema';

export async function searchReviews(term: string) {
  return db.select().from(reviews).where(like(reviews.body, `%${term}%`));
}
```

Why parameterizing works: the driver sends the SQL text with placeholders
(`$1`, `$2`) and the values in a separate list. The database plans the query
from the text alone, then binds the values, so a value like `' OR '1'='1` is
compared as a literal string and matches nothing.

### Dynamic identifiers: allow-list, do not interpolate

Parameters bind *values*. They cannot stand in for a column or table name, so a
sort column from the query string cannot be a placeholder. Never interpolate it.
Map the user's choice to a known-safe column instead:

```ts file="app/api/products/list.ts"
import type { NextRequest } from 'next/server';
import { asc, desc } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { products } from '@/lib/db/schema';

// The only columns a client may sort by. The value is a real column reference,
// never a string spliced into SQL.
const SORTABLE = {
  name: products.name,
  price: products.price,
  created: products.createdAt,
} as const;

export async function listProducts(request: NextRequest) {
  const sortParam = request.nextUrl.searchParams.get('sort') ?? 'name';
  const column = SORTABLE[sortParam as keyof typeof SORTABLE] ?? products.name;
  const direction = request.nextUrl.searchParams.get('dir') === 'desc' ? desc : asc;

  return db.select().from(products).orderBy(direction(column));
}
```

Unknown `sort` values fall back to a default; they are never sent to the
database. In Prisma, do the same with an object literal:
`const orderBy = ({ name: { name: 'asc' }, price: { price: 'asc' } })[sortParam] ?? { name: 'asc' }`.

If you must build an identifier dynamically (an admin tool over arbitrary
tables), Drizzle offers `sql.identifier(value)`, which quote-escapes an
identifier for the dialect. Its own types carry a blunt warning: it "does not
offer any protection against SQL injections, so you must validate any user input
beforehand." Validate against an allow-list first; treat `sql.identifier` as the
escaping step after the value is already known-good, not as the check.

## Verify the fix

Send the exploit strings and assert the query treated them as data:

```bash
# The OR-based bypass now matches the literal string and returns no rows:
curl -s "https://app.example.com/api/products?q=%25'%20OR%20'1'%3D'1" | jq 'length'
# 0

# An out-of-range sort column is ignored, not executed:
curl -s -o /dev/null -w '%{http_code}\n' "https://app.example.com/api/products/list?sort=price);DROP%20TABLE%20products;--"
# 200, sorted by the default column; the table still exists
```

A test with a payload that would delete data if injected is the strongest
regression check:

```ts file="e2e/sql-injection.spec.ts"
import { expect, test } from '@playwright/test';

test('a UNION payload returns no rows and leaks no columns', async ({ request }) => {
  const attack = "%' UNION SELECT id, email, password_hash FROM users-- ";
  const response = await request.get(`/api/products?q=${encodeURIComponent(attack)}`);

  expect(response.ok()).toBe(true);
  const rows = (await response.json()) as unknown[];
  expect(rows).toHaveLength(0);
});
```

A type-level check helps too: `$queryRawUnsafe` and `sql.raw` are easy to grep
for in review, and a lint rule that bans them outside a reviewed allow-list
module makes the unsafe path opt-in.

## Common patterns

- **Prefer the query builder.** `findMany`, `select().where(eq(...))` and
  friends parameterize everything. Raw SQL is for what they cannot express.
- **Validate shape and range first.** Parse `sort`, `page` and `limit` with a
  schema (see [Input validation](./input-validation.md)) so only expected values
  reach the query at all.
- **Keep raw SQL in the data layer.** A single `server-only` module with the raw
  queries is easy to audit; scattered `$queryRawUnsafe` calls are not.

## Common mistakes

**Calling `$queryRaw` with parentheses and a template literal.**
`` prisma.$queryRaw(`... ${q} ...`) `` builds the string *before* Prisma sees it,
so it is as unsafe as `$queryRawUnsafe`. Use the backtick tag form, or
`Prisma.sql`.

**Reaching for `sql.raw` to insert a value.** `sql.raw` is for static SQL
fragments, not user input. Use `` sql`...` `` with `${value}`.

**Interpolating an `ORDER BY` column or table name.** Parameters cannot bind
identifiers. Allow-list them.

**Sanitizing by escaping quotes yourself.** Hand-rolled escaping misses cases
(numeric contexts, comment sequences, encodings). Let the driver parameterize.

**Trusting a numeric type.** `Number(searchParams.get('id'))` can be `NaN` or
`Infinity`; a value used in raw SQL should still be validated and bound.

## Related topics

- [Prisma](../nextjs-databases/prisma.md) — `$queryRaw`, `Prisma.sql` and the
  generated client.
- [Drizzle](../nextjs-databases/drizzle.md) — the query builder and the
  `` sql`...` `` tag.
- [Input validation](./input-validation.md) — parse `sort`, `page` and `limit`
  before they reach a query.
- [Route Handlers](../nextjs-backend/route-handlers.md) — reading query params
  and returning JSON.
- [Server Functions](../server-react/server-functions.md) — why action
  arguments are untrusted input.
