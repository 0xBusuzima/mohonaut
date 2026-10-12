/* global console */
// Writes the rig style sheet brand/sprites/rig-sheet.svg and .png from src/game/rigs.ts: every
// Gen-1 rig, drilling and switched off, on its pad (the same drawing the /play scene uses).
//   node scripts/gen-rig-sheet.ts     (from apps/web; Node 24 runs TypeScript directly)
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Resvg } from '@resvg/resvg-js';
import { GEN1_RIGS } from '../src/lib/catalog.ts';
import { rigShape, rigSvg } from '../src/game/rigs.ts';

const out = join(fileURLToPath(new URL('..', import.meta.url)), '..', '..', 'brand', 'sprites');
const cellW = 140;
const cellH = 130;
const pad = (x: number, y: number) =>
  `<polygon points="${x},${y - 24} ${x + 48},${y} ${x},${y + 24} ${x - 48},${y}" fill="#22272D" stroke="#39414A"/>`;

let cells = '';
GEN1_RIGS.forEach(({ name }, i) => {
  [true, false].forEach((running, row) => {
    const x = 20 + i * cellW + cellW / 2;
    const y = 30 + row * cellH + 92;
    cells += pad(x, y);
    cells += `<g transform="translate(${x} ${y})">${rigSvg(rigShape(i, running))}</g>`;
  });
  cells += `<text x="${20 + i * cellW + cellW / 2}" y="${30 + 2 * cellH + 14}" text-anchor="middle" font-family="sans-serif" font-size="13" fill="#ECE7DC">${name}</text>`;
});
const width = 40 + GEN1_RIGS.length * cellW;
const height = 60 + 2 * cellH + 10;
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><rect width="${width}" height="${height}" fill="#0E1013"/><text x="20" y="22" font-family="sans-serif" font-size="13" fill="#8B939C">Gen-1 rigs, drilling (top) and switched off (bottom). Source: apps/web/src/game/rigs.ts</text>${cells}</svg>\n`;
mkdirSync(out, { recursive: true });
writeFileSync(join(out, 'rig-sheet.svg'), svg);
writeFileSync(
  join(out, 'rig-sheet.png'),
  new Resvg(svg, { fitTo: { mode: 'width', value: width * 2 } }).render().asPng(),
);
console.log(`wrote ${out}`);
