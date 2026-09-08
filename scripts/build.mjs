#!/usr/bin/env node
// Static site generator for the React 19 documentation.
//
//   node scripts/build.mjs
//
// Reads Markdown from `content/`, writes HTML into `docs/` so that GitHub Pages
// can serve it from `main` / `/docs` with no configuration. Plain Node ESM, no
// dependencies, so a fresh clone builds without an install step.

import { readdir, readFile, writeFile, mkdir, rm, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { parseFrontMatter, renderMarkdown, slugify } from './lib/markdown.mjs';
import { escapeHtml } from './lib/highlight.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const CONTENT = path.join(ROOT, 'content');
const OUT = path.join(ROOT, 'docs');
const ASSETS = path.join(__dirname, 'assets');

export const SITE = {
  title: 'React 19 Docs',
  name: 'React 19 Documentation',
  description:
    'A practical, opinionated reference for React 19 — hooks, Server Components, Actions, performance and migration.',
  reactVersion: '19.2.8',
  repo: 'react_doc',
};

export const GROUPS = [
  { slug: 'getting-started', title: 'Getting Started', blurb: 'Install React, build your first component, and learn how to think in components.' },
  { slug: 'core-concepts', title: 'Core Concepts', blurb: 'JSX, props, state, rendering, lists and events — the model everything else builds on.' },
  { slug: 'hooks', title: 'Hooks', blurb: 'Every built-in hook, one page each, with the rules that keep them working.' },
  { slug: 'state-management', title: 'State Management', blurb: 'Lifting state, context, reducers and external stores — and how to choose.' },
  { slug: 'data-fetching', title: 'Data Fetching', blurb: 'Suspense, use(), caching, and the libraries that do this properly.' },
  { slug: 'performance', title: 'Performance', blurb: 'The React Compiler, memoization, code splitting, Activity and profiling.' },
  { slug: 'server-react', title: 'Server React', blurb: 'Server Components, directives, Server Functions, SSR and streaming.' },
  { slug: 'patterns', title: 'Patterns', blurb: 'Composition, error boundaries, portals, forms and refs.' },
  { slug: 'typescript', title: 'TypeScript', blurb: 'Typing props, hooks, children, events and generic components.' },
  { slug: 'accessibility', title: 'Accessibility', blurb: 'Semantics, focus management and announcements that actually work.' },
  { slug: 'testing', title: 'Testing', blurb: 'Testing Library, act, async behavior and user events.' },
  { slug: 'ecosystem', title: 'Ecosystem', blurb: 'Routing, styling, forms, data libraries, tooling and Redux.' },
  { slug: 'migration', title: 'Migration', blurb: 'React 18 to 19, removed and deprecated APIs, and legacy codebases.' },
  { slug: 'reference', title: 'Reference', blurb: 'Hooks reference, built-in components, a dense cheat sheet and troubleshooting.' },
];

const GROUP_BY_SLUG = new Map(GROUPS.map((g, i) => [g.slug, { ...g, order: i }]));

/* ------------------------------------------------------------------ utils */

async function walk(dir) {
  const found = [];
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return found;
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) found.push(...(await walk(full)));
    else if (entry.isFile() && entry.name.endsWith('.md')) found.push(full);
  }
  return found;
}

const toPosix = (p) => p.split(path.sep).join('/');

function relBase(depth) {
  return depth === 0 ? './' : '../'.repeat(depth);
}

/* ----------------------------------------------------------------- loader */

export async function loadPages() {
  const files = (await walk(CONTENT)).sort();
  const pages = [];
  const problems = [];

  for (const file of files) {
    const rel = toPosix(path.relative(CONTENT, file));
    const source = await readFile(file, 'utf8');
    const { data, body, bodyOffsetLines } = parseFrontMatter(source);

    const slugPath = rel.replace(/\.md$/, '');
    const [dirSlug] = slugPath.split('/');
    const group = data.group || dirSlug;

    const rendered = renderMarkdown(body, { lineBase: bodyOffsetLines });

    pages.push({
      file,
      rel,
      slugPath,
      url: `${slugPath}.html`,
      depth: slugPath.split('/').length - 1,
      dirSlug,
      group,
      data,
      body,
      bodyOffsetLines,
      ...rendered,
    });
  }

  pages.sort((a, b) => {
    const ga = GROUP_BY_SLUG.get(a.group)?.order ?? 99;
    const gb = GROUP_BY_SLUG.get(b.group)?.order ?? 99;
    if (ga !== gb) return ga - gb;
    const oa = Number(a.data.order ?? 9999);
    const ob = Number(b.data.order ?? 9999);
    if (oa !== ob) return oa - ob;
    return a.slugPath.localeCompare(b.slugPath);
  });

  return { pages, problems };
}

/* --------------------------------------------------------------- template */

const ICONS = {
  search: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><circle cx="9" cy="9" r="6"/><path d="m13.5 13.5 3.5 3.5" stroke-linecap="round"/></svg>',
  menu: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><path d="M3 5.5h14M3 10h14M3 14.5h14" stroke-linecap="round"/></svg>',
  panel: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><rect x="2.5" y="3.5" width="15" height="13" rx="2.5"/><path d="M7.75 3.5v13"/></svg>',
  chevron: '<svg class="nav-chevron" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="m6 4 4 4-4 4" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  close: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><path d="m5.5 5.5 9 9M14.5 5.5l-9 9" stroke-linecap="round"/></svg>',
  sun: '<svg class="icon-sun" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><circle cx="10" cy="10" r="3.6"/><path d="M10 1.6v2M10 16.4v2M18.4 10h-2M3.6 10h-2M15.9 4.1l-1.4 1.4M5.5 14.5l-1.4 1.4M15.9 15.9l-1.4-1.4M5.5 5.5 4.1 4.1" stroke-linecap="round"/></svg>',
  moon: '<svg class="icon-moon" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="M16.5 12.4A7 7 0 0 1 7.6 3.5a7 7 0 1 0 8.9 8.9Z" stroke-linejoin="round"/></svg>',
};

// Runs before first paint so a dark-theme reader never sees a white flash.
// Both the theme and the sidebar state are applied before first paint, so a
// dark-theme reader never sees a white flash and a collapsed sidebar never
// flashes open and then snaps shut.
const THEME_BOOT = `(function(){var d=document.documentElement;try{var m=localStorage.getItem('react-docs-theme');if(m==='dark'||m==='light')d.setAttribute('data-theme',m);}catch(e){}try{if(localStorage.getItem('react-docs-sidebar')==='collapsed')d.setAttribute('data-sidebar','collapsed');}catch(e){}})();`;

function statusBadge(status) {
  if (!status || status === 'current') return '<span class="badge badge-current">Current</span>';
  if (status === 'deprecated') return '<span class="badge badge-deprecated">Deprecated</span>';
  if (status === 'legacy') return '<span class="badge badge-legacy">Legacy</span>';
  return `<span class="badge">${escapeHtml(status)}</span>`;
}

// Ninety-odd links in one flat list is not a menu, it is a wall. Each group is
// a <details>, so it collapses natively and still works with JavaScript off.
// The group containing the current page is rendered open; the rest start shut
// and app.js restores whatever the reader opened last.
function renderSidebar(pages, current) {
  const base = relBase(current ? current.depth : 0);
  let html = '<div class="sidebar-inner">';

  html +=
    '<div class="sidebar-head">' +
    '<p class="sidebar-head-title">Documentation</p>' +
    `<button class="icon-btn sidebar-close" type="button" aria-label="Close navigation">${ICONS.close}</button>` +
    '</div>';

  for (const group of GROUPS) {
    const inGroup = pages.filter((p) => p.group === group.slug);
    if (!inGroup.length) continue;

    const isActiveGroup = Boolean(current) && current.group === group.slug;

    html +=
      `<details class="nav-group" data-group="${group.slug}"${isActiveGroup ? ' open' : ''}>` +
      '<summary class="nav-group-title">' +
      ICONS.chevron +
      `<span class="nav-group-name">${escapeHtml(group.title)}</span>` +
      `<span class="nav-group-count">${inGroup.length}</span>` +
      '</summary>' +
      '<ul class="nav-list">';

    for (const page of inGroup) {
      const isCurrent = current && page.url === current.url;
      const status = page.data.status;
      const badge =
        status === 'legacy' ? '<span class="nav-badge">legacy</span>'
        : status === 'deprecated' ? '<span class="nav-badge">deprecated</span>'
        : '';
      html +=
        `<li><a class="nav-link" href="${base}${page.url}"` +
        `${isCurrent ? ' aria-current="page"' : ''}>` +
        `<span class="nav-link-text">${escapeHtml(page.data.title || page.slugPath)}</span>${badge}</a></li>`;
    }

    html += '</ul></details>';
  }

  return `${html}</div>`;
}

function renderToc(headings) {
  const items = headings.filter((h) => h.level === 2 || h.level === 3);
  if (items.length < 2) return '';
  let html = '<nav class="toc" aria-labelledby="toc-title"><p class="toc-title" id="toc-title">On this page</p><ul>';
  for (const h of items) {
    html += `<li class="toc-h${h.level}"><a href="#${h.slug}">${escapeHtml(h.text)}</a></li>`;
  }
  html += '</ul></nav>';
  return html;
}

function shell({ title, description, base, bodyClass, content, sidebar, page }) {
  const fullTitle = title === SITE.name ? title : `${title} · ${SITE.title}`;
  return `<!doctype html>
<html lang="en" data-base="${base}" data-react-version="${SITE.reactVersion}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(fullTitle)}</title>
<meta name="description" content="${escapeHtml(description || SITE.description)}">
<meta name="color-scheme" content="light dark">
<meta property="og:title" content="${escapeHtml(fullTitle)}">
<meta property="og:description" content="${escapeHtml(description || SITE.description)}">
<meta property="og:type" content="article">
<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Crect width='32' height='32' rx='8' fill='%235449c8'/%3E%3Ctext x='16' y='22' font-family='system-ui,sans-serif' font-size='17' font-weight='700' fill='white' text-anchor='middle'%3ER%3C/text%3E%3C/svg%3E">
<link rel="stylesheet" href="${base}assets/styles.css">
<script>${THEME_BOOT}</script>
</head>
<body${bodyClass ? ` class="${bodyClass}"` : ''}>
<a class="skip-link" href="#main">Skip to content</a>

<header class="site-header">
  <button class="icon-btn menu-btn" type="button" aria-label="Open navigation" aria-expanded="false" aria-controls="sidebar">${ICONS.menu}</button>
  <button class="icon-btn sidebar-toggle" type="button" aria-label="Hide sidebar" aria-expanded="true" aria-controls="sidebar" title="Toggle sidebar">${ICONS.panel}</button>
  <a class="brand" href="${base}index.html">
    <span class="brand-mark" aria-hidden="true">R</span>
    <span class="brand-name">${escapeHtml(SITE.title)}</span>
    <span class="brand-version">v${SITE.reactVersion}</span>
  </a>
  <span class="header-spacer"></span>
  <div class="header-actions">
    <button class="search-trigger" type="button" aria-label="Search documentation">
      ${ICONS.search}<span>Search</span><kbd>Ctrl K</kbd>
    </button>
    <button class="icon-btn theme-toggle" type="button" aria-label="Switch theme">${ICONS.sun}${ICONS.moon}</button>
  </div>
</header>

<div class="nav-backdrop" hidden></div>

${content}

<footer class="site-footer">
  <div class="site-footer-inner">
    <span>Documenting React ${SITE.reactVersion}. Built with a hand-written generator — no dependencies.</span>
    <span><a href="https://react.dev" target="_blank" rel="noopener noreferrer">react.dev</a> is the source of truth.</span>
  </div>
</footer>

<div class="search-overlay" hidden role="dialog" aria-modal="true" aria-label="Search documentation">
  <div class="search-panel">
    <div class="search-field">
      ${ICONS.search}
      <input class="search-input" type="search" placeholder="Search pages, headings and text…" autocomplete="off" spellcheck="false" aria-label="Search query" aria-controls="search-results">
      <button class="search-close" type="button">Esc</button>
    </div>
    <p class="search-hint">Type to search titles, headings and page text.</p>
    <ul class="search-results" id="search-results" role="listbox" aria-label="Search results"></ul>
    <div class="search-foot">
      <span><kbd>↑</kbd><kbd>↓</kbd> navigate</span>
      <span><kbd>Enter</kbd> open</span>
      <span><kbd>Esc</kbd> close</span>
    </div>
  </div>
</div>

<script src="${base}assets/app.js" defer></script>
</body>
</html>
`;
}

function renderPage(page, pages, index) {
  const base = relBase(page.depth);
  const group = GROUP_BY_SLUG.get(page.group);
  const prev = pages[index - 1];
  const next = pages[index + 1];

  const badges = [
    statusBadge(page.data.status),
    page.data.since ? `<span class="badge badge-since">React ${escapeHtml(String(page.data.since))}+</span>` : '',
  ].filter(Boolean).join('');

  const crumbs =
    '<ol class="breadcrumbs">' +
    `<li><a href="${base}index.html">Home</a></li>` +
    (group ? `<li><a href="${base}index.html#${group.slug}">${escapeHtml(group.title)}</a></li>` : '') +
    `<li><span aria-current="page">${escapeHtml(page.data.title || page.slugPath)}</span></li>` +
    '</ol>';

  const pager =
    prev || next
      ? '<nav class="pager" aria-label="Page navigation">' +
        (prev
          ? `<a class="pager-link pager-prev" href="${base}${prev.url}" rel="prev">` +
            `<span class="pager-dir">Previous</span>` +
            `<span class="pager-title">${escapeHtml(prev.data.title || prev.slugPath)}</span></a>`
          : '<span></span>') +
        (next
          ? `<a class="pager-link pager-next" href="${base}${next.url}" rel="next">` +
            `<span class="pager-dir">Next</span>` +
            `<span class="pager-title">${escapeHtml(next.data.title || next.slugPath)}</span></a>`
          : '') +
        '</nav>'
      : '';

  const content =
    '<div class="layout">' +
    `<nav class="sidebar" id="sidebar" aria-label="Documentation">${renderSidebar(pages, page)}</nav>` +
    `<main class="main" id="main" tabindex="-1">` +
    crumbs +
    '<header class="page-header">' +
    `<h1 class="page-title">${escapeHtml(page.data.title || page.slugPath)}</h1>` +
    (page.data.description ? `<p class="page-description">${escapeHtml(page.data.description)}</p>` : '') +
    (badges ? `<div class="badges">${badges}</div>` : '') +
    '</header>' +
    `<div class="prose">${page.html}</div>` +
    pager +
    '</main>' +
    renderToc(page.headings) +
    '</div>';

  return shell({
    title: page.data.title || page.slugPath,
    description: page.data.description,
    base,
    content,
    page,
  });
}

function renderHome(pages) {
  const base = './';
  const start = pages.find((p) => p.slugPath === 'getting-started/introduction');
  const learn = pages.find((p) => p.slugPath === 'getting-started/learning-path');
  const cheat = pages.find((p) => p.slugPath === 'reference/cheat-sheet');
  const migrate = pages.find((p) => p.slugPath === 'migration/react-18-to-19');

  const cards = GROUPS.map((group) => {
    const inGroup = pages.filter((p) => p.group === group.slug);
    if (!inGroup.length) return '';
    const first = inGroup[0];
    return (
      `<a class="home-card" href="${base}${first.url}" id="${group.slug}">` +
      `<h3>${escapeHtml(group.title)}</h3>` +
      `<p>${escapeHtml(group.blurb)}</p>` +
      `<span class="home-card-count">${inGroup.length} page${inGroup.length === 1 ? '' : 's'}</span>` +
      '</a>'
    );
  }).join('');

  const content =
    '<main class="home" id="main" tabindex="-1">' +
    '<div class="home-hero">' +
    `<span class="home-eyebrow">React ${SITE.reactVersion} · current stable</span>` +
    '<h1 class="home-title">React, documented for the version you are actually running.</h1>' +
    '<p class="home-lede">Every page is written against React 19: <code>ref</code> as a prop, ' +
    '<code>&lt;Context&gt;</code> as a provider, Actions, <code>use()</code>, Server Components, ' +
    '<code>&lt;Activity&gt;</code> and the React Compiler. Removed and deprecated APIs appear only where ' +
    'they belong — in migration.</p>' +
    '<div class="home-cta">' +
    (start ? `<a class="btn btn-primary" href="${base}${start.url}">Start reading</a>` : '') +
    (learn ? `<a class="btn btn-ghost" href="${base}${learn.url}">Learning path</a>` : '') +
    (cheat ? `<a class="btn btn-ghost" href="${base}${cheat.url}">Cheat sheet</a>` : '') +
    (migrate ? `<a class="btn btn-ghost" href="${base}${migrate.url}">Upgrade from 18</a>` : '') +
    '</div></div>' +
    '<h2 class="home-section-title">Browse by section</h2>' +
    `<div class="home-grid">${cards}</div>` +
    '</main>';

  return shell({
    title: SITE.name,
    description: SITE.description,
    base,
    bodyClass: 'is-home',
    content,
  });
}

/* ---------------------------------------------------------------- indexing */

function buildSearchIndex(pages) {
  return pages.map((page) => ({
    u: page.url,
    t: page.data.title || page.slugPath,
    g: GROUP_BY_SLUG.get(page.group)?.title || page.group,
    d: page.data.description || '',
    h: page.headings.filter((h) => h.level <= 3).map((h) => h.text),
    b: page.text.slice(0, 1400),
  }));
}

/* ------------------------------------------------------------------ build */

async function copyAssets() {
  await mkdir(path.join(OUT, 'assets'), { recursive: true });
  for (const name of ['styles.css', 'app.js']) {
    const src = path.join(ASSETS, name);
    if (existsSync(src)) {
      await writeFile(path.join(OUT, 'assets', name), await readFile(src));
    }
  }
}

export async function build({ quiet = false } = {}) {
  const log = quiet ? () => {} : (...a) => console.log(...a);

  if (!existsSync(CONTENT)) {
    throw new Error(`No content directory at ${CONTENT}`);
  }

  const { pages } = await loadPages();
  if (!pages.length) throw new Error('No Markdown pages found in content/.');

  // Clean only generated output, never the repo.
  if (existsSync(OUT)) await rm(OUT, { recursive: true, force: true });
  await mkdir(OUT, { recursive: true });

  let liveExamples = 0;
  let codeBlocks = 0;

  for (const [i, page] of pages.entries()) {
    const outFile = path.join(OUT, ...page.url.split('/'));
    await mkdir(path.dirname(outFile), { recursive: true });
    await writeFile(outFile, renderPage(page, pages, i), 'utf8');
    liveExamples += page.liveExamples;
    codeBlocks += page.codeBlocks.length;
  }

  await writeFile(path.join(OUT, 'index.html'), renderHome(pages), 'utf8');
  await writeFile(
    path.join(OUT, 'search-index.json'),
    JSON.stringify(buildSearchIndex(pages)),
    'utf8',
  );
  // Stops GitHub Pages from running Jekyll over the output.
  await writeFile(path.join(OUT, '.nojekyll'), '', 'utf8');
  await copyAssets();

  const groups = new Set(pages.map((p) => p.group));
  const bytes = (await stat(path.join(OUT, 'search-index.json'))).size;

  log(`Built ${pages.length} pages across ${groups.size} groups.`);
  log(`  ${codeBlocks} code blocks, ${liveExamples} live examples.`);
  log(`  search-index.json: ${(bytes / 1024).toFixed(1)} kB`);
  log(`  output: ${toPosix(path.relative(ROOT, OUT))}/`);

  return { pages, liveExamples, codeBlocks };
}

if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith('build.mjs')) {
  build().catch((err) => {
    console.error(`\nBuild failed: ${err.message}`);
    process.exitCode = 1;
  });
}
