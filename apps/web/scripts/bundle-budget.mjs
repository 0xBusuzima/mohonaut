/* global URL, console, process */
// Bundle budget (docs/06 4.5): the JavaScript each page loads up front, brotli-compressed as
// Cloudflare serves it, must stay under its budget. What /play loads after its prerendered
// frame (wallets, wagmi, the pixel game) is measured in a browser: e2e/site.spec.ts. Run after build.
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { brotliCompressSync, constants } from 'node:zlib';

const out = fileURLToPath(new URL('../out/', import.meta.url));
const KB = 1024;
// Players' pages: 150 KB. The design sandbox (/design/, out of search and not for players) shows
// the whole game HUD over the site for reviewing art, so it gets more room. (Until 2026-10-13
// the legacy polyfill below was counted too, and the budgets were 180 and 220 KB.)
const BUDGET = { page: 150 * KB, sandbox: 190 * KB };
const budgetOf = (route) => (route.startsWith('/design') ? BUDGET.sandbox : BUDGET.page);

const sizeCache = new Map();
function brotli(file) {
  if (!sizeCache.has(file)) {
    const body = readFileSync(file);
    sizeCache.set(
      file,
      brotliCompressSync(body, { params: { [constants.BROTLI_PARAM_QUALITY]: 11 } }).length,
    );
  }
  return sizeCache.get(file);
}

function pages(dir) {
  return readdirSync(dir).flatMap((e) => {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) return e === '_next' ? [] : pages(p);
    return e === 'index.html' ? [p] : [];
  });
}

// Next's legacy polyfills come as a `noModule` script: browsers that run modules never fetch it.
const scriptsOf = (html) =>
  [...html.matchAll(/<script([^>]*)\ssrc="([^"]+\.js)"([^>]*)>/g)]
    .filter((m) => !/nomodule/i.test(`${m[1]} ${m[3]}`))
    .map((m) => join(out, m[2] ?? ''));

let failed = false;
const report = [];
for (const page of pages(out)) {
  const route = `/${relative(out, page).split(sep).slice(0, -1).join('/')}`;
  const total = scriptsOf(readFileSync(page, 'utf8')).reduce((s, f) => s + brotli(f), 0);
  const over = total > budgetOf(route);
  failed ||= over;
  report.push([route, total, over]);
}

for (const [route, total, over] of report.sort((a, b) => b[1] - a[1])) {
  console.log(
    `${route.padEnd(16)} ${(total / KB).toFixed(1).padStart(6)} KB${over ? '  OVER BUDGET' : ''}`,
  );
}
console.log(
  `budget per page: ${BUDGET.page / KB} KB brotli (design sandbox ${BUDGET.sandbox / KB} KB)`,
);
process.exit(failed ? 1 : 0);
