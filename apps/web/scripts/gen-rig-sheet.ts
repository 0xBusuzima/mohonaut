/* global console */
// Writes the rig style sheet brand/sprites/rig-sheet.png from the voxel rig portraits that
// scripts/gen-voxel.mjs renders into public/rigs (run `npm run build` or that script first):
// every Gen-1 rig, drilling (top) and switched off (bottom), with its name.
//   node scripts/gen-rig-sheet.ts     (from apps/web; Node 24 runs TypeScript directly)
import { mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Resvg } from '@resvg/resvg-js';
import sharp from 'sharp';
import { GEN1_RIGS } from '../src/lib/catalog.ts';

const web = fileURLToPath(new URL('..', import.meta.url));
const rigs = join(web, 'public', 'rigs');
const out = join(web, '..', '..', 'brand', 'sprites');
const CELL_W = 300;
const CELL_H = 276;
const LABEL = 44;
const width = CELL_W * GEN1_RIGS.length;
const height = CELL_H * 2 + LABEL;

// The names under the cells, in Barlow from the repo (OFL), drawn by Resvg.
const require = createRequire(import.meta.url);
const barlow = join(
  dirname(require.resolve('@expo-google-fonts/barlow/package.json')),
  '600SemiBold',
  'Barlow_600SemiBold.ttf',
);
const names = GEN1_RIGS.map(
  ({ name }, i) =>
    `<text x="${i * CELL_W + CELL_W / 2}" y="${CELL_H * 2 + 30}" text-anchor="middle" font-family="Barlow" font-size="22" fill="#ECE7DC">${name}</text>`,
).join('');
const labels = new Resvg(
  `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><rect width="${width}" height="${height}" fill="#0E1013"/>${names}</svg>`,
  { font: { fontFiles: [barlow], loadSystemFonts: false, defaultFontFamily: 'Barlow' } },
)
  .render()
  .asPng();

const cells = await Promise.all(
  GEN1_RIGS.flatMap((_, i) =>
    [true, false].map(async (running, row) => ({
      input: await sharp(join(rigs, `rig-${i}${running ? '' : '-off'}.png`))
        .resize(CELL_W, CELL_H)
        .toBuffer(),
      left: i * CELL_W,
      top: row * CELL_H,
    })),
  ),
);
mkdirSync(out, { recursive: true });
await sharp(labels).composite(cells).png().toFile(join(out, 'rig-sheet.png'));
console.log(`wrote ${join(out, 'rig-sheet.png')}`);
