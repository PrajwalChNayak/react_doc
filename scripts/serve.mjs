#!/usr/bin/env node
// Tiny static file server for previewing docs/ locally.
//
//   node scripts/serve.mjs [--port 4173] [--dir docs]
//
// It exists so you can check the built site the way GitHub Pages will serve it.
// Plain Node, no dependencies.

import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

const argv = process.argv.slice(2);
const arg = (name, fallback) => {
  const i = argv.indexOf(`--${name}`);
  return i !== -1 && argv[i + 1] ? argv[i + 1] : fallback;
};

const PORT = Number(arg('port', 4173));
const DIR = path.resolve(ROOT, arg('dir', 'docs'));

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.woff2': 'font/woff2',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
};

async function resolveFile(urlPath) {
  const decoded = decodeURIComponent(urlPath.split('?')[0]);
  const safe = path.normalize(decoded).replace(/^(\.\.[/\\])+/, '');
  let target = path.join(DIR, safe);

  // Refuse to serve outside the directory being hosted.
  if (!target.startsWith(DIR)) return null;

  try {
    const info = await stat(target);
    if (info.isDirectory()) target = path.join(target, 'index.html');
  } catch {
    if (!path.extname(target)) target = `${target}.html`;
  }

  try {
    await stat(target);
    return target;
  } catch {
    return null;
  }
}

const server = createServer(async (req, res) => {
  const file = await resolveFile(req.url || '/');
  if (!file) {
    res.writeHead(404, { 'content-type': 'text/html; charset=utf-8' });
    res.end('<h1>404</h1><p>Not found. Run <code>node scripts/build.mjs</code> first.</p>');
    return;
  }
  try {
    const body = await readFile(file);
    res.writeHead(200, {
      'content-type': TYPES[path.extname(file)] || 'application/octet-stream',
      'cache-control': 'no-cache',
    });
    res.end(body);
  } catch (err) {
    res.writeHead(500, { 'content-type': 'text/plain' });
    res.end(String(err.message));
  }
});

server.listen(PORT, () => {
  console.log(`Serving ${path.relative(ROOT, DIR)}/ at http://localhost:${PORT}/`);
  console.log('Press Ctrl+C to stop.');
});
