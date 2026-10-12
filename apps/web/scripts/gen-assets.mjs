/* global URL, console */
// Renders the share image and app icons from SVG (brand palette and fonts, docs/05 §2.4–2.5).
//   node scripts/gen-assets.mjs     (from apps/web; commit the PNGs it writes)
// A placeholder mark until the logo is designed (docs/06 8.1).
import { writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Resvg } from '@resvg/resvg-js';

const require = createRequire(import.meta.url);
const font = (pkg, ...path) =>
  join(dirname(require.resolve(`@expo-google-fonts/${pkg}/package.json`)), ...path);
const FONTS = [
  font('big-shoulders-display', 'BigShouldersDisplay_900Black.ttf'),
  font('barlow', '400Regular', 'Barlow_400Regular.ttf'),
];
const web = fileURLToPath(new URL('..', import.meta.url));
const STRATA = [
  '#B08A5E',
  '#D8C8A0',
  '#B79A9A',
  '#7E8288',
  '#4A4444',
  '#6E7D3C',
  '#D2512B',
  '#FFE27A',
];

function png(svg, width) {
  return new Resvg(svg, {
    fitTo: { mode: 'width', value: width },
    font: { fontFiles: FONTS, loadSystemFonts: false, defaultFontFamily: 'Barlow' },
  })
    .render()
    .asPng();
}

/** The app icon: an "M" in Safety Orange over a bore log, on charcoal. `pad` keeps it inside maskable safe zones. */
function icon(pad) {
  const inner = 512 - 2 * pad;
  const band = inner / STRATA.length;
  const bands = STRATA.map(
    (c, i) =>
      `<rect x="${pad + inner * 0.72}" y="${pad + i * band}" width="${inner * 0.16}" height="${band}" fill="${c}"/>`,
  ).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
  <rect width="512" height="512" fill="#16191D"/>
  ${bands}
  <rect x="${pad + inner * 0.68}" y="${pad + inner * 0.3}" width="${inner * 0.24}" height="${inner * 0.02}" fill="#2EE6D6"/>
  <text x="${pad + inner * 0.36}" y="${pad + inner * 0.78}" text-anchor="middle" font-family="Big Shoulders Display" font-weight="900" font-size="${inner * 0.8}" fill="#FF6B1A">M</text>
</svg>`;
}

const og = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <rect width="1200" height="630" fill="#16191D"/>
  ${STRATA.map((c, i) => `<rect x="1060" y="${40 + i * 69}" width="80" height="69" fill="${c}" stroke="#39414A"/>`).join('')}
  <text x="72" y="150" font-family="Big Shoulders Display" font-weight="900" font-size="72" fill="#FF6B1A">MOHONAUT</text>
  <text x="72" y="320" font-family="Big Shoulders Display" font-weight="900" font-size="108" fill="#ECE7DC">NOT THE MOON.</text>
  <text x="72" y="440" font-family="Big Shoulders Display" font-weight="900" font-size="108" fill="#FF6B1A">THE MOHO.</text>
  <text x="72" y="540" font-family="Barlow" font-size="34" fill="#8B939C">An on-chain idle drilling game. One shared bore.</text>
</svg>`;

const out = (name, data) => {
  writeFileSync(join(web, name), data);
  console.log(`wrote ${name}`);
};
out('public/og.png', png(og, 1200));
out('src/app/icon.png', png(icon(40), 512));
out('src/app/apple-icon.png', png(icon(40), 180));
out('public/icon-192.png', png(icon(40), 192));
out('public/icon-512.png', png(icon(40), 512));
out('public/icon-maskable-512.png', png(icon(96), 512));
