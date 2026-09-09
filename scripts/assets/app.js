/* React 19 Documentation — client runtime.
   No dependencies. Everything degrades to a usable static page if this fails. */

(() => {
  'use strict';

  const root = document.documentElement;
  const BASE = root.getAttribute('data-base') || './';
  const REACT_VERSION = root.getAttribute('data-react-version') || '19.2.8';

  const $ = (sel, ctx = document) => ctx.querySelector(sel);
  const $$ = (sel, ctx = document) => Array.from(ctx.querySelectorAll(sel));

  // Declared up here because applyTheme() broadcasts to live previews, and it
  // runs during initialisation — before the example code further down. (Also
  // avoids shadowing window.frames.)
  const previewFrames = new Map();

  /* ---------------------------------------------------------------- theme */

  const THEME_KEY = 'react-docs-theme';

  function applyTheme(mode) {
    if (mode === 'system') root.removeAttribute('data-theme');
    else root.setAttribute('data-theme', mode);
    try { localStorage.setItem(THEME_KEY, mode); } catch { /* private mode */ }
    const btn = $('.theme-toggle');
    if (btn) {
      const effective = mode === 'system'
        ? (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
        : mode;
      btn.setAttribute('aria-label', `Theme: ${mode}. Switch to ${nextTheme(mode)}.`);
      btn.setAttribute('title', `Theme: ${mode}`);
      btn.dataset.effective = effective;
    }
    broadcastThemeToPreviews();
  }

  function nextTheme(mode) {
    return mode === 'light' ? 'dark' : mode === 'dark' ? 'system' : 'light';
  }

  function currentTheme() {
    try { return localStorage.getItem(THEME_KEY) || 'system'; } catch { return 'system'; }
  }

  const themeToggle = $('.theme-toggle');
  if (themeToggle) {
    applyTheme(currentTheme());
    themeToggle.addEventListener('click', () => applyTheme(nextTheme(currentTheme())));
  }
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    if (currentTheme() === 'system') applyTheme('system');
  });

  /* ------------------------------------------------------------ navigation */

  const header = $('.site-header');
  const topnav = $('.topnav');
  const menuBtn = $('.menu-btn');
  const backdrop = $('.nav-backdrop');
  const triggers = $$('.topnav-trigger');

  const isCompact = () => window.matchMedia('(max-width: 940px)').matches;

  function panelFor(trigger) {
    return document.getElementById(trigger.getAttribute('aria-controls'));
  }

  function closeMenu(trigger, { restoreFocus = false } = {}) {
    const panel = panelFor(trigger);
    if (!panel) return;
    trigger.setAttribute('aria-expanded', 'false');
    panel.hidden = true;
    if (restoreFocus) trigger.focus();
  }

  function closeAllMenus({ restoreFocus = false } = {}) {
    // Only the menu that was actually open gets focus back — restoring it on
    // every trigger would walk focus to the last one in the bar.
    const wasOpen = triggers.find((t) => t.getAttribute('aria-expanded') === 'true');
    triggers.forEach((t) => closeMenu(t));
    if (restoreFocus && wasOpen) wasOpen.focus();
    if (backdrop && !isCompact()) backdrop.hidden = true;
  }

  function openMenu(trigger) {
    // On desktop only one dropdown may be open; the compact accordion allows
    // several, because collapsing a section the reader just opened is rude.
    if (!isCompact()) closeAllMenus();
    const panel = panelFor(trigger);
    if (!panel) return;
    trigger.setAttribute('aria-expanded', 'true');
    panel.hidden = false;
    if (!isCompact() && backdrop) backdrop.hidden = false;
    keepPanelOnScreen(panel);
  }

  // A wide panel opened by a right-hand trigger would otherwise run off-screen.
  function keepPanelOnScreen(panel) {
    if (isCompact()) return;
    panel.style.left = '';
    panel.style.right = '';
    const rect = panel.getBoundingClientRect();
    const margin = 12;
    if (rect.right > window.innerWidth - margin) {
      panel.style.left = 'auto';
      panel.style.right = '-0.5rem';
      const after = panel.getBoundingClientRect();
      if (after.left < margin) {
        // Still too wide for the viewport: pin it to the header instead.
        panel.style.right = '';
        panel.style.left = `${margin - panel.parentElement.getBoundingClientRect().left}px`;
      }
    }
  }

  triggers.forEach((trigger) => {
    trigger.addEventListener('click', () => {
      const open = trigger.getAttribute('aria-expanded') === 'true';
      if (open) closeMenu(trigger);
      else openMenu(trigger);
    });

    trigger.addEventListener('keydown', (e) => {
      const i = triggers.indexOf(trigger);
      if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
        if (isCompact()) return;
        e.preventDefault();
        const step = e.key === 'ArrowRight' ? 1 : -1;
        triggers[(i + step + triggers.length) % triggers.length].focus();
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        openMenu(trigger);
        $('.mm-link', panelFor(trigger))?.focus();
      } else if (e.key === 'Escape') {
        closeMenu(trigger, { restoreFocus: true });
      }
    });
  });

  document.addEventListener('click', (e) => {
    if (e.target.closest('.topnav') || e.target.closest('.menu-btn')) return;
    closeAllMenus();
  });

  document.addEventListener('focusin', (e) => {
    if (isCompact()) return;
    if (!e.target.closest('.topnav')) closeAllMenus();
  });

  /* ------------------------------------------------------- compact nav panel */

  function setNavPanel(open) {
    if (!topnav) return;
    topnav.classList.toggle('is-open', open);
    if (menuBtn) menuBtn.setAttribute('aria-expanded', String(open));
    if (backdrop) backdrop.hidden = !open;
    document.body.style.overflow = open ? 'hidden' : '';
    if (open) {
      // Open the section the reader is currently in, so the panel lands useful.
      const active = $('.topnav-trigger[data-active="true"]') || triggers[0];
      if (active) openMenu(active);
      active?.focus({ preventScroll: true });
    } else {
      closeAllMenus();
    }
  }

  if (menuBtn) {
    menuBtn.addEventListener('click', () => setNavPanel(!topnav.classList.contains('is-open')));
  }
  if (backdrop) {
    backdrop.addEventListener('click', () => {
      if (isCompact()) setNavPanel(false);
      else closeAllMenus();
    });
  }
  // Following a link should always dismiss the panel.
  topnav?.addEventListener('click', (e) => {
    if (e.target.closest('a') && isCompact()) setNavPanel(false);
  });

  window.addEventListener('resize', () => {
    if (!isCompact() && topnav?.classList.contains('is-open')) setNavPanel(false);
  });

  /* ------------------------------------------------- header shadow on scroll */

  // A hairline shadow appears only once content is underneath the bar, so the
  // header stays flat and quiet at the top of the page.
  if (header) {
    const onScroll = () => header.classList.toggle('is-stuck', window.scrollY > 4);
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
  }

  /* ------------------------------------------------------------ copy code */

  document.addEventListener('click', async (e) => {
    const btn = e.target.closest('.copy-btn');
    if (!btn) return;
    const block = btn.closest('.code-block');
    const code = block && $('code', block);
    if (!code) return;
    const label = $('.copy-label', btn);
    try {
      await navigator.clipboard.writeText(code.textContent);
    } catch {
      // Fallback for browsers without the async clipboard API.
      const ta = document.createElement('textarea');
      ta.value = code.textContent;
      ta.setAttribute('readonly', '');
      ta.style.cssText = 'position:fixed;opacity:0';
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand('copy'); } catch { /* give up quietly */ }
      ta.remove();
    }
    btn.classList.add('is-copied');
    if (label) label.textContent = 'Copied';
    btn.setAttribute('aria-live', 'polite');
    setTimeout(() => {
      btn.classList.remove('is-copied');
      if (label) label.textContent = 'Copy';
    }, 1600);
  });

  /* ----------------------------------------------------------------- tabs */

  function wireTabs(listSel, tabSel, panelSel) {
    $$(listSel).forEach((list) => {
      const tabs = $$(tabSel, list.closest('.tabs, .example'));
      const panels = $$(panelSel, list.closest('.tabs, .example'));

      const activate = (idx, focus = true) => {
        tabs.forEach((t, i) => {
          const on = i === idx;
          t.classList.toggle('is-active', on);
          t.setAttribute('aria-selected', String(on));
          t.tabIndex = on ? 0 : -1;
          if (panels[i]) panels[i].hidden = !on;
        });
        if (focus) tabs[idx].focus();
        const panel = panels[idx];
        if (panel) panel.dispatchEvent(new CustomEvent('tabshown', { bubbles: true }));
      };

      tabs.forEach((tab, idx) => {
        tab.addEventListener('click', () => activate(idx, false));
        tab.addEventListener('keydown', (e) => {
          let next = null;
          if (e.key === 'ArrowRight') next = (idx + 1) % tabs.length;
          else if (e.key === 'ArrowLeft') next = (idx - 1 + tabs.length) % tabs.length;
          else if (e.key === 'Home') next = 0;
          else if (e.key === 'End') next = tabs.length - 1;
          if (next !== null) { e.preventDefault(); activate(next); }
        });
      });
    });
  }

  wireTabs('.tabs-list', '.tab', '.tab-panel');
  wireTabs('.example-tabs', '.example-tab', '.example-panel');

  /* -------------------------------------------------------- live examples */

  function sandboxDoc(code, theme) {
    const esm = `https://esm.sh/react@${REACT_VERSION}`;
    const esmDom = `https://esm.sh/react-dom@${REACT_VERSION}`;
    const importMap = JSON.stringify({
      imports: {
        react: esm,
        'react/': `${esm}/`,
        'react/jsx-runtime': `${esm}/jsx-runtime`,
        'react/jsx-dev-runtime': `${esm}/jsx-dev-runtime`,
        'react-dom': esmDom,
        'react-dom/': `${esmDom}/`,
        'react-dom/client': `${esmDom}/client`,
      },
    });

    return `<!doctype html>
<html lang="en" data-theme="${theme}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<script type="importmap">${importMap}<\/script>
<style>
  :root { color-scheme: light; --bg:#fff; --fg:#17171a; --muted:#64635f; --bd:#e5e2dc; --accent:#5449c8; }
  html[data-theme="dark"] { color-scheme: dark; --bg:#16161a; --fg:#eceaf0; --muted:#a09eaa; --bd:#26262c; --accent:#a99cf5; }
  * { box-sizing: border-box; }
  body {
    margin: 0; padding: 20px; background: var(--bg); color: var(--fg);
    font: 15px/1.6 ui-sans-serif, -apple-system, "Segoe UI", Roboto, sans-serif;
  }
  button, input, select, textarea { font: inherit; color: inherit; }
  button {
    padding: .4em .8em; border: 1px solid var(--bd); border-radius: 7px;
    background: var(--accent); color: #fff; cursor: pointer; font-weight: 550;
  }
  button:hover { filter: brightness(1.08); }
  button:disabled { opacity: .55; cursor: not-allowed; }
  input, select, textarea {
    padding: .4em .6em; border: 1px solid var(--bd); border-radius: 7px;
    background: var(--bg); color: var(--fg);
  }
  :focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
  ul, ol { padding-left: 1.3em; }
  code, pre { font-family: ui-monospace, "SFMono-Regular", Menlo, Consolas, monospace; font-size: .9em; }
  fieldset { border: 1px solid var(--bd); border-radius: 8px; }
  table { border-collapse: collapse; }
  th, td { border: 1px solid var(--bd); padding: .35em .6em; text-align: left; }
  .__err {
    margin: 0; padding: 12px 14px; border-radius: 8px; white-space: pre-wrap;
    font-family: ui-monospace, Menlo, Consolas, monospace; font-size: 12.5px;
    background: #fdefee; color: #a83232; border: 1px solid #f4cdca;
  }
  html[data-theme="dark"] .__err { background: #2b1414; color: #ef8a84; border-color: #4a2323; }
</style>
</head>
<body>
<div id="root"></div>
<!-- The source must precede the runner below: the runner reads it synchronously. -->
<script type="text/plain" id="example-source">__SOURCE__<\/script>
<script src="https://cdn.jsdelivr.net/npm/@babel/standalone@7.28.4/babel.min.js"><\/script>
<script>
(function () {
  var source = document.getElementById('example-source').textContent;

  function fail(message) {
    var pre = document.createElement('pre');
    pre.className = '__err';
    pre.textContent = message;
    document.getElementById('root').replaceChildren(pre);
    report();
  }

  function report() {
    requestAnimationFrame(function () {
      var h = Math.ceil(document.documentElement.scrollHeight);
      parent.postMessage({ type: 'example-height', height: h }, '*');
    });
  }

  window.addEventListener('error', function (e) {
    fail('Runtime error: ' + (e.message || e.error));
  });
  window.addEventListener('unhandledrejection', function (e) {
    fail('Unhandled rejection: ' + (e.reason && e.reason.message ? e.reason.message : e.reason));
  });

  if (typeof Babel === 'undefined') {
    fail('Could not load the JSX compiler. Check your network connection, then reload.');
    return;
  }

  var compiled;
  try {
    compiled = Babel.transform(source, {
      filename: 'example.jsx',
      presets: [['react', { runtime: 'automatic' }]],
      plugins: [],
      sourceType: 'module',
    }).code;
  } catch (err) {
    fail('Compile error: ' + err.message);
    return;
  }

  var userUrl = URL.createObjectURL(new Blob([compiled], { type: 'text/javascript' }));
  var boot =
    'import App from ' + JSON.stringify(userUrl) + ';\\n' +
    'import { StrictMode, createElement } from "react";\\n' +
    'import { createRoot } from "react-dom/client";\\n' +
    'const el = document.getElementById("root");\\n' +
    'if (typeof App !== "function") { throw new Error("The example must export a default component. Add: export default function Example() { ... }"); }\\n' +
    'createRoot(el, {\\n' +
    '  onUncaughtError(error) { const p = document.createElement("pre"); p.className = "__err"; p.textContent = "Uncaught: " + error.message; el.replaceChildren(p); },\\n' +
    '}).render(createElement(StrictMode, null, createElement(App)));\\n';

  var bootUrl = URL.createObjectURL(new Blob([boot], { type: 'text/javascript' }));
  var s = document.createElement('script');
  s.type = 'module';
  s.src = bootUrl;
  s.onerror = function () { fail('Failed to load React ' + ${JSON.stringify(REACT_VERSION)} + ' from esm.sh.'); };
  document.body.appendChild(s);

  if (window.ResizeObserver) {
    new ResizeObserver(report).observe(document.documentElement);
  } else {
    setInterval(report, 500);
  }
  window.addEventListener('load', report);
  setTimeout(report, 300);

  window.addEventListener('message', function (e) {
    if (e.data && e.data.type === 'set-theme') {
      document.documentElement.setAttribute('data-theme', e.data.theme);
    }
  });
})();
<\/script>
</body>
</html>`.replace('__SOURCE__', code.replace(/<\/script/gi, '<\\/script'));
  }

    function effectiveTheme() {
    const mode = currentTheme();
    if (mode !== 'system') return mode;
    return matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }

  function broadcastThemeToPreviews() {
    previewFrames.forEach((frame) => {
      try { frame.contentWindow.postMessage({ type: 'set-theme', theme: effectiveTheme() }, '*'); } catch { /* not ready */ }
    });
  }

  function mountExample(example) {
    if (example.dataset.mounted) return;
    example.dataset.mounted = 'true';

    const holder = $('.example-preview', example);
    const template = $('.example-source', example);
    if (!holder || !template) return;

    const code = template.content ? template.content.textContent : template.textContent;

    const frame = document.createElement('iframe');
    frame.setAttribute('sandbox', 'allow-scripts');
    frame.setAttribute('title', 'Live example preview');
    frame.setAttribute('loading', 'lazy');
    frame.style.height = '160px';
    frame.srcdoc = sandboxDoc(code, effectiveTheme());

    holder.replaceChildren(frame);
    holder.removeAttribute('data-pending');
    previewFrames.set(example.id, frame);
  }

  window.addEventListener('message', (e) => {
    if (!e.data || e.data.type !== 'example-height') return;
    previewFrames.forEach((frame) => {
      if (frame.contentWindow === e.source) {
        const h = Math.min(Math.max(Number(e.data.height) || 160, 80), 900);
        frame.style.height = `${h}px`;
      }
    });
  });

  const examples = $$('.example');
  if (examples.length) {
    if ('IntersectionObserver' in window) {
      const io = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            if (entry.isIntersecting) {
              mountExample(entry.target);
              io.unobserve(entry.target);
            }
          });
        },
        { rootMargin: '300px 0px' },
      );
      examples.forEach((ex) => io.observe(ex));
    } else {
      examples.forEach(mountExample);
    }

    // Belt and braces: if a reader switches to the Preview tab before the
    // observer has fired, mount immediately rather than leaving a spinner.
    examples.forEach((ex) => {
      ex.addEventListener('tabshown', (e) => {
        if (e.target.dataset.view === 'preview') mountExample(ex);
      });
    });
  }

  /* ------------------------------------------------------------ scrollspy */

  const tocLinks = $$('.toc a');
  if (tocLinks.length) {
    const byId = new Map(tocLinks.map((a) => [a.getAttribute('href').slice(1), a]));
    const targets = $$('.prose :is(h2, h3)[id]').filter((h) => byId.has(h.id));
    let activeId = null;

    const setActive = (id) => {
      if (id === activeId) return;
      activeId = id;
      tocLinks.forEach((a) => a.classList.remove('is-active'));
      const link = byId.get(id);
      if (link) {
        link.classList.add('is-active');
        const box = link.closest('.toc');
        if (box && box.scrollHeight > box.clientHeight) {
          const lr = link.getBoundingClientRect();
          const br = box.getBoundingClientRect();
          if (lr.top < br.top || lr.bottom > br.bottom) {
            link.scrollIntoView({ block: 'nearest' });
          }
        }
      }
    };

    const pick = () => {
      const top = (parseFloat(getComputedStyle(root).getPropertyValue('--h-header')) || 3.75) * 16 + 24;
      let current = targets[0];
      for (const el of targets) {
        if (el.getBoundingClientRect().top <= top) current = el;
        else break;
      }
      // At the very bottom of the page, favor the last heading.
      if (window.innerHeight + window.scrollY >= document.body.scrollHeight - 8) {
        current = targets[targets.length - 1];
      }
      if (current) setActive(current.id);
    };

    let ticking = false;
    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => { pick(); ticking = false; });
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll, { passive: true });
    pick();
  }

  /* --------------------------------------------------------------- search */

  const overlay = $('.search-overlay');
  const input = $('.search-input');
  const results = $('.search-results');
  const hint = $('.search-hint');
  let index = null;
  let indexPromise = null;
  let activeIndex = -1;
  let lastFocused = null;

  function loadIndex() {
    if (indexPromise) return indexPromise;
    indexPromise = fetch(`${BASE}search-index.json`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((data) => { index = data; return data; })
      .catch(() => { index = []; return []; });
    return indexPromise;
  }

  function openSearch() {
    if (!overlay) return;
    lastFocused = document.activeElement;
    overlay.hidden = false;
    document.body.style.overflow = 'hidden';
    loadIndex().then(() => { if (input && input.value) render(input.value); });
    if (input) { input.value = ''; input.focus(); }
    render('');
  }

  function closeSearch() {
    if (!overlay || overlay.hidden) return;
    overlay.hidden = true;
    document.body.style.overflow = '';
    if (lastFocused && lastFocused.focus) lastFocused.focus();
  }

  function escapeHtml(s) {
    return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  }

  function snippet(text, terms) {
    if (!text) return '';
    const lower = text.toLowerCase();
    let at = -1;
    for (const t of terms) {
      const i = lower.indexOf(t);
      if (i !== -1 && (at === -1 || i < at)) at = i;
    }
    const start = at === -1 ? 0 : Math.max(0, at - 60);
    const raw = text.slice(start, start + 220);
    let out = escapeHtml((start > 0 ? '…' : '') + raw + (start + 220 < text.length ? '…' : ''));
    for (const t of terms) {
      if (t.length < 2) continue;
      out = out.replace(
        new RegExp(`(${t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi'),
        '<mark>$1</mark>',
      );
    }
    return out;
  }

  function score(entry, terms) {
    let total = 0;
    const title = entry.t.toLowerCase();
    const desc = (entry.d || '').toLowerCase();
    const heads = (entry.h || []).join(' · ').toLowerCase();
    const body = (entry.b || '').toLowerCase();

    for (const term of terms) {
      let hit = 0;
      if (title === term) hit += 200;
      if (title.startsWith(term)) hit += 90;
      if (title.includes(term)) hit += 60;
      if (desc.includes(term)) hit += 22;
      if (heads.includes(term)) hit += 18;
      if (body.includes(term)) hit += 6;
      if (hit === 0) return 0;
      total += hit;
    }
    return total;
  }

  function render(query) {
    if (!results) return;
    const q = query.trim().toLowerCase();
    activeIndex = -1;

    if (!q) {
      results.innerHTML = '';
      if (hint) hint.hidden = false;
      return;
    }
    if (hint) hint.hidden = true;
    if (!index) {
      results.innerHTML = '<li class="search-empty">Loading index&hellip;</li>';
      return;
    }

    const terms = q.split(/\s+/).filter(Boolean);
    const matches = index
      .map((entry) => ({ entry, s: score(entry, terms) }))
      .filter((m) => m.s > 0)
      .sort((a, b) => b.s - a.s)
      .slice(0, 25);

    if (!matches.length) {
      results.innerHTML = `<li class="search-empty">No results for &ldquo;${escapeHtml(query)}&rdquo;.</li>`;
      return;
    }

    results.innerHTML = matches
      .map(({ entry }, i) => {
        const headMatch = (entry.h || []).find((h) => terms.some((t) => h.toLowerCase().includes(t)));
        const body = snippet(entry.b || entry.d || '', terms);
        return (
          `<li class="search-result${i === 0 ? ' is-active' : ''}" role="option">` +
          `<a href="${BASE}${escapeHtml(entry.u)}">` +
          `<span class="search-result-group">${escapeHtml(entry.g)}${headMatch ? ` › ${escapeHtml(headMatch)}` : ''}</span>` +
          `<span class="search-result-title">${escapeHtml(entry.t)}</span>` +
          `<span class="search-result-snippet">${body}</span>` +
          `</a></li>`
        );
      })
      .join('');
    activeIndex = 0;
  }

  function move(delta) {
    const items = $$('.search-result', results);
    if (!items.length) return;
    items[activeIndex]?.classList.remove('is-active');
    activeIndex = (activeIndex + delta + items.length) % items.length;
    const el = items[activeIndex];
    el.classList.add('is-active');
    el.scrollIntoView({ block: 'nearest' });
  }

  $$('.search-trigger').forEach((btn) => btn.addEventListener('click', openSearch));
  $('.search-close')?.addEventListener('click', closeSearch);
  overlay?.addEventListener('mousedown', (e) => { if (e.target === overlay) closeSearch(); });

  input?.addEventListener('input', () => {
    loadIndex().then(() => render(input.value));
    render(input.value);
  });

  document.addEventListener('keydown', (e) => {
    const typingTarget = /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName) || e.target.isContentEditable;

    if ((e.key === 'k' || e.key === 'K') && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      overlay && overlay.hidden ? openSearch() : closeSearch();
      return;
    }
    if (e.key === '/' && !typingTarget && !e.metaKey && !e.ctrlKey && !e.altKey) {
      e.preventDefault();
      openSearch();
      return;
    }
    if (!overlay || overlay.hidden) {
      if (e.key === 'Escape') {
        if (topnav?.classList.contains('is-open')) setNavPanel(false);
        else closeAllMenus({ restoreFocus: true });
      }
      return;
    }
    if (e.key === 'Escape') { e.preventDefault(); closeSearch(); return; }
    if (e.key === 'ArrowDown') { e.preventDefault(); move(1); return; }
    if (e.key === 'ArrowUp') { e.preventDefault(); move(-1); return; }
    if (e.key === 'Enter') {
      const link = $('.search-result.is-active a', results);
      if (link) { e.preventDefault(); window.location.href = link.href; }
      return;
    }
    if (e.key === 'Tab') {
      // Keep focus inside the dialog.
      const focusables = $$('a, button, input', overlay).filter((el) => el.offsetParent !== null);
      if (!focusables.length) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  });

  // Warm the index once the page is idle, so the first search feels instant.
  if ('requestIdleCallback' in window) requestIdleCallback(() => loadIndex(), { timeout: 4000 });
  else setTimeout(loadIndex, 2500);
})();
