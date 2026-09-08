---
title: Legacy archive
description: Every page of the previous documentation, preserved under a banner, mapped to what replaced it.
group: migration
order: 50
status: legacy
related: [migration/react-18-to-19, migration/removed-apis, migration/deprecated-apis, migration/legacy-codebases]
shape: reference
---

This site replaces an earlier hand-built React documentation site. That site was
written before React 19 and teaches APIs that no longer exist.

Nothing was deleted. Every page of it is preserved byte-for-byte under
`legacy/pages/`, with one addition: a banner injected at the top of each page
saying it is archived, and linking to the page that replaced it.

> [!LEGACY]
> Everything linked from this page is **pre-React-19 material**. Several pages
> teach APIs removed in 19.0 — `ReactDOM.render`, `propTypes`, `defaultProps`,
> `<Context.Provider>`. Read them to understand code you have inherited, never
> to decide how to write something new.

## The archive policy

Three rules, applied to every file:

1. **Nothing is deleted.** Old documentation is the only surviving explanation
   of why some code in your repository looks the way it does. Deleting it makes
   that code unreadable.
2. **Nothing is edited.** The pages are unchanged apart from the banner. If a
   page was wrong, the banner says so and the replacement page fixes it — the
   archived text keeps saying what it always said.
3. **Every page has a named replacement.** No archived page is a dead end. The
   banner links forward, and so does the table below.

The banner is self-contained inline HTML because these pages loaded Tailwind
from a CDN. When that CDN eventually stops serving the version they ask for, the
pages will lose their styling and the banner will still be legible.

## Every archived page

Links go to the archived file. "Replaced by" links to the current page.

| Archived | Replaced by | What was wrong with it |
|---|---|---|
| [home.html](../../legacy/pages/home.html) | [Introduction](../getting-started/introduction.md) | The old landing page. 3 KB of link tiles pointing at pages that have all moved; no technical content to preserve. |
| [getting-started.html](../../legacy/pages/getting-started.html) | [Introduction](../getting-started/introduction.md) | React history, a Virtual DOM explanation, an ES6 primer, and a framework comparison. The ES6 primer does not belong in React documentation, and the comparison is out of date. |
| [components.html](../../legacy/pages/components.html) | [Components](../core-concepts/components.md) | The largest page in the archive at 145 KB. Taught `ReactDOM.render`, `propTypes` and `defaultProps` — all three removed in React 19 — and mixed class and function components without saying which to use. |
| [state-event-handling.html](../../legacy/pages/state-event-handling.html) | [State](../core-concepts/state.md) | State, events and batching. Presents React 18 automatic batching as a new feature to opt into, which is no longer the framing anyone needs. |
| [hooks.html](../../legacy/pages/hooks.html) | [Rules of Hooks](../hooks/rules-of-hooks.md) | Every core hook crammed into one page. Uses `<Context.Provider>`, contains a class-component comparison, and predates every hook added in 19.0 and 19.2. |
| [context.html](../../legacy/pages/context.html) | [Context](../state-management/context.md) | Uses `<Context.Provider>` throughout, deprecated in 19.0. No mention of `use()`, and no guidance on when context is the wrong tool. |
| [state-management.html](../../legacy/pages/state-management.html) | [Choosing an approach](../state-management/choosing-an-approach.md) | An overview with two headings in 44 KB. Lists the options without ever making a recommendation, which is the only useful thing such a page can do. |
| [forms.html](../../legacy/pages/forms.html) | [Forms and actions](../patterns/forms-and-actions.md) | Controlled inputs, then heavy Formik and Yup coverage. Predates Actions entirely: no `useActionState`, `useFormStatus` or `useOptimistic`, which is most of what React 19 changed about forms. |
| [api-integration.html](../../legacy/pages/api-integration.html) | [Data fetching](../data-fetching/overview.md) | `fetch` and axios inside `useEffect`, with hand-rolled loading and error state and a polling section. Teaches the pattern React now steers you away from; no Suspense, no `use()`, no library guidance. |
| [routing.html](../../legacy/pages/routing.html) | [Routing](../ecosystem/routing.md) | React Router v6, including a v5-to-v6 migration table. The migration table is now two majors out of date and the framework landscape it assumes has changed. |
| [performance.html](../../legacy/pages/performance.html) | [Performance overview](../performance/overview.md) | `memo`, `useMemo`, `useCallback`, code splitting, virtualization and Web Vitals. Sound for its time, but it predates the React Compiler, which inverts the advice: most of the manual memoization it teaches is now the compiler's job. |
| [best-practices.html](../../legacy/pages/best-practices.html) | [Composition](../patterns/composition.md) | Component design, code organization and error handling. Uses `<Context.Provider>` in six examples, and the "best practice" framing hides which items are load-bearing and which are taste. |
| [styling.html](../../legacy/pages/styling.html) | [Styling](../ecosystem/styling.md) | A **0-byte empty file**. It was created as a placeholder and never written. Rebuilt in place as a minimal page that says exactly that, so the link does not 404. |
| [redux.html](../../legacy/pages/redux.html) | [Redux](../ecosystem/redux.md) | The Redux hub page — a shell that loads the five fragments below through a client-side loader script. Little content of its own. |
| [redux/redux-fundamentals.html](../../legacy/pages/redux/redux-fundamentals.html) | [Redux](../ecosystem/redux.md) | Hand-written action types, action creators, reducers and `createStore`. Accurate, and describes the boilerplate that Redux Toolkit exists to delete — teaching it first is the wrong order now. |
| [redux/redux-toolkit.html](../../legacy/pages/redux/redux-toolkit.html) | [Redux](../ecosystem/redux.md) | `createSlice` and `configureStore`. The strongest page of the Redux set and still broadly correct; superseded rather than wrong. |
| [redux/rtk-query.html](../../legacy/pages/redux/rtk-query.html) | [Data-fetching libraries](../data-fetching/libraries.md) | The largest and highest-quality page in the whole archive, at 88 KB. Its only React 19 problem is a class error boundary example, which is still valid — error boundaries are still classes. |
| [redux/redux-persist.html](../../legacy/pages/redux/redux-persist.html) | [Redux](../ecosystem/redux.md) | `redux-persist` setup and rehydration. Narrow enough that it does not warrant a page of its own in the new site. |
| [redux/best-practices.html](../../legacy/pages/redux/best-practices.html) | [Redux](../ecosystem/redux.md) | Sixteen one-line bullets across four headings and not a single code example. The thinnest page in the archive. |
| [performance-guide-summary.md](../../legacy/pages/performance-guide-summary.md) | [Performance overview](../performance/overview.md) | Not documentation at all — a build report, with checkmarked "Completed Sections" and a "Next Steps" list, describing the work of writing `performance.html`. Kept for provenance, marked with an archived note at the top. |

## Where the archive lives

```text
legacy/
  pages/
    home.html
    getting-started.html
    components.html
    state-event-handling.html
    hooks.html
    context.html
    state-management.html
    forms.html
    api-integration.html
    routing.html
    performance.html
    best-practices.html
    styling.html
    performance-guide-summary.md
    redux.html
    redux/
      redux-fundamentals.html
      redux-toolkit.html
      rtk-query.html
      redux-persist.html
      best-practices.html
  assets/
    js/       navigation.js, components-loader.js, redux-loader.js
    templates/ header.html, footer.html
```

`legacy/` sits beside `docs/` at the repository root, so the banners link across
with `../../docs/...` from a page and `../../../docs/...` from a `redux/`
fragment.

The `assets/` directory is part of the archive too. The old site had no build
step: `components-loader.js` fetched the shared header and footer into every
page at runtime, and `redux-loader.js` fetched the five Redux fragments into
`redux.html`. That is why those five files have no `<html>` or `<body>` of their
own, and why opening one directly shows a section rather than a page.

## What the banner says

Every archived HTML page opens with the same block:

```text
ARCHIVED — pre-React-19 documentation
This page is kept for reference only and contains APIs that were removed or
deprecated in React 19. Current replacement: <page>. See the archive index.
```

The five `redux/` files are HTML fragments rather than whole documents — the old
site loaded them into `redux.html` with a script — so their banner sits at the
top of the fragment instead of after a `<body>` tag. Opened directly, they still
show it.

## What was worth keeping

Archiving is not the same as dismissing. Several things in these pages were
better than what usually gets written, and have been carried forward rather than
rewritten from scratch:

- **The RTK Query page's request lifecycle walkthrough**, which is more concrete
  than most library documentation on the subject.
- **The Router v5-to-v6 migration table**, as a model: a two-column before/after
  table is the right shape for a migration page, and
  [Removed APIs](./removed-apis.md) uses it.
- **The api-integration polling and cancellation examples**, which correctly
  aborted in-flight requests — a detail most tutorials skip.
- **The performance page's Web Vitals section**, still the right set of numbers
  to watch.

What did not survive was the structure. The old site had one enormous page per
topic — 145 KB for components — with no way to link to a specific idea. One
concept per file, which this site enforces, is the main structural difference.

## What the old site never covered

Nineteen pages, and these subjects appear nowhere in them. The gap is as
informative as the content — it is roughly the list of things React
documentation had to grow between 2023 and now:

| Missing from the archive | Where it is now |
|---|---|
| TypeScript with React, at all | [TypeScript](../typescript/setup.md) |
| Accessibility | [Semantics](../accessibility/semantics.md) |
| Testing | [Testing setup](../testing/setup.md) |
| Server Components, SSR, streaming | [Server React](../server-react/overview.md) |
| Suspense as a data-loading mechanism | [Suspense](../data-fetching/suspense.md) |
| The React Compiler | [React Compiler](../performance/react-compiler.md) |
| Actions, `useActionState`, `useOptimistic` | [Forms and actions](../patterns/forms-and-actions.md) |
| Error boundaries as a first-class topic | [Error boundaries](../patterns/error-boundaries.md) |
| StrictMode and what it is for | [StrictMode](../core-concepts/strict-mode.md) |
| Migration guidance of any kind | this group |

Styling had a file and no content. Redux had five pages. That ratio is the
clearest single statement of what the old site was for.

## Reading an archived page safely

If you are looking at one of these to understand inherited code, keep four
substitutions in mind:

| If the archived page shows | React 19 wants |
|---|---|
| `ReactDOM.render(<App />, container)` | `createRoot(container).render(<App />)` |
| `Component.propTypes = {...}` | TypeScript, or validation at the data boundary |
| `Component.defaultProps = {...}` on a function | default parameters |
| `<Context.Provider value={v}>` | `<Context value={v}>` |

[Removed APIs](./removed-apis.md) has the full list with a before and after for
each.

## Common mistakes

**Copying code out of an archived page into a React 19 app.** Roughly half of
these pages contain at least one removed API. The banner is at the top of every
one of them for this reason.

**Assuming an archived page is wrong.** Most of them were correct when written.
`redux-toolkit.html` and `rtk-query.html` are still substantially accurate.
Archived means superseded, not false.

**Deleting the archive during a cleanup.** These pages are the record of why
existing code looks the way it does. They cost a few hundred kilobytes.

**Editing an archived page to fix it.** Then it is neither an accurate record
nor current documentation. Fix the replacement page; the archive stays frozen.

**Searching only the new site.** If you cannot find how something used to be
done, the archive is where it is. Search `legacy/pages/` before concluding it
was never documented.

**Trusting the framework and library versions in these pages.** Router, Formik,
Yup, axios and redux-persist have all moved on. Check the current documentation
for anything outside React itself.

## Related topics

- [Removed APIs](./removed-apis.md) — what to substitute for every removed API
  you meet in an archived page.
- [Deprecated APIs](./deprecated-apis.md) — the deprecated forms these pages
  use, especially the older provider syntax.
- [React 18 to 19](./react-18-to-19.md) — the upgrade runbook, if the archived
  pages describe the app you are about to upgrade.
- [Legacy codebases](./legacy-codebases.md) — strategy for an app built from
  this documentation.
- [Learning path](../getting-started/learning-path.md) — the ordered route
  through the current site, which is where to go instead.
