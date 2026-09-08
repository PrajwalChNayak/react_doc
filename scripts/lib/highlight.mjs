// Minimal dependency-free syntax highlighter.
//
// It is a hand-written scanner, not a parser. It aims to be *stable* (never
// throws, never loses characters) rather than perfectly accurate: every branch
// either consumes at least one character or falls through to the plain-text
// path, so the concatenated output always equals the escaped input.

const KEYWORDS = new Set([
  'as', 'async', 'await', 'break', 'case', 'catch', 'class', 'const',
  'continue', 'debugger', 'default', 'delete', 'do', 'else', 'enum', 'export',
  'extends', 'finally', 'for', 'from', 'function', 'get', 'if', 'implements',
  'import', 'in', 'instanceof', 'interface', 'keyof', 'let', 'new', 'of',
  'package', 'private', 'protected', 'public', 'readonly', 'return',
  'satisfies', 'set', 'static', 'super', 'switch', 'this', 'throw', 'try',
  'type', 'typeof', 'var', 'void', 'while', 'with', 'yield', 'declare',
  'namespace', 'abstract', 'infer', 'asserts', 'is', 'override',
]);

const LITERALS = new Set(['true', 'false', 'null', 'undefined', 'NaN', 'Infinity']);

const TYPE_WORDS = new Set([
  'string', 'number', 'boolean', 'any', 'unknown', 'never', 'object', 'symbol',
  'bigint',
]);

export function escapeHtml(text) {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function span(cls, text) {
  return `<span class="tok-${cls}">${escapeHtml(text)}</span>`;
}

const IDENT_START = /[A-Za-z_$]/;
const IDENT_PART = /[A-Za-z0-9_$]/;

// --- JavaScript / TypeScript / JSX -----------------------------------------

function highlightJs(src, { jsx = true } = {}) {
  let out = '';
  let i = 0;
  // Depth of JSX tag headers we are currently inside, so attribute names get
  // their own color but expressions inside `{}` fall back to normal rules.
  let inTag = false;
  let braceDepthInTag = 0;
  // Tracks whether a `/` at this position starts a regex or is division.
  let prevSignificant = '';

  const n = src.length;

  const peekBack = () => prevSignificant;

  while (i < n) {
    const ch = src[i];

    // Line comment
    if (ch === '/' && src[i + 1] === '/') {
      let j = src.indexOf('\n', i);
      if (j === -1) j = n;
      out += span('comment', src.slice(i, j));
      i = j;
      continue;
    }

    // Block comment
    if (ch === '/' && src[i + 1] === '*') {
      let j = src.indexOf('*/', i + 2);
      j = j === -1 ? n : j + 2;
      out += span('comment', src.slice(i, j));
      i = j;
      continue;
    }

    // Template literal. Interpolations are highlighted recursively.
    if (ch === '`') {
      let j = i + 1;
      let chunk = '`';
      let done = false;
      while (j < n && !done) {
        const c = src[j];
        if (c === '\\') {
          chunk += src.slice(j, j + 2);
          j += 2;
          continue;
        }
        if (c === '`') {
          chunk += c;
          j += 1;
          done = true;
          break;
        }
        if (c === '$' && src[j + 1] === '{') {
          // Flush the literal part, then recurse into the expression.
          out += span('string', chunk);
          chunk = '';
          let depth = 1;
          let k = j + 2;
          while (k < n && depth > 0) {
            if (src[k] === '{') depth += 1;
            else if (src[k] === '}') depth -= 1;
            if (depth > 0) k += 1;
          }
          out += span('punct', '${');
          out += highlightJs(src.slice(j + 2, k), { jsx });
          out += span('punct', '}');
          j = k + 1;
          continue;
        }
        chunk += c;
        j += 1;
      }
      if (chunk) out += span('string', chunk);
      i = j;
      prevSignificant = '`';
      continue;
    }

    // Quoted string
    if (ch === '"' || ch === "'") {
      let j = i + 1;
      while (j < n) {
        if (src[j] === '\\') { j += 2; continue; }
        if (src[j] === ch) { j += 1; break; }
        if (src[j] === '\n') break;
        j += 1;
      }
      out += span('string', src.slice(i, j));
      i = j;
      prevSignificant = 'str';
      continue;
    }

    // JSX / HTML-ish tag header
    if (jsx && ch === '<' && !inTag) {
      const m = /^<\/?[A-Za-z][A-Za-z0-9._:-]*/.exec(src.slice(i));
      if (m) {
        out += span('tag', m[0]);
        i += m[0].length;
        inTag = true;
        braceDepthInTag = 0;
        continue;
      }
    }

    if (inTag) {
      if (braceDepthInTag === 0) {
        if (ch === '>' || (ch === '/' && src[i + 1] === '>')) {
          const t = ch === '>' ? '>' : '/>';
          out += span('tag', t);
          i += t.length;
          inTag = false;
          prevSignificant = '>';
          continue;
        }
        // Attribute name
        if (IDENT_START.test(ch)) {
          let j = i;
          while (j < n && (IDENT_PART.test(src[j]) || src[j] === '-' || src[j] === ':')) j += 1;
          const word = src.slice(i, j);
          const after = src.slice(j).match(/^\s*=/);
          out += span(after ? 'attr' : 'attr', word);
          i = j;
          continue;
        }
        if (ch === '{') {
          braceDepthInTag = 1;
          out += span('punct', '{');
          i += 1;
          continue;
        }
      } else {
        // Inside a JSX expression container: highlight the contents normally by
        // finding the matching brace and recursing.
        let depth = 1;
        let k = i;
        while (k < n && depth > 0) {
          const c = src[k];
          if (c === '"' || c === "'" || c === '`') {
            const q = c;
            k += 1;
            while (k < n) {
              if (src[k] === '\\') { k += 2; continue; }
              if (src[k] === q) break;
              k += 1;
            }
          } else if (c === '{') depth += 1;
          else if (c === '}') { depth -= 1; if (depth === 0) break; }
          k += 1;
        }
        out += highlightJs(src.slice(i, k), { jsx });
        out += span('punct', '}');
        i = k + 1;
        braceDepthInTag = 0;
        continue;
      }
    }

    // Number
    if (/[0-9]/.test(ch) || (ch === '.' && /[0-9]/.test(src[i + 1] || ''))) {
      const m = /^(?:0[xXbBoO][0-9a-fA-F_]+n?|[0-9][0-9_]*(?:\.[0-9_]*)?(?:[eE][+-]?[0-9]+)?n?)/.exec(src.slice(i));
      if (m) {
        out += span('number', m[0]);
        i += m[0].length;
        prevSignificant = 'num';
        continue;
      }
    }

    // Identifier / keyword
    if (IDENT_START.test(ch)) {
      let j = i;
      while (j < n && IDENT_PART.test(src[j])) j += 1;
      const word = src.slice(i, j);
      const rest = src.slice(j);
      let cls;
      if (KEYWORDS.has(word)) cls = 'keyword';
      else if (LITERALS.has(word)) cls = 'literal';
      else if (TYPE_WORDS.has(word)) cls = 'type';
      else if (/^[A-Z]/.test(word)) cls = 'type';
      else if (/^\s*\(/.test(rest)) cls = 'fn';
      else if (/^use[A-Z]/.test(word)) cls = 'fn';
      else cls = 'plain';
      out += cls === 'plain' ? escapeHtml(word) : span(cls, word);
      i = j;
      prevSignificant = word;
      continue;
    }

    // Regex literal (only where a value can start)
    if (ch === '/') {
      const p = peekBack();
      const canBeRegex = p === '' || KEYWORDS.has(p) ||
        /[({[,;:=!&|?+\-*%~^<>]$/.test(p) || p === 'return' || p === '=>';
      if (canBeRegex) {
        let j = i + 1;
        let ok = false;
        let inClass = false;
        while (j < n) {
          const c = src[j];
          if (c === '\\') { j += 2; continue; }
          if (c === '\n') break;
          if (c === '[') inClass = true;
          else if (c === ']') inClass = false;
          else if (c === '/' && !inClass) { ok = true; j += 1; break; }
          j += 1;
        }
        if (ok) {
          while (j < n && /[dgimsuvy]/.test(src[j])) j += 1;
          out += span('regexp', src.slice(i, j));
          i = j;
          prevSignificant = 'regex';
          continue;
        }
      }
    }

    // Arrow
    if (ch === '=' && src[i + 1] === '>') {
      out += span('keyword', '=>');
      i += 2;
      prevSignificant = '=>';
      continue;
    }

    if (/[{}()[\];,.:?!<>=+\-*/%&|^~]/.test(ch)) {
      out += span('punct', ch);
      i += 1;
      prevSignificant = ch;
      continue;
    }

    out += escapeHtml(ch);
    i += 1;
  }

  return out;
}

// --- Shell ------------------------------------------------------------------

function highlightBash(src) {
  return src
    .split('\n')
    .map((line) => {
      if (/^\s*#/.test(line)) return span('comment', line);
      let out = '';
      let rest = line;
      const lead = /^\s*/.exec(rest)[0];
      out += escapeHtml(lead);
      rest = rest.slice(lead.length);
      const cmd = /^[a-zA-Z_][\w.-]*/.exec(rest);
      if (cmd) {
        out += span('fn', cmd[0]);
        rest = rest.slice(cmd[0].length);
      }
      out += rest.replace(
        /("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')|(\s--?[\w-]+)|(#.*$)/g,
        (m, str, flag, comment) => {
          if (str) return span('string', str);
          if (flag) return span('attr', flag);
          if (comment) return span('comment', comment);
          return escapeHtml(m);
        },
      );
      return out;
    })
    .join('\n');
}

// --- JSON -------------------------------------------------------------------

function highlightJson(src) {
  let out = '';
  let i = 0;
  while (i < src.length) {
    const ch = src[i];
    if (ch === '"') {
      let j = i + 1;
      while (j < src.length) {
        if (src[j] === '\\') { j += 2; continue; }
        if (src[j] === '"') { j += 1; break; }
        j += 1;
      }
      const text = src.slice(i, j);
      const isKey = /^\s*:/.test(src.slice(j));
      out += span(isKey ? 'attr' : 'string', text);
      i = j;
      continue;
    }
    if (/[0-9-]/.test(ch)) {
      const m = /^-?[0-9]+(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?/.exec(src.slice(i));
      if (m) { out += span('number', m[0]); i += m[0].length; continue; }
    }
    const lit = /^(true|false|null)/.exec(src.slice(i));
    if (lit) { out += span('literal', lit[0]); i += lit[0].length; continue; }
    if (/[{}[\],:]/.test(ch)) { out += span('punct', ch); i += 1; continue; }
    out += escapeHtml(ch);
    i += 1;
  }
  return out;
}

// --- CSS --------------------------------------------------------------------

function highlightCss(src) {
  return src.replace(
    /(\/\*[\s\S]*?\*\/)|("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')|(--[\w-]+)|(@[\w-]+)|([\w-]+)(\s*:)|([{}();,])/g,
    (m, comment, str, custom, at, prop, colon, punct) => {
      if (comment) return span('comment', comment);
      if (str) return span('string', str);
      if (custom) return span('attr', custom);
      if (at) return span('keyword', at);
      if (prop && colon) return span('attr', prop) + span('punct', colon);
      if (punct) return span('punct', punct);
      return escapeHtml(m);
    },
  );
}

// --- HTML -------------------------------------------------------------------

function highlightHtml(src) {
  return src.replace(
    /(<!--[\s\S]*?-->)|(<\/?[A-Za-z][\w:-]*)|([\w:-]+)(=)("(?:[^"]*)"|'(?:[^']*)')|(\/?>)/g,
    (m, comment, tagOpen, attr, eq, val, tagClose) => {
      if (comment) return span('comment', comment);
      if (tagOpen) return span('tag', tagOpen);
      if (attr && eq && val) return span('attr', attr) + span('punct', eq) + span('string', val);
      if (tagClose) return span('tag', tagClose);
      return escapeHtml(m);
    },
  );
}

// --- Diff -------------------------------------------------------------------

function highlightDiff(src) {
  return src
    .split('\n')
    .map((line) => {
      if (/^\+\+\+|^---/.test(line)) return span('comment', line);
      if (line.startsWith('+')) return span('diff-add', line);
      if (line.startsWith('-')) return span('diff-del', line);
      if (line.startsWith('@@')) return span('keyword', line);
      return escapeHtml(line);
    })
    .join('\n');
}

const LANG_ALIASES = {
  javascript: 'js', typescript: 'ts', shell: 'bash', sh: 'bash', console: 'bash',
  yml: 'yaml', md: 'markdown',
};

export function highlight(code, language) {
  const lang = LANG_ALIASES[language] || language || 'text';
  try {
    switch (lang) {
      case 'js':
      case 'jsx':
      case 'ts':
      case 'tsx':
        return highlightJs(code, { jsx: lang === 'jsx' || lang === 'tsx' || lang === 'js' });
      case 'json':
        return highlightJson(code);
      case 'bash':
        return highlightBash(code);
      case 'css':
        return highlightCss(code);
      case 'html':
        return highlightHtml(code);
      case 'diff':
        return highlightDiff(code);
      default:
        return escapeHtml(code);
    }
  } catch {
    // Highlighting must never be the reason a build fails.
    return escapeHtml(code);
  }
}

export const SUPPORTED_LANGUAGES = [
  'jsx', 'tsx', 'js', 'ts', 'json', 'bash', 'html', 'css', 'diff', 'text',
];
