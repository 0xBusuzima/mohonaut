/* global URL, process */
// Serves the static export (out/) for the end-to-end and Lighthouse runs, like Cloudflare Pages
// would: brotli for text, long caching for hashed assets, the /s/* rewrite (public/_redirects)
// and the response headers from out/_headers.
import { createReadStream, existsSync, readFileSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { brotliCompressSync } from 'node:zlib';

const root = fileURLToPath(new URL('../out/', import.meta.url));
const port = Number(process.env.PORT ?? 4173);
const types = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain',
  '.ico': 'image/x-icon',
  '.webmanifest': 'application/manifest+json',
};
const COMPRESSIBLE = new Set(['.html', '.js', '.css', '.json', '.svg', '.txt', '.webmanifest']);

/** Cloudflare Pages _headers: a path pattern line, then indented "Name: value" lines. */
function loadHeaders() {
  const file = join(root, '_headers');
  if (!existsSync(file)) return [];
  const rules = [];
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    if (line.trim() === '' || line.trim().startsWith('#')) continue;
    if (!/^\s/.test(line)) {
      const pattern = line
        .trim()
        .replace(/[.+?^${}()|[\]\\]/g, '\\$&')
        .replace(/\*/g, '.*');
      rules.push({ re: new RegExp(`^${pattern}$`), headers: {} });
    } else {
      const at = line.indexOf(':');
      const rule = rules.at(-1);
      if (rule !== undefined && at > 0)
        rule.headers[line.slice(0, at).trim()] = line.slice(at + 1).trim();
    }
  }
  return rules;
}
const headerRules = loadHeaders();

/** Compressed once per file and kept: on-the-fly brotli stalls parallel test runs. */
const compressed = new Map();
function brotli(file) {
  if (!compressed.has(file)) compressed.set(file, brotliCompressSync(readFileSync(file)));
  return compressed.get(file);
}

// public/_redirects: the 301/302 lines (the /s/* rewrite is handled below).
const redirects = new Map(
  existsSync(join(root, '_redirects'))
    ? readFileSync(join(root, '_redirects'), 'utf8')
        .split('\n')
        .map((l) => l.trim().split(/\s+/))
        .filter(([from, , code]) => from?.startsWith('/') && (code === '301' || code === '302'))
        .map(([from, to, code]) => [from, { to, code: Number(code) }])
    : [],
);

createServer((req, res) => {
  const urlPath = new URL(req.url ?? '/', 'http://x').pathname;
  const moved = redirects.get(urlPath);
  if (moved !== undefined) {
    res.writeHead(moved.code, { location: moved.to }).end();
    return;
  }
  const path = normalize(decodeURIComponent(urlPath));
  let file = join(root, path);
  if (!file.startsWith(root) && file + sep !== root) {
    res.writeHead(403).end();
    return;
  }
  if (existsSync(file) && statSync(file).isDirectory()) file = join(file, 'index.html');
  // public/_redirects: every /s/<address> is served by the one profile page.
  if (!existsSync(file) && path.split(sep).join('/').startsWith('/s/')) {
    file = join(root, 's', 'index.html');
  }
  const found = existsSync(file);
  if (!found) file = join(root, '404.html');
  const ext = extname(file);
  const headers = { 'content-type': types[ext] ?? 'application/octet-stream' };
  for (const rule of headerRules) if (rule.re.test(urlPath)) Object.assign(headers, rule.headers);
  const useBrotli =
    COMPRESSIBLE.has(ext) && /\bbr\b/.test(String(req.headers['accept-encoding'] ?? ''));
  if (useBrotli) headers['content-encoding'] = 'br';
  res.writeHead(found ? 200 : 404, headers);
  if (useBrotli) res.end(brotli(file));
  else createReadStream(file).pipe(res);
}).listen(port, '127.0.0.1');
