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
const { module: world } = await runnerImport(join(web, 'src/game/pixel/world.ts'));

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
const LIGHT = [-0.6, -0.4, 0.75];
const rigs = [
  models.pilotRig(),
  models.rotaryRig(),
  models.topDrive(),
  models.diamondCoreDrill(),
  models.turbodrill(),
  models.plasmaBore(),
];
// Large previews (3 px a voxel) for the design pages and the report.
for (const [i, model] of rigs.entries()) {
  const image = voxel.render(model, { scale: 3, bloom: 8, light: LIGHT });
  writeFileSync(join(out, `rig-${i}.png`), png(image));
}
const diorama = voxel.render(models.siteDiorama(), { scale: 3, bloom: 8, light: LIGHT });
writeFileSync(join(out, 'site-diorama.png'), png(diorama));
// In-game sprites: each rig's pad fills the game's 64-pixel pad diamond (scale 32 / pad size),
// anchored at the pad's top centre. The manifest tells the scene where to put each one.
const manifest = {};
for (const [i, model] of rigs.entries()) {
  const n = models.PAD_SIZES[i];
  const scale = 32 / n;
  const image = voxel.render(model, { scale, bloom: 4, light: LIGHT });
  const [ax, ay] = voxel.anchorOf(image, n / 2, n / 2, 1, scale);
  writeFileSync(join(out, `site-rig-${i}.png`), png(image));
  manifest[`rig-${i}`] = {
    w: image.width,
    h: image.height,
    ax: Math.round(ax),
    ay: Math.round(ay),
  };
}
// Site buildings at 2 px a voxel, anchored at their footprint's back corner (the scene's box()).
for (const [name, model] of [
  ['shack', models.shackModel()],
  ['container', models.containerModel()],
]) {
  const image = voxel.render(model, { scale: 2, bloom: 4, light: LIGHT });
  writeFileSync(join(out, `site-${name}.png`), png(image));
  manifest[name] = { w: image.width, h: image.height, ax: image.origin[0], ay: image.origin[1] };
}
// The site's ground for each number of pad rows (3 to 9), at the scene's grid: one cell is
// GROUND_VOXELS voxels of 16 / GROUND_VOXELS pixels; anchored at iso(0, 0) on the surface.
for (let rows = 3; rows <= 9; rows++) {
  const scale = 16 / models.GROUND_VOXELS;
  const image = voxel.render(models.siteGround(world.GW, world.siteDepth(rows)), {
    scale,
    light: LIGHT,
    occlusion: 0.3,
  });
  writeFileSync(join(out, `site-ground-${rows}.png`), png(image));
  manifest[`ground-${rows}`] = {
    w: image.width,
    h: image.height,
    ax: image.origin[0],
    ay: image.origin[1],
  };
}
// Small props at 2 px a voxel, each anchored where the scene's pixel drawing stands.
for (const [name, model, at] of [
  ['pad', models.emptyPad(), [8, 8, 1]],
  ['generator', models.generatorModel(), [0, 0, 0]],
  ['lamp', models.lampModel(), [0.5, 0.5, 0]],
  ['pipes', models.pipeRackModel(), [6, 2, 0]],
]) {
  const image = voxel.render(model, { scale: 2, bloom: 4, light: LIGHT });
  const [ax, ay] = voxel.anchorOf(image, at[0], at[1], at[2], 2);
  writeFileSync(join(out, `site-${name}.png`), png(image));
  manifest[name] = { w: image.width, h: image.height, ax: Math.round(ax), ay: Math.round(ay) };
}
// The tank stands on its centre: anchored at its footprint's middle on the ground.
{
  const image = voxel.render(models.tankModel(), { scale: 2, bloom: 4, light: LIGHT });
  const [ax, ay] = voxel.anchorOf(image, 7, 7, 0, 2);
  writeFileSync(join(out, 'site-tank.png'), png(image));
  manifest.tank = { w: image.width, h: image.height, ax: Math.round(ax), ay: Math.round(ay) };
}
writeFileSync(join(out, 'manifest.json'), JSON.stringify(manifest));
console.log(
  `gen-voxel: ${rigs.length} rigs, the site diorama and ${Object.keys(manifest).length} in-game sprites`,
);
