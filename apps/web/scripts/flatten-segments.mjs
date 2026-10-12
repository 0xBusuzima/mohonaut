/* global URL, console */
// Next 16's static export writes route-segment prefetch files as folders
// (docs/economy/__next.docs/economy/__PAGE__.txt) while the client requests them dot-joined
// (docs/economy/__next.docs.economy.__PAGE__.txt). Static hosts (Cloudflare Pages) serve files
// as they are, so every prefetch would 404. This adds the dot-joined copies after `next build`.
import { copyFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const out = fileURLToPath(new URL('../out/', import.meta.url));
let copied = 0;

function walk(dir) {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (!statSync(path).isDirectory()) continue;
    if (entry.startsWith('__next.')) flatten(dir, path);
    else walk(path);
  }
}

function flatten(base, dir) {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) {
      flatten(base, path);
      continue;
    }
    const target = join(base, relative(base, path).split(sep).join('.'));
    if (!existsSync(target)) {
      copyFileSync(path, target);
      copied += 1;
    }
  }
}

walk(out);
console.log(`flatten-segments: ${copied} prefetch file(s) added`);
