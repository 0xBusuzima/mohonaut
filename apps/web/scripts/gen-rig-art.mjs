/* global URL, console, Buffer */
// Draws each rig portrait (src/game/pixel/portrait.ts, the code the game itself draws with) once,
// into public/rigs/rig-<id>.png at 3x, for the site pages: pictures, no game code shipped.
// Runs before `next build`; the PNGs are build output (gitignored), so they never go stale.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { crc32, deflateSync } from 'node:zlib';
import { runnerImport } from 'vite';

const web = fileURLToPath(new URL('..', import.meta.url));
const SCALE = 3;
const RIGS = 6;

const { module: art } = await runnerImport(join(web, 'src/game/pixel/portrait.ts'));
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
  throw new Error(`gen-rig-art: unknown colour ${color}`);
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
for (let id = 0; id < RIGS; id++) {
  const c = canvas();
  art.drawPortrait(c, id, true, 0, false);
  writeFileSync(join(out, `rig-${id}.png`), png(c.rgb));
}
console.log(`gen-rig-art: ${RIGS} portraits in public/rigs`);
