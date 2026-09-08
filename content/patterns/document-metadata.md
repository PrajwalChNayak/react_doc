---
title: Document metadata
description: Rendering title, meta, link and script anywhere in the tree and letting React hoist them into head.
group: patterns
order: 70
status: current
since: "19.0"
related: [patterns/composition, server-react/ssr-and-hydration, performance/overview, ecosystem/routing]
---

## Overview

Since **19.0**, React hoists `<title>`, `<meta>` and `<link>` into the document
`<head>` no matter where in the tree you render them.

```jsx
export function ArticlePage({ article }) {
  return (
    <article>
      <title>{`${article.title} — Field Notes`}</title>
      <meta name="description" content={article.summary} />
      <link rel="canonical" href={article.canonicalUrl} />

      <h1>{article.title}</h1>
      <p>{article.body}</p>
    </article>
  );
}
```

The tags land in `<head>`; nothing appears inside the `<article>`. The component
that knows the title finally gets to declare it, in the same render as the
markup it belongs to.

The same release added special handling for two more head-bound elements:
stylesheets with a `precedence` prop, and `async` scripts deduplicated by `src`.
And a set of resource hint functions — `preload`, `preinit`, `preconnect`,
`prefetchDNS` — for telling the browser about resources before you render them.

## Why it exists

`<head>` is a single global slot, but the information that belongs in it is
owned by components deep in the tree. Every React app resolved that tension the
same way: a portal-and-side-effect library, usually `react-helmet`, with its own
component set, its own ordering rules, and a `HelmetProvider` at the root.

React 19 makes the platform elements work where you already are. For most
applications that removes the dependency entirely, and with it a class of bugs
where the head and the page disagreed after a navigation.

Stylesheets and scripts got the same treatment for a different reason: a
component that needs a stylesheet should be able to say so, and React should be
able to guarantee the stylesheet is loaded before the component's content is
revealed.

> [!NOTE]
> This replaces `react-helmet` for most apps. It does **not** replace a
> framework's metadata API — see
> [when not to use it](#when-not-to-use-it) below.

## When to use it

- A page or route component that knows its own title and description.
- A dialog or view that should change the tab title while it is open.
- A canonical URL, Open Graph tags, or a feed `<link>` that depends on data you
  just fetched.
- A component that owns a stylesheet and should not render until it loads.
- A widget that needs a third-party script exactly once, however many times the
  widget appears.

## When not to use it

**Use your framework's metadata API when you have one.** Next.js `metadata`
exports, React Router's `meta`, and equivalents run during routing, before or
independently of rendering the page component. They give you:

- Metadata in the **initial HTML** for every route, which matters for crawlers
  and link unfurlers that do not execute JavaScript or wait for a stream to
  finish.
- Merging and overriding rules across nested layouts, so a child can replace a
  parent's `og:image` rather than adding a second one.
- Static generation of the tags at build time.

React's hoisting has no merge semantics. Two components rendering `<title>` both
produce a `<title>`, and the result is undefined.

**Do not use it for per-element microdata.** A `<meta itemProp>` inside a
section is about that section, not the document, and React deliberately leaves
it in place.

**Do not use it as a general "render this into head" escape hatch.** Only the
elements listed on this page get special treatment.

## Basic example

You can watch the hoisting happen — the tag is nowhere in the rendered output,
yet `document.title` changes:

```jsx live
import { useEffect, useState } from 'react';

function ProjectView({ name }) {
  return (
    <section>
      <title>{`${name} — Console`}</title>
      <meta name="description" content={`Settings for ${name}`} />
      <h3 style={{ marginTop: 0 }}>{name}</h3>
    </section>
  );
}

export default function TitleDemo() {
  const [name, setName] = useState('Payments API');
  const [documentTitle, setDocumentTitle] = useState('');

  useEffect(() => {
    setDocumentTitle(document.title);
  }, [name]);

  return (
    <div style={{ display: 'grid', gap: 8, maxWidth: 380 }}>
      <ProjectView name={name} />
      <button
        type="button"
        onClick={() => setName((current) =>
          current === 'Payments API' ? 'Billing Worker' : 'Payments API',
        )}
      >
        Switch project
      </button>
      <p style={{ margin: 0, fontFamily: 'monospace', fontSize: 12 }}>
        document.title = {documentTitle}
      </p>
    </div>
  );
}
```

Note the template literal inside `<title>`. That is not stylistic — see
[common mistakes](#common-mistakes).

## How it works

React recognizes these elements during render and commits them into `<head>`
instead of their position in the tree. On the server they are written into the
head of the streamed HTML; on the client they are inserted into the live
document.

Hoisting is not universal. Each element has an opt-out, and knowing them saves
an hour of confusion:

| Element | Hoisted when | **Not** hoisted when |
|---|---|---|
| `<title>` | Always | It has `itemProp`, or it is inside `<svg>` (where it is an accessibility label) |
| `<meta>` | Always | It has `itemProp` — then it is metadata about that part of the page |
| `<link>` | Always | It has `itemProp`, or `onLoad` / `onError` |
| `<link rel="stylesheet">` | It has a `precedence` prop | No `precedence`, or `onLoad` / `onError` / `disabled` is set |
| `<style>` | It has both `href` and `precedence` | Either is missing |
| `<script>` | It has `src` and `async={true}` | It is inline, not `async`, or has `onLoad` / `onError` |

Two caveats apply to every element React takes over:

- **Prop changes after the first render are ignored**, with a development
  warning. React will not rewrite a `<link href>` you change later.
- **React may leave the element in the DOM after the component unmounts.** For a
  stylesheet or an already-executed script this is harmless and intentional.

### Stylesheets and `precedence`

`precedence` is what opts a stylesheet into React's management. It does two
jobs: it establishes ordering, and it groups stylesheets that should be treated
as peers.

```jsx
export function PriceTable() {
  return (
    <>
      <link rel="stylesheet" href="/css/reset.css" precedence="reset" />
      <link rel="stylesheet" href="/css/tables.css" precedence="component" />
      <table>{/* … */}</table>
    </>
  );
}
```

The values are arbitrary strings — React does not define a fixed set. It infers
rank from discovery order: a precedence it sees first is lower than one it sees
later, so later-discovered stylesheets win the cascade. Many design systems get
by with a single precedence value, because within one value the ordering does
not matter.

Two rules follow:

- **Deduplication is by `href`.** Ten components rendering the same stylesheet
  produce one `<link>`.
- **The component suspends while the stylesheet loads.** That is the real
  payoff: content that depends on those rules is not revealed unstyled. Put a
  [Suspense](../data-fetching/suspense.md) boundary above it and you get a
  proper loading state instead of a flash.

Inline `<style>` works the same way when you give it both `href` (used only as
the deduplication key) and `precedence`:

```jsx
export function PieChart({ colors, stylesheet }) {
  return (
    <>
      <style href={`PieChart-${colors.join('-')}`} precedence="medium">
        {stylesheet}
      </style>
      <svg>{/* … */}</svg>
    </>
  );
}
```

### Async scripts

An `async` script with a `src` is hoisted and deduplicated by `src` across the
whole app, in every rendering environment. Render it from the component that
needs it and stop threading a "has the analytics script loaded" flag through
your tree.

```jsx
export function MapEmbed({ coordinates }) {
  return (
    <div>
      <script async={true} src="https://tiles.example.com/embed.js" />
      <div data-coordinates={coordinates} />
    </div>
  );
}
```

`async` is required, because React needs to know it is safe to move the script.
Inline scripts are never hoisted or deduplicated.

### Resource hints

Four functions, all imported from `react-dom`, tell the browser about a
resource before React renders anything that uses it. They are safe to call
during render, in an event handler, or in an effect.

```jsx
import { preconnect, prefetchDNS, preinit, preload } from 'react-dom';

export function CheckoutButton({ onOpen }) {
  function warmUp() {
    // Open a connection to a host you are about to use.
    preconnect('https://payments.example.com');
    // Cheaper than preconnect when you have many candidate hosts.
    prefetchDNS('https://analytics.example.com');
    // Download, but do not execute or apply.
    preload('/fonts/inter-var.woff2', { as: 'font', type: 'font/woff2', crossOrigin: 'anonymous' });
    // Download and run / insert immediately.
    preinit('/js/checkout.js', { as: 'script' });
  }

  return (
    <button type="button" onPointerEnter={warmUp} onClick={onOpen}>
      Checkout
    </button>
  );
}
```

| Function | Signature | Effect |
|---|---|---|
| `prefetchDNS` | `prefetchDNS(href)` | Resolve a host's DNS. Cheapest hint; good when speculating across many hosts |
| `preconnect` | `preconnect(href)` | Open a connection to a host. Takes no options |
| `preload` | `preload(href, options)` | Download a resource. `options.as` is required — `style`, `script`, `font`, `image`, `fetch` and others; `crossOrigin` is required for `as: 'fetch'` |
| `preinit` | `preinit(href, options)` | Download **and** apply. `as` is `'script'` or `'style'`; a style also needs `precedence` |

`preload` accepts `crossOrigin`, `integrity`, `type`, `nonce`, `fetchPriority`,
`referrerPolicy`, and `imageSrcSet` / `imageSizes` for responsive images.
`preinit` accepts `precedence`, `crossOrigin`, `integrity`, `nonce` and
`fetchPriority`. For ESM modules use `preloadModule(href, { as: 'script' })` and
`preinitModule(href, { as: 'script' })`.

The distinction that matters: **`preload` fetches, `preinit` fetches and
applies.** A preloaded script sits in the cache; a preinited script executes.

### Server rendering and streaming

During SSR, tags rendered in the shell are written into the `<head>` of the
initial HTML response — which is what crawlers and link previews read.

Metadata rendered inside a Suspense boundary that resolves later arrives later
in the stream, and React inserts it into the head when it does. Browsers handle
this correctly. Consumers that only read the first bytes of the response may
not.

> [!BEST-PRACTICE]
> Render title and description metadata **above** your Suspense boundaries, from
> data you already have, so it is in the initial HTML. Save the hoisting-from-
> anywhere convenience for metadata that genuinely depends on streamed data — or
> use your framework's metadata API, which resolves this at the routing layer.

Hydration has a related consequence: React does not remove head tags it did not
create, so server-rendered `<meta>` tags written by hand into your HTML template
coexist with hoisted ones. If both set `description`, you get two.

## Advanced example

A route component that owns its metadata, its stylesheet, and its script — and
suspends until the stylesheet is ready.

```jsx static="Depends on real stylesheet and script URLs; the sandbox cannot load them."
import { Suspense } from 'react';
import { preconnect } from 'react-dom';

function ReportChrome({ report }) {
  return (
    <>
      <title>{`${report.name} — Reports`}</title>
      <meta name="description" content={report.summary} />
      <meta property="og:title" content={report.name} />
      <link rel="canonical" href={`https://app.example.com/reports/${report.id}`} />
      <link rel="stylesheet" href="/css/report-charts.css" precedence="component" />
      <script async={true} src="https://charts.example.com/renderer.js" />
    </>
  );
}

export function ReportPage({ report }) {
  preconnect('https://charts.example.com');

  return (
    <main>
      <Suspense fallback={<p>Preparing the report…</p>}>
        <ReportChrome report={report} />
        <ReportBody report={report} />
      </Suspense>
    </main>
  );
}

function ReportBody({ report }) {
  return <h1>{report.name}</h1>;
}
```

`ReportChrome` suspends while `report-charts.css` loads, so the Suspense
fallback covers the gap and the body never renders unstyled. The `preconnect`
runs during render and opens the connection before the script tag is committed.

## Common mistakes

**Interpolating into `<title>` children.** `<title>Results {page}</title>`
creates a two-element array and errors. Interpolate into a single string
instead:

```jsx
export function ResultsTitle({ page }) {
  return <title>{`Results — page ${page}`}</title>;
}
```

**Rendering two `<title>` tags.** React places both in the head and browser and
search engine behavior is undefined. Render one, from one place — usually the
route component.

**Expecting metadata to be removed on unmount.** React may leave hoisted
elements in the DOM. Do not rely on unmounting to clear a title; render the new
one.

**Changing props on a hoisted element.** They are read once. React warns in
development and ignores the change.

**A stylesheet with no `precedence`.** Without it React treats the `<link>` as
an ordinary element: no hoisting, no deduplication, no suspending. This is the
single most common reason "React 19 stylesheet support doesn't work".

**Adding `onLoad` to a stylesheet or script.** That opts out of all special
handling, on purpose — you have said you want to manage it yourself.

**Forgetting `async` on a `<script src>`.** Without it, the script is not moved
or deduplicated.

**Using `preload` where you meant `preinit`.** A preloaded script never runs.

**Rendering metadata only inside a slow Suspense boundary.** It works for users
and disappoints crawlers.

**Keeping `react-helmet` alongside this.** Two systems writing the same head
produce duplicates. Migrate a whole app at once, and delete the provider.

## Related topics

- [SSR and hydration](../server-react/ssr-and-hydration.md) — when hoisted tags
  reach the initial HTML.
- [Suspense](../data-fetching/suspense.md) — the boundary that covers a
  stylesheet load.
- [Routing](../ecosystem/routing.md) — router-level metadata APIs and why they
  still win for SEO.
- [Performance overview](../performance/overview.md) — where resource hints fit
  among loading strategies.
- [Composition](./composition.md) — the same instinct: let the component that
  knows something declare it.
