---
title: Learning path
description: An ordered route through this site, from first component to production React 19.
group: getting-started
order: 50
status: current
shape: reference
related: [getting-started/introduction, getting-started/thinking-in-react, reference/cheat-sheet]
---

Read in this order and each page assumes only what came before it. Skipping ahead
is fine once you know what you are looking for, but the ordering is not arbitrary:
most confusion about hooks traces back to a gap in Stage 1, and most confusion
about performance traces back to a gap in Stage 2.

Five stages, roughly a week each if React is new to you.

## Stage 0 — Orientation

- [Introduction to React](./introduction.md) — what React is, the UI-as-a-function-of-state model, and how reconciliation works. Start here even if you have used React before; the React 19 framing has changed.
- [Installation](./installation.md) — a running dev server on React 19.2.8, with the Hooks linter and DevTools installed. Do not skip the linter.
- [Your first component](./your-first-component.md) — markup, props, state, an event handler, a list. After this you can build a small screen.
- [Thinking in React](./thinking-in-react.md) — the five-step process from a design to a component tree. This is the page you will re-read most often.

## Stage 1 — Foundations

Everything here is mandatory. These nine pages are the vocabulary the rest of the
site uses without explanation.

- [JSX](../core-concepts/jsx.md) — what the markup compiles to, and the rules (one root, `className`, braces for expressions).
- [Components](../core-concepts/components.md) — the unit of composition, and where to draw boundaries.
- [Props](../core-concepts/props.md) — data down, including `children` and prop spreading. After this you can build reusable components.
- [State](../core-concepts/state.md) — what belongs in state, why it is a snapshot per render, and why you never mutate it.
- [Rendering](../core-concepts/rendering.md) — trigger, render, commit. Read this before you form any opinion about React performance.
- [Conditional rendering](../core-concepts/conditional-rendering.md) — `&&`, ternaries, and the falsy-value trap that renders a stray `0`.
- [Lists and keys](../core-concepts/lists-and-keys.md) — why `key` exists and how a bad key corrupts component state.
- [Events](../core-concepts/events.md) — handlers, the synthetic event, and why you pass a function rather than call one.
- [StrictMode](../core-concepts/strict-mode.md) — why development double-invokes your components, and why that is a feature.

Then the two hook pages that everything else builds on:

- [Rules of Hooks](../hooks/rules-of-hooks.md) — top level only, same order every render. Understand the reason, not only the rule.
- [useState](../hooks/use-state.md) — the full API: updater functions, lazy initializers, and state as a per-render snapshot.

## Stage 2 — State and Effects

This is where most people get stuck, and where the biggest wins are. The theme:
**most things are not state, and most synchronization is not an Effect.**

- [useReducer](../hooks/use-reducer.md) — for state whose transitions are worth naming, and where several values change together.
- [useRef](../hooks/use-ref.md) — a value that survives renders without causing one. The escape hatch from the render cycle.
- [Refs and the DOM](../patterns/refs-and-dom.md) — reading and imperatively controlling DOM nodes, with `ref` as an ordinary prop in React 19.
- [useEffect](../hooks/use-effect.md) — synchronizing with systems outside React. Read the "when not to use it" section twice.
- [useEffectEvent](../hooks/use-effect-event.md) — reading the latest props inside an Effect without re-running it. New in 19.2, and it removes most dependency-array pain.
- [useLayoutEffect](../hooks/use-layout-effect.md) — measuring the DOM before the browser paints, and why it is a last resort.
- [useImperativeHandle](../hooks/use-imperative-handle.md) — exposing a narrow imperative API from a component. Rare, and that is correct.
- [useId](../hooks/use-id.md) — stable unique ids for accessible form markup, safe under server rendering.
- [useDebugValue](../hooks/use-debug-value.md) — labeling custom hooks in DevTools.
- [Custom hooks](../hooks/custom-hooks.md) — extracting stateful logic. After this, your components stop growing.

Then how state travels between components:

- [Lifting state up](../state-management/lifting-state-up.md) — the lowest-common-ancestor rule, worked properly.
- [useContext](../hooks/use-context.md) — reading context, and the re-render behavior that surprises people.
- [Context](../state-management/context.md) — when context beats prop drilling and when it becomes a performance problem.
- [Reducers and context](../state-management/reducers-and-context.md) — the pattern that carries most apps to a surprising size without a library.
- [External stores](../state-management/external-stores.md) — Zustand, Redux, or your own, and why they exist.
- [useSyncExternalStore](../hooks/use-sync-external-store.md) — the correct way to subscribe to anything outside React, tear-free under concurrent rendering.
- [Choosing an approach](../state-management/choosing-an-approach.md) — a decision table for local state, context, and stores. Read it before adding a dependency.

And the composition patterns that keep the tree manageable:

- [Composition](../patterns/composition.md) — `children`, slots, and why you rarely need inheritance or a render prop.
- [Controlled inputs](../patterns/controlled-inputs.md) — value down, change up, and when uncontrolled is the better answer.
- [Forms and Actions](../patterns/forms-and-actions.md) — React 19 form Actions, which replace most hand-rolled submit handlers.
- [useActionState](../hooks/use-action-state.md) — pending state, errors, and the returned result of an Action, in one hook.
- [useFormStatus](../hooks/use-form-status.md) — a submit button that knows the parent form is pending, without prop drilling.
- [useOptimistic](../hooks/use-optimistic.md) — showing the expected result before the server confirms it.
- [Error boundaries](../patterns/error-boundaries.md) — the one place a class component is still required, plus the React 19 root error callbacks.
- [Portals](../patterns/portals.md) — rendering into a different DOM node for modals and tooltips, without leaving the React tree.
- [Document metadata](../patterns/document-metadata.md) — `<title>`, `<meta>` and stylesheets rendered from components and hoisted to `<head>`. New in 19.0.

## Stage 3 — Data

You now know enough to fetch things without creating a race condition.

- [Data fetching overview](../data-fetching/overview.md) — the four strategies and how to choose between them.
- [Fetching in Effects](../data-fetching/fetching-in-effects.md) — how to do it correctly (cleanup, ignore flags, race conditions) and why it is the weakest option.
- [use](../hooks/use.md) — reading a promise or context during render, callable conditionally. New in 19.0 and unlike every other hook.
- [use with promises](../data-fetching/use-with-promises.md) — suspending on data, and where the promise must come from.
- [Suspense](../data-fetching/suspense.md) — declarative loading states, boundaries, and what actually triggers one.
- [Caching](../data-fetching/caching.md) — why a promise created during render is a bug, and what caches it correctly.
- [Data libraries](../data-fetching/libraries.md) — TanStack Query, RTK Query, and framework loaders. After this you can pick one on purpose.

## Stage 4 — Performance and Server React

Do not start here. Performance work without Stage 1 produces memoization that
costs more than it saves.

- [Performance overview](../performance/overview.md) — measure first; the common causes of slow React apps, in order of frequency.
- [Profiling](../performance/profiling.md) — the DevTools Profiler and the React 19.2 Performance Tracks in Chrome. Learn to read a flame graph before changing code.
- [React Compiler](../performance/react-compiler.md) — v1.0 memoizes for you. Read this before the memoization page, because it changes the advice.
- [useMemo](../hooks/use-memo.md) — caching an expensive computation, and how rarely one is expensive.
- [useCallback](../hooks/use-callback.md) — a stable function identity, and the only situations where that matters.
- [Memoization](../performance/memoization.md) — `memo`, `useMemo`, `useCallback` together, with the cost of each.
- [useTransition](../hooks/use-transition.md) — marking updates as non-urgent so typing stays responsive.
- [useDeferredValue](../hooks/use-deferred-value.md) — deferring an expensive subtree, with the `initialValue` option added in 19.0.
- [Code splitting](../performance/code-splitting.md) — `lazy` and `Suspense`, and where the split points belong.
- [Activity](../performance/activity.md) — `<Activity />` keeps a hidden subtree's state and DOM alive. New in 19.2, and it replaces several hacks.
- [Lists and virtualization](../performance/lists-and-virtualization.md) — when 10,000 rows need a windowing library.

Then React on the server:

- [Server React overview](../server-react/overview.md) — the map: SSR, streaming, static generation, and Server Components are four different things.
- [Server Components](../server-react/server-components.md) — components that never ship to the browser. Stable in 19.0.
- [Directives](../server-react/directives.md) — what `"use client"` and `"use server"` actually mark, and where the boundary falls.
- [Server Functions](../server-react/server-functions.md) — calling the server from a client component, and how Actions build on this.
- [SSR and hydration](../server-react/ssr-and-hydration.md) — `hydrateRoot`, hydration mismatches, and how to debug one.
- [Streaming](../server-react/streaming.md) — sending HTML progressively, with Suspense boundaries as the flush points.
- [Static generation](../server-react/static-generation.md) — `prerender`, and the partial pre-rendering `postponed` state added in 19.2.

## Stage 5 — Production

- [TypeScript setup](../typescript/setup.md) — `tsconfig`, `@types/react` 19, and the version-matching rule.
- [Typing props](../typescript/typing-props.md) — the props type, discriminated unions, and when to stop being clever.
- [Typing children](../typescript/typing-children.md) — `ReactNode` versus `ReactElement`, and why `children` is no longer implicit in React 19.
- [Typing hooks](../typescript/typing-hooks.md) — `useState` generics, ref types, and typing a reducer.
- [Typing events](../typescript/typing-events.md) — the event types you actually need and where to find the rest.
- [Generic components](../typescript/generic-components.md) — a typed `<List>` that infers its item type.
- [Semantics](../accessibility/semantics.md) — the right element beats any ARIA attribute. The cheapest accessibility win there is.
- [Focus management](../accessibility/focus-management.md) — moving focus on route changes and in dialogs, with refs.
- [Announcements](../accessibility/announcements.md) — live regions for content that changes without a page load.
- [Forms accessibility](../accessibility/forms-accessibility.md) — labels, error association, and validation messaging.
- [Testing setup](../testing/setup.md) — Vitest or Jest with the jsdom environment, configured for React 19.
- [Testing Library](../testing/testing-library.md) — queries in priority order, and testing behavior rather than implementation.
- [act and async](../testing/act-and-async.md) — `act` now imports from `react`, plus how to wait for async updates without flakiness.
- [User events](../testing/user-events.md) — simulating real interaction rather than firing synthetic events.
- [Routing](../ecosystem/routing.md) — React Router and Next.js App Router, and how each handles data loading.
- [Styling](../ecosystem/styling.md) — CSS modules, utility CSS, and CSS-in-JS under Server Components.
- [Forms](../ecosystem/forms.md) — React Hook Form and friends, and when React 19 Actions make them unnecessary.
- [Data libraries](../ecosystem/data-libraries.md) — choosing a client cache and how it interacts with Suspense.
- [Build tooling](../ecosystem/build-tooling.md) — Vite configuration, environment variables, and bundle analysis.
- [Redux](../ecosystem/redux.md) — Redux Toolkit and RTK Query, with an honest account of when to use them.
- [Troubleshooting](../reference/troubleshooting.md) — the errors you will hit, and what each one actually means.

## Stage 6 — Maintaining older code

Read these when you meet a codebase older than you.

- [React 18 to 19](../migration/react-18-to-19.md) — the upgrade, in order, with the codemods.
- [Removed APIs](../migration/removed-apis.md) — what React 19 deleted and the replacement for each.
- [Deprecated APIs](../migration/deprecated-apis.md) — what still works but should not appear in new code.
- [Legacy codebases](../migration/legacy-codebases.md) — class components, older patterns, and incremental modernization.
- [Legacy archive](../migration/legacy-archive.md) — the previous version of this documentation, kept for reference.

## Reference

Not reading material. Bookmark them.

- [Hooks reference](../reference/hooks-reference.md) — every hook, its signature, and one line on when to reach for it.
- [Built-in components](../reference/built-in-components.md) — `<Suspense>`, `<StrictMode>`, `<Profiler>`, `<Activity>`, `<Fragment>`.
- [Cheat sheet](../reference/cheat-sheet.md) — the syntax you will forget, on one page.

## Common mistakes

Mistakes about *learning* React, rather than about writing it.

- **Learning class components first.** They still work, and error boundaries still
  require one, but every current API, example, and hiring conversation assumes
  function components. Start with hooks and meet classes in
  [Legacy codebases](../migration/legacy-codebases.md).
- **Reaching for Redux on day two.** Most apps never need a global store. Work
  through [Lifting state up](../state-management/lifting-state-up.md) and
  [Reducers and context](../state-management/reducers-and-context.md) first, then
  read [Choosing an approach](../state-management/choosing-an-approach.md) and
  decide with evidence.
- **Skipping the Rules of Hooks** because the code appears to work. It works until
  a conditional early return changes the hook order. Install
  `eslint-plugin-react-hooks` and read
  [Rules of Hooks](../hooks/rules-of-hooks.md) properly.
- **Treating `useEffect` as the way to do anything after a render.** Most Effects
  in a beginner codebase should be derived values, event handlers, or nothing at
  all. [useEffect](../hooks/use-effect.md) says when not to use it.
- **Memoizing before profiling.** Wrapping every value in `useMemo` adds cost and
  hides the real problem. Read [Performance overview](../performance/overview.md)
  and let the [React Compiler](../performance/react-compiler.md) do most of it.
- **Following React 18 tutorials without checking.** A large fraction of published
  React material predates 19.0 and teaches removed API.
  [Removed APIs](../migration/removed-apis.md) is the filter.
- **Turning off StrictMode** to silence a double-render warning, rather than
  fixing the impure render it found. See
  [StrictMode](../core-concepts/strict-mode.md).
- **Learning Server Components before client React.** They are a deployment and
  data-flow model layered on top of everything in Stages 1 to 3. Out of order,
  they are incomprehensible.

## Related topics

- [Introduction to React](./introduction.md) — the mental model this path builds on.
- [Thinking in React](./thinking-in-react.md) — the process to apply on every feature.
- [Cheat sheet](../reference/cheat-sheet.md) — the quick-reference companion to this path.
- [Troubleshooting](../reference/troubleshooting.md) — when something breaks mid-lesson.
- [React 18 to 19](../migration/react-18-to-19.md) — if you are arriving with existing React knowledge.
