// Dependency-free Markdown to HTML converter, tuned for this site.
//
// Supports: ATX headings with GitHub-style anchor slugs, paragraphs, fenced
// code with an info string, nested ordered/unordered lists, tables, blockquotes
// and `> [!TYPE]` callouts, thematic breaks, `:::tabs` blocks, and the usual
// inline run (code, strong, em, links, images, autolinks).
//
// It deliberately does not support: setext headings, reference links, HTML
// blocks beyond passthrough of a leading `<`, or footnotes. CONTRIBUTING.md
// tells authors as much.

import { highlight, escapeHtml } from './highlight.mjs';

export const CALLOUT_TYPES = {
  NOTE: { label: 'Note', icon: 'i' },
  TIP: { label: 'Tip', icon: '*' },
  'BEST-PRACTICE': { label: 'Best practice', icon: '+' },
  WARNING: { label: 'Warning', icon: '!' },
  DEPRECATED: { label: 'Deprecated', icon: 'x' },
  LEGACY: { label: 'Legacy', icon: 'a' },
};

// --- Front matter -----------------------------------------------------------

export function parseFrontMatter(source) {
  const normalized = source.replace(/^﻿/, '').replace(/\r\n/g, '\n');
  if (!normalized.startsWith('---\n')) {
    return { data: {}, body: normalized, bodyOffsetLines: 0 };
  }
  const end = normalized.indexOf('\n---', 3);
  if (end === -1) return { data: {}, body: normalized, bodyOffsetLines: 0 };

  const raw = normalized.slice(4, end);
  const after = normalized.slice(end + 4).replace(/^\n/, '');
  const data = {};

  for (const line of raw.split('\n')) {
    if (!line.trim() || line.trimStart().startsWith('#')) continue;
    const m = /^([A-Za-z_][\w-]*)\s*:\s*(.*)$/.exec(line);
    if (!m) continue;
    const key = m[1];
    let value = m[2].trim();

    if (value.startsWith('[') && value.endsWith(']')) {
      data[key] = value
        .slice(1, -1)
        .split(',')
        .map((part) => part.trim().replace(/^["']|["']$/g, ''))
        .filter(Boolean);
      continue;
    }
    if (
      (value.startsWith('"') && value.endsWith('"') && value.length > 1) ||
      (value.startsWith("'") && value.endsWith("'") && value.length > 1)
    ) {
      data[key] = value.slice(1, -1);
      continue;
    }
    if (value === 'true') data[key] = true;
    else if (value === 'false') data[key] = false;
    else if (value !== '' && !Number.isNaN(Number(value))) data[key] = Number(value);
    else data[key] = value;
  }

  const bodyOffsetLines = normalized.slice(0, end + 4).split('\n').length;
  return { data, body: after, bodyOffsetLines };
}

// --- Slugs ------------------------------------------------------------------

export function slugify(text) {
  return String(text)
    .trim()
    .toLowerCase()
    .replace(/[`*_~]/g, '')
    .replace(/<[^>]*>/g, '')
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

// --- Inline -----------------------------------------------------------------

function rewriteHref(href) {
  if (/^(https?:|mailto:|tel:|#)/.test(href)) return href;
  const [path, hash] = href.split('#');
  if (/\.md$/.test(path)) {
    return `${path.replace(/\.md$/, '.html')}${hash ? `#${hash}` : ''}`;
  }
  return href;
}

function inline(text, ctx) {
  const out = [];
  let i = 0;
  const n = text.length;

  const pushText = (s) => {
    out.push(
      escapeHtml(s)
        .replace(/---/g, '&mdash;')
        .replace(/(\s)--(\s)/g, '$1&ndash;$2'),
    );
  };

  let plain = '';

  while (i < n) {
    const ch = text[i];

    // Inline code: longest run of backticks wins.
    if (ch === '`') {
      const fence = /^`+/.exec(text.slice(i))[0];
      const close = text.indexOf(fence, i + fence.length);
      if (close !== -1) {
        let code = text.slice(i + fence.length, close);
        if (code.startsWith(' ') && code.endsWith(' ') && code.trim()) {
          code = code.slice(1, -1);
        }
        out.push(`<code>${escapeHtml(code)}</code>`);
        plain += code;
        i = close + fence.length;
        continue;
      }
    }

    // Image
    if (ch === '!' && text[i + 1] === '[') {
      const m = /^!\[([^\]]*)\]\(([^)\s]+)(?:\s+"([^"]*)")?\)/.exec(text.slice(i));
      if (m) {
        const src = rewriteHref(m[2]);
        out.push(
          `<img src="${escapeHtml(src)}" alt="${escapeHtml(m[1])}"${
            m[3] ? ` title="${escapeHtml(m[3])}"` : ''
          } loading="lazy">`,
        );
        i += m[0].length;
        continue;
      }
    }

    // Link
    if (ch === '[') {
      const m = matchLink(text, i);
      if (m) {
        const href = rewriteHref(m.href);
        const isExternal = /^https?:/.test(href);
        const inner = inline(m.label, ctx);
        ctx.links.push({ href: m.href, line: ctx.line });
        out.push(
          `<a href="${escapeHtml(href)}"${
            isExternal ? ' target="_blank" rel="noopener noreferrer"' : ''
          }>${inner.html}</a>`,
        );
        plain += inner.plain;
        i += m.length;
        continue;
      }
    }

    // Autolink
    if (ch === '<') {
      const m = /^<((?:https?|mailto):[^>\s]+)>/.exec(text.slice(i));
      if (m) {
        out.push(
          `<a href="${escapeHtml(m[1])}" target="_blank" rel="noopener noreferrer">${escapeHtml(
            m[1],
          )}</a>`,
        );
        plain += m[1];
        i += m[0].length;
        continue;
      }
    }

    // Strong
    if ((ch === '*' || ch === '_') && text[i + 1] === ch) {
      const marker = ch + ch;
      const close = text.indexOf(marker, i + 2);
      if (close !== -1 && close > i + 2) {
        const inner = inline(text.slice(i + 2, close), ctx);
        out.push(`<strong>${inner.html}</strong>`);
        plain += inner.plain;
        i = close + 2;
        continue;
      }
    }

    // Emphasis
    if (ch === '*' || (ch === '_' && !/[A-Za-z0-9]/.test(text[i - 1] || ''))) {
      const close = text.indexOf(ch, i + 1);
      if (close !== -1 && close > i + 1 && !/\s/.test(text[i + 1])) {
        const inner = inline(text.slice(i + 1, close), ctx);
        out.push(`<em>${inner.html}</em>`);
        plain += inner.plain;
        i = close + 1;
        continue;
      }
    }

    // Strikethrough
    if (ch === '~' && text[i + 1] === '~') {
      const close = text.indexOf('~~', i + 2);
      if (close !== -1) {
        const inner = inline(text.slice(i + 2, close), ctx);
        out.push(`<del>${inner.html}</del>`);
        plain += inner.plain;
        i = close + 2;
        continue;
      }
    }

    // Escapes
    if (ch === '\\' && /[\\`*_{}[\]()#+\-.!<>|~]/.test(text[i + 1] || '')) {
      pushText(text[i + 1]);
      plain += text[i + 1];
      i += 2;
      continue;
    }

    pushText(ch);
    plain += ch;
    i += 1;
  }

  return { html: out.join(''), plain };
}

// Balanced-paren aware link matcher, so `](./a.md)` inside a label still works.
function matchLink(text, start) {
  if (text[start] !== '[') return null;
  let depth = 1;
  let i = start + 1;
  while (i < text.length && depth > 0) {
    if (text[i] === '\\') { i += 2; continue; }
    if (text[i] === '[') depth += 1;
    else if (text[i] === ']') depth -= 1;
    if (depth === 0) break;
    i += 1;
  }
  if (depth !== 0 || text[i + 1] !== '(') return null;
  const label = text.slice(start + 1, i);
  let j = i + 2;
  let pdepth = 1;
  while (j < text.length && pdepth > 0) {
    if (text[j] === '\\') { j += 2; continue; }
    if (text[j] === '(') pdepth += 1;
    else if (text[j] === ')') pdepth -= 1;
    if (pdepth === 0) break;
    j += 1;
  }
  if (pdepth !== 0) return null;
  const target = text.slice(i + 2, j).trim();
  const tm = /^(\S+?)(?:\s+"([^"]*)")?$/.exec(target);
  if (!tm) return null;
  return { label, href: tm[1], title: tm[2], length: j + 1 - start };
}

// --- Code fence info string -------------------------------------------------

export function parseInfoString(info) {
  const trimmed = (info || '').trim();
  if (!trimmed) return { lang: 'text', flags: {} };
  const parts = /^([A-Za-z0-9_+-]*)\s*(.*)$/.exec(trimmed);
  const lang = (parts[1] || 'text').toLowerCase();
  const flags = {};
  const rest = parts[2] || '';
  const re = /([A-Za-z][\w-]*)(?:=(?:"([^"]*)"|'([^']*)'|(\S+)))?/g;
  let m;
  while ((m = re.exec(rest))) {
    flags[m[1]] = m[2] ?? m[3] ?? m[4] ?? true;
  }
  return { lang, flags };
}

// --- Block scanner ----------------------------------------------------------

function renderTable(lines, ctx) {
  const split = (row) => {
    const cells = [];
    let cur = '';
    let i = 0;
    const s = row.trim().replace(/^\|/, '').replace(/\|$/, '');
    while (i < s.length) {
      if (s[i] === '\\' && s[i + 1] === '|') { cur += '|'; i += 2; continue; }
      if (s[i] === '`') {
        const close = s.indexOf('`', i + 1);
        if (close !== -1) { cur += s.slice(i, close + 1); i = close + 1; continue; }
      }
      if (s[i] === '|') { cells.push(cur); cur = ''; i += 1; continue; }
      cur += s[i];
      i += 1;
    }
    cells.push(cur);
    return cells.map((c) => c.trim());
  };

  const header = split(lines[0]);
  const aligns = split(lines[1]).map((spec) => {
    const left = spec.startsWith(':');
    const right = spec.endsWith(':');
    if (left && right) return 'center';
    if (right) return 'right';
    if (left) return 'left';
    return '';
  });

  let html = '<div class="table-wrap"><table>\n<thead><tr>';
  header.forEach((cell, idx) => {
    const a = aligns[idx] ? ` style="text-align:${aligns[idx]}"` : '';
    html += `<th${a}>${inline(cell, ctx).html}</th>`;
  });
  html += '</tr></thead>\n<tbody>';
  for (const row of lines.slice(2)) {
    const cells = split(row);
    html += '<tr>';
    for (let idx = 0; idx < header.length; idx += 1) {
      const a = aligns[idx] ? ` style="text-align:${aligns[idx]}"` : '';
      html += `<td${a}>${inline(cells[idx] ?? '', ctx).html}</td>`;
    }
    html += '</tr>';
  }
  html += '</tbody></table></div>\n';
  return html;
}

function renderCode(code, info, ctx) {
  const { lang, flags } = parseInfoString(info);
  const isLive = Boolean(flags.live) && !flags.static;

  ctx.codeBlocks.push({
    lang,
    flags,
    code,
    line: ctx.blockStartLine,
  });

  const highlighted = highlight(code, lang);
  const langLabel = lang === 'text' ? '' : lang;

  // In Next.js the file's location is part of the API (`app/[lang]/page.tsx`,
  // `proxy.ts`), so a `file="..."` path replaces the bare language label.
  const file = typeof flags.file === 'string' ? flags.file : '';

  const pre =
    `<div class="code-block${flags.vulnerable ? ' is-vulnerable' : ''}" data-lang="${escapeHtml(lang)}">` +
    `<div class="code-head">` +
    (file
      ? `<span class="code-file" title="${escapeHtml(file)}">${escapeHtml(file)}</span>`
      : `<span class="code-lang">${escapeHtml(langLabel)}</span>`) +
    (flags.legacy ? '<span class="code-badge code-badge-legacy">legacy</span>' : '') +
    (flags.vulnerable ? '<span class="code-badge code-badge-vulnerable">Vulnerable — do not copy</span>' : '') +
    (flags.canary ? '<span class="code-badge code-badge-canary">React Canary · 19.3</span>' : '') +
    (flags.nocheck ? '<span class="code-badge">not type-checked</span>' : '') +
    `<button class="copy-btn" type="button" aria-label="Copy code to clipboard">` +
    `<span class="copy-label">Copy</span></button>` +
    `</div>` +
    `<pre><code class="language-${escapeHtml(lang)}">${highlighted}</code></pre>` +
    `</div>`;

  if (!isLive) {
    if (typeof flags.static === 'string') {
      return (
        `<div class="static-example">${pre}` +
        `<p class="static-note"><span class="static-note-tag">Static example</span> ` +
        `${escapeHtml(flags.static)}</p></div>\n`
      );
    }
    return `${pre}\n`;
  }

  const id = `ex-${ctx.exampleCounter++}`;
  ctx.liveExamples += 1;
  return (
    `<div class="example" id="${id}">` +
    `<div class="example-tabs" role="tablist" aria-label="Example view">` +
    `<button type="button" role="tab" class="example-tab is-active" aria-selected="true" data-view="preview" id="${id}-t0" aria-controls="${id}-p0">Preview</button>` +
    `<button type="button" role="tab" class="example-tab" aria-selected="false" tabindex="-1" data-view="code" id="${id}-t1" aria-controls="${id}-p1">Code</button>` +
    `</div>` +
    `<div class="example-panel" role="tabpanel" id="${id}-p0" aria-labelledby="${id}-t0" data-view="preview">` +
    `<div class="example-preview" data-pending="true">` +
    `<div class="example-placeholder"><span class="spinner" aria-hidden="true"></span>Loading preview&hellip;</div>` +
    `</div></div>` +
    `<div class="example-panel" role="tabpanel" id="${id}-p1" aria-labelledby="${id}-t1" data-view="code" hidden>${pre}</div>` +
    `<template class="example-source">${escapeHtml(code)}</template>` +
    `</div>\n`
  );
}

function renderList(items, ordered, ctx, start) {
  const tag = ordered ? 'ol' : 'ul';
  const attr = ordered && start && start !== 1 ? ` start="${start}"` : '';
  let html = `<${tag}${attr}>\n`;
  for (const item of items) {
    const body = renderBlocks(item.lines, ctx);
    const stripped = body.replace(/^<p>([\s\S]*?)<\/p>\n?$/, '$1');
    const taskPrefix =
      item.task === null
        ? ''
        : `<input type="checkbox" disabled${item.task ? ' checked' : ''}> `;
    html += `<li${item.task === null ? '' : ' class="task"'}>${taskPrefix}${stripped}</li>\n`;
  }
  html += `</${tag}>\n`;
  return html;
}

const FENCE_RE = /^(\s*)(`{3,}|~{3,})\s*(.*)$/;
const HEADING_RE = /^(#{1,6})\s+(.*?)\s*#*\s*$/;
const HR_RE = /^\s{0,3}(?:-{3,}|\*{3,}|_{3,})\s*$/;
const UL_RE = /^(\s*)([-*+])\s+(.*)$/;
const OL_RE = /^(\s*)(\d{1,9})[.)]\s+(.*)$/;

function renderBlocks(lines, ctx) {
  let html = '';
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    if (!line.trim()) { i += 1; continue; }

    // Fenced code
    const fence = FENCE_RE.exec(line);
    if (fence && (fence[2].startsWith('```') || fence[2].startsWith('~~~'))) {
      const marker = fence[2];
      const indent = fence[1].length;
      const info = fence[3];
      ctx.blockStartLine = ctx.lineBase + i + 1;
      const body = [];
      i += 1;
      while (i < lines.length) {
        const closing = FENCE_RE.exec(lines[i]);
        if (closing && closing[2].startsWith(marker[0]) && closing[2].length >= marker.length && !closing[3]) {
          i += 1;
          break;
        }
        body.push(lines[i].slice(indent));
        i += 1;
      }
      html += renderCode(body.join('\n'), info, ctx);
      continue;
    }

    // Tabs container
    if (/^:::\s*tabs\s*$/.test(line.trim())) {
      const inner = [];
      let depth = 1;
      i += 1;
      while (i < lines.length) {
        const t = lines[i].trim();
        if (/^:::\s*\w/.test(t)) depth += 1;
        else if (t === ':::') {
          depth -= 1;
          if (depth === 0) { i += 1; break; }
        }
        inner.push(lines[i]);
        i += 1;
      }
      html += renderTabs(inner, ctx);
      continue;
    }

    // Heading
    const heading = HEADING_RE.exec(line);
    if (heading) {
      const level = heading[1].length;
      const rendered = inline(heading[2], ctx);
      let slug = slugify(rendered.plain) || `section-${ctx.headings.length + 1}`;
      if (ctx.slugCounts.has(slug)) {
        const next = ctx.slugCounts.get(slug) + 1;
        ctx.slugCounts.set(slug, next);
        slug = `${slug}-${next}`;
      }
      ctx.slugCounts.set(slug, 0);
      ctx.headings.push({ level, text: rendered.plain, slug, line: ctx.lineBase + i + 1 });
      html +=
        `<h${level} id="${slug}">${rendered.html}` +
        `<a class="heading-anchor" href="#${slug}" aria-label="Link to this section">#</a>` +
        `</h${level}>\n`;
      ctx.text.push(rendered.plain);
      i += 1;
      continue;
    }

    // Thematic break
    if (HR_RE.test(line)) {
      html += '<hr>\n';
      i += 1;
      continue;
    }

    // Blockquote / callout
    if (/^\s{0,3}>/.test(line)) {
      const quoted = [];
      while (i < lines.length && (/^\s{0,3}>/.test(lines[i]) || (quoted.length && lines[i].trim() && !HR_RE.test(lines[i])))) {
        if (!/^\s{0,3}>/.test(lines[i])) break;
        quoted.push(lines[i].replace(/^\s{0,3}>\s?/, ''));
        i += 1;
      }
      const first = quoted[0] || '';
      const cm = /^\[!([A-Z][A-Z-]*)\]\s*(.*)$/.exec(first.trim());
      if (cm && CALLOUT_TYPES[cm[1]]) {
        const type = cm[1];
        const meta = CALLOUT_TYPES[type];
        const rest = [cm[2], ...quoted.slice(1)].filter((l, idx) => idx > 0 || l.trim() !== '');
        const inner = renderBlocks(rest, ctx);
        html +=
          `<div class="callout callout-${type.toLowerCase()}" role="note">` +
          `<p class="callout-title"><span class="callout-icon" aria-hidden="true"></span>` +
          `${escapeHtml(meta.label)}</p>` +
          `<div class="callout-body">${inner}</div></div>\n`;
      } else {
        html += `<blockquote>\n${renderBlocks(quoted, ctx)}</blockquote>\n`;
      }
      continue;
    }

    // Table
    if (line.includes('|') && i + 1 < lines.length && /^\s*\|?[\s:|-]+\|[\s:|-]*$/.test(lines[i + 1]) && lines[i + 1].includes('-')) {
      const rows = [lines[i], lines[i + 1]];
      i += 2;
      while (i < lines.length && lines[i].trim() && lines[i].includes('|')) {
        rows.push(lines[i]);
        i += 1;
      }
      html += renderTable(rows, ctx);
      continue;
    }

    // Lists
    const ul = UL_RE.exec(line);
    const ol = OL_RE.exec(line);
    if ((ul || ol) && !HR_RE.test(line)) {
      const ordered = Boolean(ol);
      const baseIndent = (ul || ol)[1].length;
      const start = ordered ? Number(ol[2]) : 1;
      const items = [];
      let loose = false;

      while (i < lines.length) {
        const cur = lines[i];
        const m = ordered ? OL_RE.exec(cur) : UL_RE.exec(cur);
        const otherM = ordered ? UL_RE.exec(cur) : OL_RE.exec(cur);
        if (m && m[1].length === baseIndent && !HR_RE.test(cur)) {
          let content = ordered ? m[3] : m[3];
          let task = null;
          const tm = /^\[([ xX])\]\s+(.*)$/.exec(content);
          if (tm) {
            task = tm[1].toLowerCase() === 'x';
            content = tm[2];
          }
          const itemLines = [content];
          i += 1;
          // Continuation lines: deeper indent, or a lazy paragraph line.
          while (i < lines.length) {
            const next = lines[i];
            if (!next.trim()) {
              // Blank line: only continues the item if what follows is indented.
              let k = i;
              while (k < lines.length && !lines[k].trim()) k += 1;
              if (k < lines.length && /^\s+\S/.test(lines[k]) && (/^\s{2,}/.exec(lines[k])[0].length > baseIndent)) {
                loose = true;
                itemLines.push('');
                i = k;
                continue;
              }
              break;
            }
            const indentLen = /^\s*/.exec(next)[0].length;
            const isNewItem =
              (UL_RE.test(next) || OL_RE.test(next)) &&
              /^\s*/.exec(next)[0].length <= baseIndent;
            if (isNewItem) break;
            if (indentLen > baseIndent) {
              itemLines.push(next.slice(baseIndent + (ordered ? String(start).length + 2 : 2)).length
                ? next.slice(Math.min(indentLen, baseIndent + 2))
                : next.trim());
              i += 1;
              continue;
            }
            if (HEADING_RE.test(next) || FENCE_RE.test(next) || /^\s{0,3}>/.test(next) || HR_RE.test(next)) break;
            // Lazy continuation of the item's paragraph.
            itemLines.push(next.trim());
            i += 1;
          }
          items.push({ lines: itemLines, task });
          continue;
        }
        if (otherM && otherM[1].length === baseIndent) break;
        break;
      }

      const listCtx = ctx;
      let listHtml = renderList(items, ordered, listCtx, start);
      if (loose) listHtml = listHtml.replace(/<li([^>]*)>([\s\S]*?)<\/li>/g, (mm, attrs, body) =>
        body.trim().startsWith('<') ? mm : `<li${attrs}><p>${body}</p></li>`);
      html += listHtml;
      continue;
    }

    // Raw HTML passthrough for a block starting with a tag.
    if (/^\s{0,3}<(?:div|section|figure|details|summary|table|iframe|img|p|span|br|hr)\b/i.test(line)) {
      const buf = [];
      while (i < lines.length && lines[i].trim()) {
        buf.push(lines[i]);
        i += 1;
      }
      html += `${buf.join('\n')}\n`;
      continue;
    }

    // Paragraph
    const para = [];
    while (i < lines.length && lines[i].trim()) {
      const cur = lines[i];
      if (
        HEADING_RE.test(cur) ||
        FENCE_RE.test(cur) ||
        HR_RE.test(cur) ||
        /^\s{0,3}>/.test(cur) ||
        /^:::/.test(cur.trim()) ||
        ((UL_RE.test(cur) || OL_RE.test(cur)) && para.length > 0)
      ) break;
      para.push(cur.trim());
      i += 1;
    }
    if (para.length) {
      const rendered = inline(para.join('\n').replace(/\n/g, ' '), ctx);
      html += `<p>${rendered.html}</p>\n`;
      ctx.text.push(rendered.plain);
    } else {
      i += 1;
    }
  }

  return html;
}

function renderTabs(lines, ctx) {
  const groups = [];
  let current = null;
  for (const line of lines) {
    const m = /^==\s+(.+?)\s*$/.exec(line);
    if (m) {
      current = { label: m[1], lines: [] };
      groups.push(current);
      continue;
    }
    if (current) current.lines.push(line);
  }
  if (!groups.length) return '';

  const id = `tabs-${ctx.tabCounter++}`;
  let head = `<div class="tabs" id="${id}"><div class="tabs-list" role="tablist">`;
  let body = '';
  groups.forEach((group, idx) => {
    const active = idx === 0;
    head +=
      `<button type="button" role="tab" class="tab${active ? ' is-active' : ''}" ` +
      `id="${id}-t${idx}" aria-controls="${id}-p${idx}" aria-selected="${active}"` +
      `${active ? '' : ' tabindex="-1"'}>${escapeHtml(group.label)}</button>`;
    body +=
      `<div class="tab-panel" role="tabpanel" id="${id}-p${idx}" aria-labelledby="${id}-t${idx}"` +
      `${active ? '' : ' hidden'}>${renderBlocks(group.lines, ctx)}</div>`;
  });
  head += '</div>';
  return `${head}<div class="tabs-panels">${body}</div></div>\n`;
}

// --- Public API -------------------------------------------------------------

export function renderMarkdown(body, { lineBase = 0 } = {}) {
  const ctx = {
    headings: [],
    links: [],
    codeBlocks: [],
    text: [],
    slugCounts: new Map(),
    exampleCounter: 0,
    tabCounter: 0,
    liveExamples: 0,
    lineBase,
    blockStartLine: lineBase,
    line: lineBase,
  };
  const html = renderBlocks(body.split('\n'), ctx);
  return {
    html,
    headings: ctx.headings,
    links: ctx.links,
    codeBlocks: ctx.codeBlocks,
    text: ctx.text.join(' ').replace(/\s+/g, ' ').trim(),
    liveExamples: ctx.liveExamples,
  };
}
