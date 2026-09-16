#!/usr/bin/env node
// Validation for the React 19 documentation.
//
//   node scripts/check.mjs
//
// Fails (exit 1) on: bad front matter, missing required sections, broken
// internal links or heading anchors, orphan pages, and any removed or
// deprecated React API taught outside a labelled migration/legacy block.

import path from 'node:path';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { loadPages, GROUPS, isNextGroup } from './build.mjs';
import { parseFrontMatter, parseInfoString, slugify, CALLOUT_TYPES } from './lib/markdown.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

const GROUP_SLUGS = new Set(GROUPS.map((g) => g.slug));
const VALID_STATUS = new Set(['current', 'legacy', 'deprecated']);
// Framework pages carry two more labels: features Next.js ships behind a flag
// that is on the way to becoming default, and features that are experimental.
const NEXT_STATUS = new Set([...VALID_STATUS, 'opt-in', 'experimental']);

// --- Next.js: stale framework APIs ------------------------------------------
//
// Next.js 16 invalidated most tutorials. These patterns are what code written
// from memory of Next.js 13-15 looks like. Outside `nextjs-migration` they fail
// in any untagged code block, and in prose unless the sentence frames them as
// removed / deprecated / migrated (the same HISTORICAL heuristic as React).
//
// `code` patterns apply to code only; `both` patterns apply to code and prose.
const NEXT_STALE = [
  ['middleware.ts as current guidance', /\bmiddleware\.(ts|js)\b|export\s+(default\s+)?(async\s+)?function\s+middleware\b/, 'both'],
  ['synchronous cookies()/headers()/draftMode()', /(?<![\w.])(cookies|headers|draftMode)\(\)\s*\.\s*(get|getAll|has|set|delete|isEnabled|enable|disable|entries|forEach|keys|values|toString|size)\b|=\s*(cookies|headers|draftMode)\(\)\s*;/, 'code'],
  ['synchronous params destructuring', /\{\s*params\s*:\s*\{\s*\w+\s*\}\s*\}|\bparams\??\s*:\s*\{\s*\w+\??\s*:\s*string(\[\])?\s*;?\s*\}(?!\s*>)/, 'code'],
  ['experimental.ppr', /\bexperimental\.ppr\b|^\s*ppr\s*:/, 'both'],
  ['experimental_ppr', /\bexperimental_ppr\b/, 'both'],
  ['dynamicIO', /\bdynamicIO\b/, 'both'],
  ['serverRuntimeConfig', /\bserverRuntimeConfig\b/, 'both'],
  ['publicRuntimeConfig', /\bpublicRuntimeConfig\b/, 'both'],
  ['next lint', /\bnext\s+lint\b/, 'both'],
  ['images.domains', /\bimages\.domains\b|^\s*domains\s*:/, 'both'],
  ['next/legacy/image', /next\/legacy\/image/, 'both'],
  ['single-argument revalidateTag()', /\brevalidateTag\(\s*(?:'[^']*'|"[^"]*"|`[^`]*`|[\w.$]+)\s*\)/, 'both'],
  ['unstable_rootParams', /\bunstable_rootParams\b/, 'both'],
  ['unstable_catchError (renamed catchError in 16.3)', /\bunstable_catchError\b/, 'both'],
  ['unstable_retry (renamed retry in 16.3)', /\bunstable_retry\b/, 'both'],
  ['AMP', /\buseAmp\b|\bamp\s*:\s*true\b/, 'both'],
  ['Pages Router data fetching', /\b(getServerSideProps|getStaticProps|getStaticPaths|getInitialProps)\b/, 'both'],
  ['experimental.reactCompiler', /\bexperimental\.reactCompiler\b/, 'both'],
  ['pre-Cache-Components route segment config', /export\s+const\s+(dynamic|revalidate|fetchCache|dynamicParams)\s*=/, 'code'],
  ['unstable_cache / unstable_noStore', /\bunstable_(cache|noStore)\b/, 'both'],
  ['fetch next.revalidate option', /\bnext\s*:\s*\{\s*(revalidate|tags)\b/, 'code'],
  ['Edge runtime as a recommendation', /export\s+const\s+runtime\s*=\s*['"]edge['"]/, 'code'],
  ['a Next.js version below the 16.3.3 security floor', /\bnext@16\.(?:[0-2]\.\d+|3\.[0-2])\b|"next"\s*:\s*"[\^~]?16\.(?:[0-2]\.\d+|3\.[0-2])"/, 'code'],
];

// Framing that makes a prose mention of a stale Next.js API acceptable.
const NEXT_HISTORICAL = /remov|deprecat|no longer|legacy|instead|replac|migrat|renam|superseded|formerly|previous model|pre-16|before (next\.js )?16|next\.js 1[345]\b|in 1[345]\b|was the|used to|dropped|codemod|never (use|write)|do not use|don't use|not supported|pages router|is gone|rather than|affected|vulnerab|advisory|below/i;

// React APIs that are not in React 19.2 (the version the React sections
// document). The App Router ships them through its vendored Canary build, and
// React 19.3 made several stable. They must be labelled wherever they appear.
const CANARY_API = /\b(ViewTransition|addTransitionType|transitionTypes|unstable_ViewTransition|experimental_taint\w*)\b/;

// Code block languages that must show where the file lives.
const NEXT_FILE_LANGS = new Set(['tsx', 'ts', 'jsx', 'js', 'json', 'css']);

const SECURITY_SECTIONS = ['The threat', 'Exploit', 'Fix', 'Verify the fix'];
const SECURITY_EXEMPT = new Set(['nextjs-security/overview.md', 'nextjs-security/security-advisories.md']);

const REQUIRED_SECTIONS = ['Common mistakes', 'Related topics'];

const BANNED_FILENAMES = [
  /^test\.md$/i, /^new\.md$/i, /^notes.*\.md$/i, /^temp\.md$/i,
  /^untitled/i, /^copy[- ]of/i, /^final/i, /^index\.md$/i, /\bv\d+\.md$/i,
];

// --- The API blacklists ------------------------------------------------------

const REMOVED = [
  ['propTypes', /\bpropTypes\b/],
  ['defaultProps', /\bdefaultProps\b/],
  ['contextTypes', /\bcontextTypes\b/],
  ['getChildContext', /\bgetChildContext\b/],
  ['React.createFactory', /\bcreateFactory\b/],
  ['ReactDOM.render', /\bReactDOM\.render\b|(?<![A-Za-z])render\(\s*<[A-Z][\w.]*\s*\/?>\s*,/],
  ['ReactDOM.hydrate', /\bReactDOM\.hydrate\b(?!Root)|\bhydrate\s*\([^)]*document\./],
  ['unmountComponentAtNode', /\bunmountComponentAtNode\b/],
  ['ReactDOM.findDOMNode', /\bfindDOMNode\b/],
  ['react-dom/test-utils', /react-dom\/test-utils/],
  ['react-test-renderer/shallow', /react-test-renderer\/shallow/],
  ['unstable_flushControlled', /\bunstable_flushControlled\b/],
  ['unstable_createEventHandle', /\bunstable_createEventHandle\b/],
  ['unstable_renderSubtreeIntoContainer', /\bunstable_renderSubtreeIntoContainer\b/],
  ['unstable_runWithPriority', /\bunstable_runWithPriority\b/],
  ['string refs', /\bref=["'][A-Za-z]/],
  ['ReactDOM.useFormState', /\buseFormState\b/],
  ['UMD build', /\bUMD\b/],
];

const DEPRECATED = [
  ['forwardRef', /\bforwardRef\b/],
  ['<Context.Provider>', /\.Provider\b/],
  ['react-test-renderer', /react-test-renderer(?!\/shallow)/],
  ['element.ref', /\belement\.ref\b/],
];

// A prose mention is allowed when the surrounding sentence frames the API as
// historical. This is a heuristic and deliberately generous: the guarantee that
// matters is enforced separately and absolutely — a removed or deprecated API
// inside a code fence that is not tagged `legacy` always fails, whatever the
// prose around it says. Prose that merely *names* an old API while explaining
// what replaced it is exactly the content we want the docs to contain.
const HISTORICAL = new RegExp(
  [
    'remov', 'deprecat', 'no longer', 'legacy', 'instead', 'replac', 'migrat',
    'before react', 'pre-react', 'react 1[89]', 'used to', 'until react',
    'superseded', 'obsolete', 'dropped', 'codemod', 'was the', 'renam',
    'canar', 'there is no', 'is gone', 'rather than',
    'old(er)? (way|api|form)', 'not supported', 'do not use', "don't use",
    'never (use|write)',
  ].join('|'),
  'i',
);

// --- Source masking ----------------------------------------------------------

/**
 * Classify every line of a Markdown body so the API grep knows what it is
 * looking at: fenced code (and whether that fence is `legacy`-tagged), a
 * DEPRECATED/LEGACY callout, or ordinary prose.
 */
function classifyLines(body) {
  const lines = body.split('\n');
  const kinds = new Array(lines.length).fill('prose');

  let fence = null;
  let calloutExempt = false;

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    const fm = /^\s*(`{3,}|~{3,})\s*(.*)$/.exec(line);

    if (fence) {
      const closing = fm && fm[1][0] === fence.marker[0] && fm[1].length >= fence.marker.length && !fm[2];
      kinds[i] = closing ? 'fence-edge' : fence.kind;
      if (closing) fence = null;
      continue;
    }

    if (fm && fm[1].length >= 3) {
      const { flags } = parseInfoString(fm[2]);
      const exempt = Boolean(flags.legacy);
      fence = { marker: fm[1], kind: exempt ? 'code-legacy' : 'code' };
      kinds[i] = 'fence-edge';
      continue;
    }

    const quoted = /^\s{0,3}>\s?(.*)$/.exec(line);
    if (quoted) {
      const marker = /^\[!(DEPRECATED|LEGACY)\]/.exec(quoted[1].trim());
      if (marker) calloutExempt = true;
      else if (/^\[![A-Z-]+\]/.test(quoted[1].trim())) calloutExempt = false;
      kinds[i] = calloutExempt ? 'callout-exempt' : 'callout';
      continue;
    }

    if (!line.trim()) {
      // A blank line does not end a callout on its own; a non-quoted line does.
      kinds[i] = 'blank';
      continue;
    }

    calloutExempt = false;
    kinds[i] = 'prose';
  }

  return { lines, kinds };
}

// --- Checks ------------------------------------------------------------------

async function main() {
  const { pages } = await loadPages();
  const errors = [];
  const warnings = [];
  const notes = [];

  const rel = (p) => path.posix.join('content', p.rel);
  const err = (page, line, msg) => errors.push({ file: rel(page), line, msg });
  const warn = (page, line, msg) => warnings.push({ file: rel(page), line, msg });

  if (!pages.length) {
    console.error('No pages found in content/.');
    process.exit(1);
  }

  const byUrl = new Map();
  const anchorsByUrl = new Map();
  for (const page of pages) {
    byUrl.set(page.url, page);
    anchorsByUrl.set(page.url, new Set(page.headings.map((h) => h.slug)));
  }

  const linkedTo = new Set();
  // Next.js -> React cross-links, counted for the report. A broken one is
  // already an error above; these numbers show how many were verified.
  const crossLinks = { total: 0, pages: new Set(), targets: new Set() };

  for (const page of pages) {
    const fm = page.data;
    const base = path.posix.basename(page.rel);

    /* --- filenames ------------------------------------------------------- */

    if (!/^[a-z0-9]+(-[a-z0-9]+)*\.md$/.test(base)) {
      err(page, 1, `Filename is not kebab-case: "${base}"`);
    }
    for (const bad of BANNED_FILENAMES) {
      if (bad.test(base)) err(page, 1, `Placeholder filename is not allowed: "${base}"`);
    }
    const dir = path.posix.dirname(page.rel);
    if (dir === '.') err(page, 1, 'Page must live inside a group directory.');

    /* --- front matter ---------------------------------------------------- */

    for (const key of ['title', 'description', 'group', 'order', 'status']) {
      if (fm[key] === undefined || fm[key] === '') {
        err(page, 1, `Front matter is missing "${key}".`);
      }
    }
    if (fm.group && !GROUP_SLUGS.has(fm.group)) {
      err(page, 1, `Unknown group "${fm.group}". Valid: ${[...GROUP_SLUGS].join(', ')}`);
    }
    if (fm.group && dir !== '.' && fm.group !== dir) {
      err(page, 1, `Front matter group "${fm.group}" does not match directory "${dir}".`);
    }
    const nextPage = isNextGroup(fm.group);
    if (fm.status && !(nextPage ? NEXT_STATUS : VALID_STATUS).has(fm.status)) {
      err(page, 1, nextPage
        ? `Invalid status "${fm.status}". Use current, opt-in, experimental, legacy or deprecated.`
        : `Invalid status "${fm.status}". Use current, legacy or deprecated.`);
    }
    if (nextPage && (fm.status === 'legacy' || fm.status === 'deprecated') && fm.group !== 'nextjs-migration') {
      err(page, 1, `Status "${fm.status}" is only allowed in nextjs-migration. Current Next.js pages document 16.3.`);
    }
    if (fm.order !== undefined && !Number.isInteger(Number(fm.order))) {
      err(page, 1, `"order" must be an integer, got "${fm.order}".`);
    }
    if (typeof fm.description === 'string' && fm.description.length > 200) {
      warn(page, 1, `Description is ${fm.description.length} characters; keep it to one sentence.`);
    }
    if (fm.since !== undefined && !/^\d+(\.\d+)?$/.test(String(fm.since))) {
      err(page, 1, `"since" should look like "19.0" or "19.2", got "${fm.since}".`);
    }

    /* --- page shape ------------------------------------------------------ */

    const h1s = page.headings.filter((h) => h.level === 1);
    if (h1s.length) {
      err(page, h1s[0].line, 'Do not write an H1 in the body — the title comes from front matter.');
    }

    const h2s = page.headings.filter((h) => h.level === 2);
    for (const required of REQUIRED_SECTIONS) {
      if (!h2s.some((h) => h.text.trim().toLowerCase() === required.toLowerCase())) {
        err(page, 1, `Missing required section "## ${required}".`);
      }
    }
    if (h2s.length) {
      const last = h2s[h2s.length - 1];
      if (last.text.trim().toLowerCase() !== 'related topics') {
        err(page, last.line, `"## Related topics" must be the last H2 (found "${last.text}").`);
      }
    }

    const dupes = new Map();
    for (const h of h2s) {
      const key = h.text.trim().toLowerCase();
      dupes.set(key, (dupes.get(key) || 0) + 1);
    }
    for (const [text, count] of dupes) {
      if (count > 1) warn(page, 1, `Duplicate H2 "${text}" appears ${count} times.`);
    }

    /* --- links ----------------------------------------------------------- */

    let reactLinkCount = 0;
    for (const link of page.links) {
      const href = link.href;
      if (/^(https?:|mailto:|tel:|data:)/.test(href)) continue;

      if (href.startsWith('/')) {
        err(page, link.line, `Root-absolute link "${href}" breaks on a repo subpath. Use a relative path.`);
        continue;
      }

      const [rawPath, hash] = href.split('#');

      if (!rawPath) {
        // Same-page anchor.
        if (hash && !anchorsByUrl.get(page.url).has(hash)) {
          err(page, link.line, `Anchor "#${hash}" does not exist on this page.`);
        }
        continue;
      }

      // Resolve relative to the page's own directory, in content-space.
      const resolved = path.posix.normalize(path.posix.join(path.posix.dirname(page.rel), rawPath));

      if (resolved.startsWith('..')) {
        // Points outside content/ — allowed for the legacy archive and for the
        // runnable Next.js example apps, which must exist on disk.
        if (/(^|\/)examples\//.test(href)) {
          const onDisk = path.join(ROOT, 'content', ...resolved.split('/'));
          if (!existsSync(onDisk)) {
            err(page, link.line, `Broken example link: "${href}" (no file at ${path.relative(ROOT, onDisk)}).`);
          }
        } else if (!/legacy\//.test(href)) {
          warn(page, link.line, `Link "${href}" points outside content/.`);
        }
        continue;
      }

      if (!/\.md$/.test(rawPath)) {
        warn(page, link.line, `Internal link "${href}" should target a .md file.`);
        continue;
      }

      const targetUrl = resolved.replace(/\.md$/, '.html');
      const target = byUrl.get(targetUrl);
      if (!target) {
        err(page, link.line, `Broken link: "${href}" (no page at content/${resolved}).`);
        continue;
      }

      linkedTo.add(targetUrl);
      if (!isNextGroup(target.group)) {
        reactLinkCount += 1;
        if (isNextGroup(page.group)) {
          crossLinks.total += 1;
          crossLinks.pages.add(page.url);
          crossLinks.targets.add(targetUrl);
        }
      }

      if (hash && !anchorsByUrl.get(targetUrl).has(hash)) {
        err(page, link.line, `Broken anchor: "${href}" — "${targetUrl}" has no heading "#${hash}".`);
      }
    }

    /* --- removed / deprecated APIs --------------------------------------- */

    const pageIsHistorical = fm.status === 'legacy' || fm.status === 'deprecated';
    const source = await import('node:fs/promises').then((fs) => fs.readFile(page.file, 'utf8'));
    const { body, bodyOffsetLines } = parseFrontMatter(source);
    const { lines, kinds } = classifyLines(body);

    for (const [list, label, severity] of [[REMOVED, 'removed', 'error'], [DEPRECATED, 'deprecated', 'error']]) {
      for (const [name, re] of list) {
        for (let i = 0; i < lines.length; i += 1) {
          const kind = kinds[i];
          if (kind === 'code-legacy' || kind === 'callout-exempt' || kind === 'fence-edge') continue;

          const line = lines[i];
          if (!re.test(line)) continue;

          const lineNo = bodyOffsetLines + i + 1;

          if (pageIsHistorical) continue;

          if (kind === 'code') {
            err(page, lineNo,
              `${label === 'removed' ? 'Removed' : 'Deprecated'} API "${name}" appears in a code block that is not tagged \`legacy\`.`);
            continue;
          }

          // Prose: allow it when the sentence frames it historically.
          const context = [lines[i - 1] || '', line, lines[i + 1] || ''].join(' ');
          if (!HISTORICAL.test(context)) {
            err(page, lineNo,
              `${label === 'removed' ? 'Removed' : 'Deprecated'} API "${name}" is mentioned without a removal/version note. ` +
              `Label it, or move it to a [!${label === 'removed' ? 'LEGACY' : 'DEPRECATED'}] callout.`);
          }
        }
      }
    }

    /* --- class components ------------------------------------------------ */

    // Error boundaries are the one place React still requires a class, so any
    // page that legitimately demonstrates or tests one is exempt.
    const CLASS_OK = new Set([
      'patterns/error-boundaries.md',
      'reference/cheat-sheet.md',
      'reference/built-in-components.md',
      'reference/troubleshooting.md',
      'testing/act-and-async.md',
    ]);
    if (!pageIsHistorical && !page.rel.startsWith('migration/') && !CLASS_OK.has(page.rel)) {
      for (let i = 0; i < lines.length; i += 1) {
        if (kinds[i] !== 'code') continue;
        if (/\bclass\s+\w+\s+extends\s+(React\.)?(Pure)?Component\b/.test(lines[i])) {
          notes.push({
            file: rel(page),
            line: bodyOffsetLines + i + 1,
            msg: 'Class component outside a legacy fence or a migration/error-boundary page.',
          });
        }
      }
    }

    /* --- Next.js framework pages ----------------------------------------- */

    if (nextPage) {
      const isMigration = fm.group === 'nextjs-migration';

      if (reactLinkCount === 0 && fm.group !== 'nextjs-reference') {
        warn(page, 1, 'Next.js page links no React page. Cross-link the underlying React concept in Related topics.');
      }

      for (const block of page.codeBlocks) {
        if (block.flags.live) {
          err(page, block.line, 'Next.js pages cannot have `live` blocks — Next.js needs a server. Link a runnable app in examples/nextjs/ instead.');
        }
        if (NEXT_FILE_LANGS.has(block.lang) && typeof block.flags.file !== 'string') {
          err(page, block.line, `A \`${block.lang}\` block on a Next.js page must show its path: \`\`\`${block.lang} file="app/page.tsx"`);
        }
        if (!isMigration && typeof block.flags.file === 'string' && /(^|\/)middleware\.(ts|js)$/.test(block.flags.file) && !block.flags.legacy) {
          err(page, block.line, '`middleware.ts` is deprecated in 16.0. Current code goes in `proxy.ts`; the old file belongs in nextjs-migration.');
        }
        if (block.flags.legacy && !isMigration) {
          err(page, block.line, '`legacy` code is only allowed in nextjs-migration. Current Next.js pages show 16.3 code.');
        }
      }

      // Canary-only React APIs: a tagged block, and "Canary" named in prose.
      for (let i = 0; i < lines.length; i += 1) {
        const kind = kinds[i];
        if (kind === 'fence-edge' || !CANARY_API.test(lines[i])) continue;
        const lineNo = bodyOffsetLines + i + 1;
        if (kind === 'code' || kind === 'code-legacy') {
          const block = page.codeBlocks.find((b) => b.line <= lineNo && lineNo <= b.line + b.code.split('\n').length + 1);
          if (block && !block.flags.canary && !block.flags.legacy) {
            err(page, lineNo, `"${CANARY_API.exec(lines[i])[1]}" is not in React 19.2. Tag the block \`canary\` (see CONTRIBUTING 10.1).`);
          }
          continue;
        }
        const around = lines.slice(Math.max(0, i - 2), i + 3).join(' ');
        if (!/canary/i.test(around)) {
          err(page, lineNo, `"${CANARY_API.exec(lines[i])[1]}" is mentioned without a React Canary label. Say it ships in the App Router's React Canary build and is not in React 19.2.`);
        }
      }

      // Stale Next.js 13-15 APIs, outside the migration pages.
      if (!isMigration) {
        for (const [name, re, scope] of NEXT_STALE) {
          for (let i = 0; i < lines.length; i += 1) {
            const kind = kinds[i];
            if (kind === 'code-legacy' || kind === 'callout-exempt' || kind === 'fence-edge' || kind === 'blank') continue;
            if (!re.test(lines[i])) continue;
            const lineNo = bodyOffsetLines + i + 1;
            if (kind === 'code') {
              const block = page.codeBlocks.find((b) => b.line <= lineNo && lineNo <= b.line + b.code.split('\n').length + 1);
              // A deliberately vulnerable block may show an old, unsafe version pin.
              if (block?.flags.vulnerable && /security floor/.test(name)) continue;
              err(page, lineNo, `Stale Next.js API "${name}" in a code block. Next.js 16.3 code only; old forms belong in nextjs-migration.`);
              continue;
            }
            if (scope !== 'both') continue;
            const context = [lines[i - 1] || '', lines[i], lines[i + 1] || ''].join(' ');
            if (!NEXT_HISTORICAL.test(context)) {
              err(page, lineNo, `Stale Next.js API "${name}" mentioned as if current. Frame it as removed/deprecated, or move it to nextjs-migration.`);
            }
          }
        }
      }

      // Security pages: threat, exploit, fix, verification — in that order.
      if (fm.group === 'nextjs-security' && !SECURITY_EXEMPT.has(page.rel)) {
        const h2text = h2s.map((h) => h.text.trim().toLowerCase());
        let last = -1;
        for (const section of SECURITY_SECTIONS) {
          const at = h2text.indexOf(section.toLowerCase());
          if (at === -1) {
            err(page, 1, `Security page is missing "## ${section}".`);
          } else if (at < last) {
            err(page, h2s[at].line, `"## ${section}" is out of order. Use: ${SECURITY_SECTIONS.join(' → ')}.`);
          } else {
            last = at;
          }
        }
        const mistakes = h2text.indexOf('common mistakes');
        if (last !== -1 && mistakes !== -1 && mistakes < last) {
          err(page, h2s[mistakes].line, '"## Common mistakes" must come after "## Verify the fix".');
        }
        if (!page.codeBlocks.some((b) => b.flags.vulnerable)) {
          err(page, 1, 'Security page has no `vulnerable` code block. Show the exploitable code before the fix.');
        }
      }
    }

    /* --- callout types --------------------------------------------------- */

    // An unrecognised type renders as a plain blockquote instead of a callout,
    // which is silent unless something checks for it.
    for (let i = 0; i < lines.length; i += 1) {
      if (kinds[i] !== 'callout' && kinds[i] !== 'callout-exempt') continue;
      const m = /^\s{0,3}>\s*\[!([A-Za-z-]+)\]/.exec(lines[i]);
      if (m && !CALLOUT_TYPES[m[1]]) {
        err(page, bodyOffsetLines + i + 1,
          `Unknown callout type "[!${m[1]}]". Valid: ${Object.keys(CALLOUT_TYPES).map((t) => `[!${t}]`).join(', ')}`);
      }
    }

    /* --- code fence hygiene ---------------------------------------------- */

    for (const block of page.codeBlocks) {
      if (block.flags.live && (block.lang === 'tsx' || block.lang === 'ts')) {
        err(page, block.line, 'A live example must be `jsx` — the preview iframe has no TypeScript compiler.');
      }
      if (block.flags.live && !/export\s+default/.test(block.code)) {
        err(page, block.line, 'A live example must have a default export component.');
      }
      if (block.flags.nocheck && typeof block.flags.nocheck !== 'string') {
        warn(page, block.line, '`nocheck` should carry a reason: nocheck="Illustrative signature only."');
      }
      if (block.flags.static && typeof block.flags.static !== 'string') {
        warn(page, block.line, '`static` should carry a reason: static="Runs on the server."');
      }
      if (block.flags.live && /\bfetch\s*\(|XMLHttpRequest|localStorage|sessionStorage/.test(block.code)) {
        warn(page, block.line, 'Live example uses network or storage APIs; it may not run in the sandbox.');
      }
    }
  }

  /* --- orphans ----------------------------------------------------------- */

  const groupFirsts = new Set();
  for (const group of GROUPS) {
    const first = pages.find((p) => p.group === group.slug);
    if (first) groupFirsts.add(first.url);
  }
  for (const page of pages) {
    if (!linkedTo.has(page.url) && !groupFirsts.has(page.url)) {
      warn(page, 1, 'Orphan page: nothing links to it. Add it to the learning path or a Related topics list.');
    }
  }

  /* --- report ------------------------------------------------------------ */

  const fmt = (list) =>
    list
      .map((e) => `  ${e.file}:${e.line}\n      ${e.msg}`)
      .join('\n');

  console.log(`Checked ${pages.length} pages.`);
  const nextCount = pages.filter((p) => isNextGroup(p.group)).length;
  if (nextCount) {
    console.log(
      `  ${nextCount} Next.js pages · ${crossLinks.total} resolved links to React pages ` +
      `(from ${crossLinks.pages.size} pages, to ${crossLinks.targets.size} distinct React pages)`,
    );
  }

  if (notes.length) {
    console.log(`\nNotes (${notes.length}):`);
    console.log(fmt(notes));
  }
  if (warnings.length) {
    console.log(`\nWarnings (${warnings.length}):`);
    console.log(fmt(warnings));
  }
  if (errors.length) {
    console.log(`\nErrors (${errors.length}):`);
    console.log(fmt(errors));
    console.log(`\nFAILED — ${errors.length} error${errors.length === 1 ? '' : 's'}.`);
    process.exitCode = 1;
    return;
  }

  console.log(`\nPASSED — 0 errors, ${warnings.length} warning${warnings.length === 1 ? '' : 's'}.`);
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
