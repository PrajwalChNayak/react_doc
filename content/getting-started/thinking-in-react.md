---
title: Thinking in React
description: The five steps from a design and some data to a working React component tree.
group: getting-started
order: 40
status: current
related: [getting-started/your-first-component, state-management/lifting-state-up, core-concepts/rendering]
---

## Overview

React changes how you build a UI, not only how you write it. Given a mockup and a
JSON payload, there is a repeatable process that gets you to a component tree
without guesswork:

1. Break the UI into a component hierarchy.
2. Build a static version in React.
3. Find the minimal but complete representation of UI state.
4. Identify where each piece of state should live.
5. Add inverse data flow.

This page runs one example all the way through: a filterable product table for a
coffee equipment store.

## Why it exists

The hard parts of a React app are not syntax. They are *what counts as state* and
*who owns it*. Get those wrong and you end up with values that disagree with each
other, Effects synchronizing state into other state, and bugs that appear only on
the third interaction. The five steps force both decisions to the surface early,
while they are still cheap to change.

## Basic example

The design: a search box, an "only show products in stock" checkbox, and a table
of products grouped by category, with out-of-stock names in red.

The data your API returns:

```json
[
  { "category": "Grinders", "price": 149, "stocked": true,  "name": "Encore ESP" },
  { "category": "Grinders", "price": 89,  "stocked": true,  "name": "Timemore C3" },
  { "category": "Grinders", "price": 299, "stocked": false, "name": "Ode Gen 2" },
  { "category": "Brewers",  "price": 32,  "stocked": true,  "name": "Hario V60" },
  { "category": "Brewers",  "price": 349, "stocked": false, "name": "Moccamaster" }
]
```

Note that `category` is a field on each product, not a nested structure. The
grouping in the design is a rendering concern, and spotting that before you start
saves you from reshaping the data.

## How it works

### Step 1 — Break the UI into a component hierarchy

Draw boxes around every piece of the mockup and name them, using the principle you
would apply to functions: a component should do one thing, and if it grows past
that, split it. A useful tie-breaker is the shape of the data — if your JSON is
modeled well, its structure usually maps onto your component structure, because
both describe the same domain.

```text
FilterableProductTable
├── SearchBar                 (text input + checkbox)
└── ProductTable
    ├── ProductCategoryRow     (a category heading row)
    └── ProductRow             (one product)
```

Five components arranged by containment: what appears inside what in the mockup
becomes what renders what in the tree.

### Step 2 — Build a static version

Build the whole thing with **no state at all**. Pass data in as props and render
it. Do not add an event handler, an input value, or a `useState` call yet.

Static and interactive pull in opposite directions: static is a lot of typing and
no thinking, interactive is a lot of thinking and little typing. Doing both at
once means doing the hard part while distracted by the boring part.

```jsx
function ProductCategoryRow({ category }) {
  return <tr><th colSpan={2}>{category}</th></tr>;
}

function ProductRow({ product }) {
  return (
    <tr>
      <td style={{ color: product.stocked ? 'inherit' : 'crimson' }}>
        {product.name}
      </td>
      <td>${product.price.toFixed(2)}</td>
    </tr>
  );
}

function ProductTable({ products }) {
  const rows = [];
  let lastCategory = null;

  for (const product of products) {
    if (product.category !== lastCategory) {
      rows.push(
        <ProductCategoryRow category={product.category} key={product.category} />,
      );
      lastCategory = product.category;
    }
    rows.push(<ProductRow product={product} key={product.name} />);
  }

  return <table><tbody>{rows}</tbody></table>;
}

function SearchBar() {
  return (
    <form>
      <input type="text" placeholder="Search products..." />
      <label>
        <input type="checkbox" /> Only show products in stock
      </label>
    </form>
  );
}

export default function FilterableProductTable({ products }) {
  return (
    <div>
      <SearchBar />
      <ProductTable products={products} />
    </div>
  );
}
```

Data flows strictly downward. `FilterableProductTable` receives `products` and
hands them to `ProductTable`, which hands one product to each `ProductRow`.
Nothing flows back up yet.

### Step 3 — Find the minimal complete representation of UI state

List every value the UI works with, then ask three questions about each:

- **Does it stay the same over time?** Then it is not state.
- **Is it passed in from a parent via props?** Then it is not state.
- **Can you compute it from existing state or props?** Then it is **definitely
  not** state.

Applied to this UI:

| Candidate | State? | Why |
|---|---|---|
| The list of products | No | Passed in as a prop. |
| The search text | **Yes** | Changes over time, comes from nowhere else. |
| The "in stock only" checkbox | **Yes** | Same. |
| The filtered list of products | No | Computed from products + search text + checkbox. |
| The list of categories | No | Derived from the products. |

Two pieces of state — minimal because nothing can be removed, complete because
everything on screen can be produced from these two plus the props.

> [!BEST-PRACTICE]
> **Derive, do not mirror.** It is tempting to keep `filteredProducts` in state
> and update it whenever the search text changes, usually with an Effect. Do not.
> Two sources of truth can disagree, and one of them will, on the code path you
> did not think about. Compute the filtered list during render instead.

### Step 4 — Identify where the state should live

For each piece of state, find the components that read it or write it, then find
their **lowest common ancestor** — the nearest component above all of them. Put
the state there, or higher if a component above the LCA has a better claim.

Walk it for `searchText`. `ProductTable` reads it to filter rows; `SearchBar`
reads it for the input's value and writes it on every keystroke; their nearest
common ancestor is `FilterableProductTable`. The same reasoning puts
`inStockOnly` in the same place, so the parent declares both and passes them
down:

```jsx
import { useState } from 'react';

function SearchBar({ filterText, inStockOnly }) {
  return (
    <form>
      <input type="text" value={filterText} />
      <label>
        <input type="checkbox" checked={inStockOnly} /> In stock only
      </label>
    </form>
  );
}

function ProductTable({ products, filterText, inStockOnly }) {
  const visible = products.filter(
    (product) =>
      (!inStockOnly || product.stocked) &&
      product.name.toLowerCase().includes(filterText.toLowerCase()),
  );

  return <ul>{visible.map((p) => <li key={p.name}>{p.name}</li>)}</ul>;
}

export default function FilterableProductTable({ products }) {
  const [filterText, setFilterText] = useState('');
  const [inStockOnly, setInStockOnly] = useState(false);

  return (
    <div>
      <SearchBar filterText={filterText} inStockOnly={inStockOnly} />
      <ProductTable
        products={products}
        filterText={filterText}
        inStockOnly={inStockOnly}
      />
    </div>
  );
}
```

Type in the box now and nothing happens: React warns that you supplied `value`
without `onChange`. That is the next step.

### Step 5 — Add inverse data flow

`SearchBar` needs to change state that lives in `FilterableProductTable`. Props
only travel downward, so the parent passes **functions** down and the child calls
them. Two changes to `SearchBar`:

```diff
- function SearchBar({ filterText, inStockOnly }) {
+ function SearchBar({ filterText, inStockOnly, onFilterTextChange, onInStockOnlyChange }) {
-   <input type="text" value={filterText} />
+   <input
+     type="text"
+     value={filterText}
+     onChange={(event) => onFilterTextChange(event.target.value)}
+   />
```

and the parent hands down `onFilterTextChange={setFilterText}` and
`onInStockOnlyChange={setInStockOnly}`. The complete version is in
[Advanced example](#advanced-example) below.

The child does not know or care that those props are state setters — it reports an
event, and the owner of the state decides what it means. Swap in a setter that
also logs to analytics and the child is unchanged. This is the shape of every
controlled input in React: value down, change up. See
[Controlled inputs](../patterns/controlled-inputs.md).

## Common patterns

**State or derived?** Default to derived. Convert to state only when the value has
to survive something — a user's edit that a recomputation would overwrite, or a
value that arrives asynchronously. An Effect whose only job is to set state from
other state means you made this call wrong.

**Where does it live?** The lowest common ancestor should be your default, with
two amendments. If pushing state down makes a component reusable, push it down.
And if the LCA sits many levels above the consumers, so that you are threading
props through components that never read them, that is when
[Context](../state-management/context.md) or an
[external store](../state-management/external-stores.md) earns its cost — not
before.

**When does a reducer beat `useState`?** When several values change together in
response to the same events, or when the update logic has branches worth naming.
Two independent values, as here, do not need one. See
[useReducer](../hooks/use-reducer.md).

## Advanced example

The finished version, self-contained and running:

```jsx live
import { Fragment, useState } from 'react';

const PRODUCTS = [
  { category: 'Grinders', price: 149, stocked: true, name: 'Encore ESP' },
  { category: 'Grinders', price: 89, stocked: true, name: 'Timemore C3' },
  { category: 'Grinders', price: 299, stocked: false, name: 'Ode Gen 2' },
  { category: 'Brewers', price: 32, stocked: true, name: 'Hario V60' },
  { category: 'Brewers', price: 349, stocked: false, name: 'Moccamaster' },
];

function SearchBar({ filterText, inStockOnly, onFilterTextChange, onInStockOnlyChange }) {
  return (
    <form style={{ marginBottom: 12 }}>
      <input
        type="text"
        value={filterText}
        placeholder="Search products..."
        onChange={(e) => onFilterTextChange(e.target.value)}
      />
      <label style={{ display: 'block', marginTop: 8 }}>
        <input
          type="checkbox"
          checked={inStockOnly}
          onChange={(event) => onInStockOnlyChange(event.target.checked)}
        />{' '}
        Only show products in stock
      </label>
    </form>
  );
}

function ProductRow({ product }) {
  const color = product.stocked ? 'inherit' : 'crimson';
  return (
    <tr>
      <td style={{ color }}>{product.name}</td>
      <td style={{ textAlign: 'right' }}>${product.price.toFixed(2)}</td>
    </tr>
  );
}

function ProductTable({ products, filterText, inStockOnly }) {
  const query = filterText.trim().toLowerCase();

  const visible = products.filter(
    (product) =>
      (!inStockOnly || product.stocked) &&
      product.name.toLowerCase().includes(query),
  );

  const categories = [...new Set(visible.map((product) => product.category))];

  if (visible.length === 0) return <p>No products match that search.</p>;

  return (
    <table style={{ width: 320 }}>
      <tbody>
        {categories.map((category) => (
          <Fragment key={category}>
            <tr>
              <th colSpan={2} style={{ textAlign: 'left', paddingTop: 10 }}>
                {category}
              </th>
            </tr>
            {visible
              .filter((product) => product.category === category)
              .map((product) => (
                <ProductRow product={product} key={product.name} />
              ))}
          </Fragment>
        ))}
      </tbody>
    </table>
  );
}

export default function FilterableProductTable() {
  const [filterText, setFilterText] = useState('');
  const [inStockOnly, setInStockOnly] = useState(false);

  return (
    <div style={{ fontFamily: 'system-ui' }}>
      <SearchBar
        filterText={filterText}
        inStockOnly={inStockOnly}
        onFilterTextChange={setFilterText}
        onInStockOnlyChange={setInStockOnly}
      />
      <ProductTable products={PRODUCTS} filterText={filterText} inStockOnly={inStockOnly} />
    </div>
  );
}
```

Everything on screen comes from two pieces of state — a string and a boolean —
plus a constant array. `visible` and `categories` are recomputed on every render
and cannot go stale. No Effects appear anywhere, because nothing here is
synchronizing with a system outside React.

## Common mistakes

- **Skipping the static version.** Wiring state while still deciding what the
  markup is produces components that are hard to name and harder to split.
- **Putting derived values in state.** A filtered list, a total, a "has results"
  flag, a formatted price — compute them during render.
- **Using an Effect to keep state in sync with props.** If a value changes when a
  prop changes, it is derived. Effects synchronize with systems outside React,
  not with React itself.
- **Hoisting all state to the top component.** State that one subtree reads
  belongs in that subtree; a single top-level state object re-renders everything.
- **Reaching for Context or a store before props hurt.** Two levels of prop
  drilling is not a problem. Six is.
- **Using the array index as a `key`** in a list that filters or reorders.
- **Controlled inputs without `onChange`** produce a field that will not accept
  typing.

## Related topics

- [Your first component](./your-first-component.md) — the mechanics this page assumes.
- [Lifting state up](../state-management/lifting-state-up.md) — the LCA rule in detail.
- [Controlled inputs](../patterns/controlled-inputs.md) — value down, change up.
- [State](../core-concepts/state.md) — what state is and how it behaves across renders.
- [Choosing an approach](../state-management/choosing-an-approach.md) — local state, context, or a store.
