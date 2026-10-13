/* global URL, console, process */
// Content-Security-Policy for the static export (docs/06 4.5). Next inlines its bootstrap
// scripts and they differ per page, so after `next build` this hashes each page's inline
// scripts and writes the policy into that page as a <meta> tag (first thing in <head>). Policy
// parts a <meta> cannot carry (frame-ancestors) are in public/_headers.
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const CHAIN_RPC = [
  'https://rpc.mainnet.chain.robinhood.com',
  'https://rpc.testnet.chain.robinhood.com',
];
// Wallet connections (WalletConnect / Reown relay, explorer images, verify frame).
const WALLETCONNECT = [
  'https://*.walletconnect.com',
  'https://*.walletconnect.org',
  'wss://*.walletconnect.com',
  'wss://*.walletconnect.org',
  'https://*.reown.com',
  'wss://*.reown.com',
];
const TURNSTILE = 'https://challenges.cloudflare.com';

const origin = (url) => {
  try {
    return url === undefined || url === '' ? null : new URL(url).origin;
  } catch {
    return null;
  }
};

/** The policy for one page, given the hashes of its inline scripts and the build's env. */
export function buildPolicy(hashes, env) {
  const api = origin(env.NEXT_PUBLIC_API_URL);
  const rpc = origin(env.NEXT_PUBLIC_RPC_URL);
  const sentry = origin(env.NEXT_PUBLIC_SENTRY_DSN?.replace(/\/\/[^@]*@/, '//'));
  const list = (...xs) => [...new Set(xs.filter((x) => x !== null && x !== undefined))].join(' ');
  return [
    `default-src 'self'`,
    `script-src ${list("'self'", ...hashes.map((h) => `'${h}'`), TURNSTILE)}`,
    // React style attributes and the wallet modal's runtime styles.
    `style-src 'self' 'unsafe-inline'`,
    `img-src ${list("'self'", 'data:', 'blob:', api, 'https://*.walletconnect.com', 'https://*.reown.com')}`,
    `font-src 'self'`,
    `connect-src ${list("'self'", api, rpc, ...CHAIN_RPC, ...WALLETCONNECT, sentry)}`,
    `frame-src ${list(TURNSTILE, 'https://verify.walletconnect.com', 'https://verify.walletconnect.org')}`,
    `worker-src 'self' blob:`,
    `manifest-src 'self'`,
    `object-src 'none'`,
    `base-uri 'self'`,
    `form-action 'self'`,
  ].join('; ');
}

/** sha256 source expressions for every inline <script> (no src) in an HTML document. */
export function inlineScriptHashes(html) {
  const hashes = [];
  for (const m of html.matchAll(/<script(?![^>]*\ssrc=)[^>]*>([\s\S]*?)<\/script>/g)) {
    const body = m[1] ?? '';
    if (body === '') continue;
    hashes.push(`sha256-${createHash('sha256').update(body, 'utf8').digest('base64')}`);
  }
  return [...new Set(hashes)];
}

/** Puts the policy first in <head>, replacing a policy from an earlier run. */
export function withPolicy(html, policy) {
  const clean = html.replace(/<meta http-equiv="Content-Security-Policy"[^>]*>/, '');
  const meta = `<meta http-equiv="Content-Security-Policy" content="${policy}"/>`;
  return clean.replace(/<head([^>]*)>/, `<head$1>${meta}`);
}

function htmlFiles(dir) {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) return htmlFiles(path);
    return entry.endsWith('.html') ? [path] : [];
  });
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const out = fileURLToPath(new URL('../out/', import.meta.url));
  let pages = 0;
  for (const file of htmlFiles(out)) {
    const html = readFileSync(file, 'utf8');
    writeFileSync(file, withPolicy(html, buildPolicy(inlineScriptHashes(html), process.env)));
    pages++;
  }
  console.log(`csp: policy written into ${pages} page(s)`);
}
