// Turns an untrusted `next` / `callbackUrl` value into a same-origin path, or
// returns the fallback. Only relative paths survive:
//
//   "/invoices?page=2"     -> "/invoices?page=2"
//   "https://evil.example" -> fallback (absolute URL)
//   "//evil.example"       -> fallback (protocol-relative URL)
//   "/\evil.example"       -> fallback (browsers treat "\" as "/")
//   "/.//evil.example"     -> fallback (normalizes to "//evil.example")
//   "/<TAB>/evil.example"  -> fallback (browsers strip tabs and newlines)
export function safeRedirectPath(value: string | null | undefined, fallback = '/dashboard'): string {
  if (typeof value !== 'string' || value.length === 0 || value.length > 2048) return fallback;

  // Must be a path, and not a protocol-relative URL in disguise.
  if (!value.startsWith('/') || value.startsWith('//') || value.includes('\\')) return fallback;

  // Control characters (tab, CR, LF) are removed by URL parsers, which can
  // turn "/\t/evil.example" into "//evil.example".
  if (/[\x00-\x1f\x7f]/.test(value)) return fallback;

  // Resolve against a placeholder origin. Anything that escapes it is external.
  const base = 'http://same-origin.invalid';
  let url: URL;
  try {
    url = new URL(value, base);
  } catch {
    return fallback;
  }
  if (url.origin !== base) return fallback;

  // Dot segments can normalize into "//host". Re-check after normalization.
  if (url.pathname.startsWith('//')) return fallback;

  return `${url.pathname}${url.search}${url.hash}`;
}
