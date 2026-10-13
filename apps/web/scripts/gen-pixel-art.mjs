/* global URL, console, Buffer */
// Draws each rig portrait (src/game/pixel/portrait.ts, the code the game itself draws with) once,
// into public/rigs/rig-<id>.png at 3x, for the site pages: pictures, no game code shipped. Then
// the training site's share card (public/og-train.png, docs/05 2.9) from those portraits.
// Runs before `next build`; the PNGs are build output (gitignored), so they never go stale.
import { mkdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { crc32, deflateSync } from 'node:zlib';
import { Resvg } from '@resvg/resvg-js';
import { runnerImport } from 'vite';

const web = fileURLToPath(new URL('..', import.meta.url));
const SCALE = 3;

const { module: art } = await runnerImport(join(web, 'src/game/pixel/portrait.ts'));
const { module: mo } = await runnerImport(join(web, '../../packages/sdk/src/art.ts'));
const { module: catalog } = await runnerImport(join(web, 'src/lib/catalog.ts'));
const RIGS = catalog.GEN1_RIGS.length;
const W = art.PORTRAIT_W;
const H = art.PORTRAIT_H;

function parse(color) {
  const hex = /^#([0-9a-f]{6})$/i.exec(color);
  if (hex) {
    const n = parseInt(hex[1], 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255, 1];
  }
  const rgba = /^rgba?\(([^)]+)\)$/.exec(color);
  if (rgba) {
    const [r, g, b, a = '1'] = rgba[1].split(',').map((s) => s.trim());
    return [Number(r), Number(g), Number(b), Number(a)];
  }
  throw new Error(`gen-pixel-art: unknown colour ${color}`);
}

/** The few canvas calls the pixel art uses (fillStyle, globalAlpha, fillRect), on a buffer. */
function canvas() {
  const rgb = new Float64Array(W * H * 3);
  return {
    rgb,
    fillStyle: '#000000',
    globalAlpha: 1,
    fillRect(x, y, w, h) {
      const [r, g, b, a0] = parse(this.fillStyle);
      const a = a0 * this.globalAlpha;
      for (let j = Math.max(0, y); j < Math.min(H, y + h); j++) {
        for (let i = Math.max(0, x); i < Math.min(W, x + w); i++) {
          const k = (j * W + i) * 3;
          rgb[k] = rgb[k] * (1 - a) + r * a;
          rgb[k + 1] = rgb[k + 1] * (1 - a) + g * a;
          rgb[k + 2] = rgb[k + 2] * (1 - a) + b * a;
        }
      }
    },
  };
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

/** An RGB PNG of the buffer, each art pixel SCALE x SCALE. */
function png(rgb) {
  const w = W * SCALE;
  const h = H * SCALE;
  const raw = Buffer.alloc(h * (1 + w * 3));
  for (let y = 0; y < h; y++) {
    const row = y * (1 + w * 3);
    raw[row] = 0; // no filter
    for (let x = 0; x < w; x++) {
      const k = (Math.floor(y / SCALE) * W + Math.floor(x / SCALE)) * 3;
      for (let ch = 0; ch < 3; ch++) raw[row + 1 + x * 3 + ch] = Math.round(rgb[k + ch]);
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // RGB
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const out = join(web, 'public/rigs');
mkdirSync(out, { recursive: true });
const portraits = [];
for (let id = 0; id < RIGS; id++) {
  const c = canvas();
  art.drawPortrait(c, id, true, 0, false);
  portraits.push(png(c.rgb));
  writeFileSync(join(out, `rig-${id}.png`), portraits[id]);
}

// The share card: four rigs along the bottom, the title above (fonts from the repo, OFL).
const require = createRequire(import.meta.url);
const fontDir = (pkg) => dirname(require.resolve(`${pkg}/package.json`));
const display = join(
  fontDir('@expo-google-fonts/big-shoulders-display'),
  'BigShouldersDisplay_900Black.ttf',
);
const body = join(fontDir('@expo-google-fonts/barlow'), '600SemiBold', 'Barlow_600SemiBold.ttf');
const PW = W * SCALE;
const PH = H * SCALE;
const rigs = [1, 2, 3, 4]
  .map(
    (id, i) =>
      `<image x="${i * PW}" y="${630 - PH}" width="${PW}" height="${PH}" image-rendering="optimizeSpeed" href="data:image/png;base64,${portraits[id].toString('base64')}"/>`,
  )
  .join('');
const stripes = Array.from(
  { length: 40 },
  (_, i) =>
    `<polygon points="${i * 40},0 ${i * 40 + 20},0 ${i * 40 + 4},16 ${i * 40 - 16},16" fill="#ffb31a"/>`,
).join('');
// Foreman Mo, top right, 7 px per art pixel.
const foreman = mo.MO_ART.flatMap((row, y) =>
  [...row].map((ch, x) =>
    ch === '.'
      ? ''
      : `<rect x="${960 + x * 7}" y="${60 + y * 7}" width="7" height="7" fill="${mo.MO_COLORS[ch]}"/>`,
  ),
).join('');
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
<rect width="1200" height="630" fill="#0d1220"/>
${rigs}
<rect width="1200" height="16" fill="#16191d"/>${stripes}
${foreman}
<text x="60" y="96" font-family="Big Shoulders Display" font-weight="900" font-size="40" letter-spacing="3" fill="#ff6b1a">MOHONAUT</text>
<text x="56" y="204" font-family="Big Shoulders Display" font-weight="900" font-size="124" letter-spacing="2" fill="#ece7dc">TRAINING SITE</text>
<text x="60" y="262" font-family="Barlow" font-weight="600" font-size="32" fill="#ece7dc">Try the rig in your browser: no wallet, practice diesel, nothing of value.</text>
<text x="60" y="310" font-family="Barlow" font-weight="600" font-size="30" fill="#2ee6d6">mohonaut.com/train</text>
</svg>`;
const card = new Resvg(svg, {
  font: { fontFiles: [display, body], loadSystemFonts: false, defaultFontFamily: 'Barlow' },
})
  .render()
  .asPng();
writeFileSync(join(web, 'public/og-train.png'), card);
console.log(`gen-pixel-art: ${RIGS} rig portraits in public/rigs, public/og-train.png`);
