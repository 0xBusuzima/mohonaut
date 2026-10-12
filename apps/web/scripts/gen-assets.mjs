/* global URL, console */
// Rasterizes the brand vectors (brand/, written by tools/brand/gen_brand.py) into the site's
// share image and app icons, and the PNG brand pack (brand/png) for X and the press kit.
//   node scripts/gen-assets.mjs     (from apps/web; commit the PNGs it writes)
// The vectors are paths only (letters converted to outlines), so no fonts are needed here.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Resvg } from '@resvg/resvg-js';

const web = fileURLToPath(new URL('..', import.meta.url));
const brand = join(web, '..', '..', 'brand');

function png(file, width) {
  const svg = readFileSync(join(brand, file), 'utf8');
  return new Resvg(svg, { fitTo: { mode: 'width', value: width } }).render().asPng();
}

const out = (path, data) => {
  writeFileSync(path, data);
  console.log(`wrote ${path}`);
};

// The site.
out(join(web, 'public/og.png'), png('social/og.svg', 1200));
out(join(web, 'src/app/icon.png'), png('social/icon.svg', 512));
out(join(web, 'src/app/apple-icon.png'), png('social/icon.svg', 180));
out(join(web, 'public/icon-192.png'), png('social/icon.svg', 192));
out(join(web, 'public/icon-512.png'), png('social/icon.svg', 512));
out(join(web, 'public/icon-maskable-512.png'), png('social/icon-maskable.svg', 512));

// The brand pack (docs/05 §2.9): X profile images and the logos at 1x and 2x.
mkdirSync(join(brand, 'png'), { recursive: true });
out(join(brand, 'png/x-avatar-400.png'), png('social/x-avatar.svg', 400));
out(join(brand, 'png/x-banner-1500x500.png'), png('social/x-banner.svg', 1500));
out(join(brand, 'png/og-1200x630.png'), png('social/og.svg', 1200));
for (const name of [
  'mohonaut-wordmark',
  'mohonaut-wordmark-on-charcoal',
  'mohonaut-wordmark-black',
  'mohonaut-wordmark-white',
  'mohonaut-lockup-on-charcoal',
]) {
  out(join(brand, `png/${name}.png`), png(`logo/${name}.svg`, 1000));
  out(join(brand, `png/${name}@2x.png`), png(`logo/${name}.svg`, 2000));
}
for (const name of [
  'mohonaut-mark',
  'mohonaut-monogram',
  'mohonaut-monogram-on-charcoal',
  'mohonaut-monogram-black',
  'mohonaut-monogram-white',
]) {
  out(join(brand, `png/${name}.png`), png(`logo/${name}.svg`, 512));
  out(join(brand, `png/${name}@2x.png`), png(`logo/${name}.svg`, 1024));
}
