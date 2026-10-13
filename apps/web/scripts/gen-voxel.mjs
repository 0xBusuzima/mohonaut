/* global console, URL, TextEncoder */
// Bakes the voxel models (src/game/voxel/models.ts) into isometric PNG sprites in public/voxel,
// with the build-time renderer (src/game/voxel/render.ts): docs/01 7, the voxel diorama look.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { crc32, deflateSync } from 'node:zlib';
import { runnerImport } from 'vite';

const web = fileURLToPath(new URL('..', import.meta.url));
const { module: voxel } = await runnerImport(join(web, 'src/game/voxel/render.ts'));
const { module: models } = await runnerImport(join(web, 'src/game/voxel/models.ts'));

function chunk(type, data) {
  const out = new Uint8Array(12 + data.length);
  const view = new DataView(out.buffer);
  view.setUint32(0, data.length);
  out.set(new TextEncoder().encode(type), 4);
  out.set(data, 8);
  view.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)));
  return out;
}

/** An RGBA PNG (colour type 6), no filtering. */
function png({ width, height, data }) {
  const raw = new Uint8Array((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (width * 4 + 1)] = 0;
    raw.set(data.subarray(y * width * 4, (y + 1) * width * 4), y * (width * 4 + 1) + 1);
  }
  const header = new Uint8Array(13);
  const view = new DataView(header.buffer);
  view.setUint32(0, width);
  view.setUint32(4, height);
  header.set([8, 6, 0, 0, 0], 8);
  const parts = [
    new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', new Uint8Array(0)),
  ];
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}

const out = join(web, 'public/voxel');
mkdirSync(out, { recursive: true });
const sprites = { 'rig-rotary': models.rotaryRig(), 'site-diorama': models.siteDiorama() };
for (const [name, model] of Object.entries(sprites)) {
  const image = voxel.render(model, { scale: 3, bloom: 8, light: [-0.6, -0.4, 0.75] });
  writeFileSync(join(out, `${name}.png`), png(image));
  console.log(`gen-voxel: ${name} ${image.width}x${image.height}`);
}
