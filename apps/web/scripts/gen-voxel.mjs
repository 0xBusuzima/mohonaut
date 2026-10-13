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
const LIGHT = [0.2, 0.55, 0.85];
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
// In-game sprites, baked K times denser than the scene's art pixels: the scene draws them at
// screen resolution (scaled down, smoothed), so voxels stay soft at any zoom. The manifest says
// where each one's anchor is (in baked pixels) and its density k.
const K = 4;
const manifest = {};
/** Bakes `model` at `artScale` art pixels a voxel, anchored at voxel point `at` (or its origin). */
function bake(name, model, artScale, at = null, bloomArt = 2, k = K) {
  const scale = artScale * k;
  const image = voxel.render(model, { scale, bloom: bloomArt * k, light: LIGHT });
  const [ax, ay] = at === null ? image.origin : voxel.anchorOf(image, at[0], at[1], at[2], scale);
  writeFileSync(join(out, `site-${name}.png`), png(image));
  manifest[name] = {
    w: image.width,
    h: image.height,
    ax: Math.round(ax),
    ay: Math.round(ay),
    k,
  };
}
// Each rig's pad fills the game's 64-pixel pad diamond (32 / pad size art px a voxel), anchored
// at the pad's top centre.
for (const [i, model] of rigs.entries()) {
  const n = models.PAD_SIZES[i];
  bake(`rig-${i}`, model, 32 / n, [n / 2, n / 2, 1]);
}
// Site buildings anchored at their footprint's back corner (the scene's box()).
bake('shack', models.shackModel(), 2);
bake('container', models.containerModel(), 2);
// The ground and the fence: large and plain, so baked only twice as dense (smaller files).
for (let rows = 3; rows <= 9; rows++)
  bake(
    `ground-${rows}`,
    models.siteGround(world.GW, world.siteDepth(rows)),
    16 / models.GROUND_VOXELS,
    null,
    0,
    2,
  );
bake('fence-back', models.fenceBackModel(world.GW), 16 / models.FENCE_VOXELS, null, 0, 2);
for (let rows = 3; rows <= 9; rows++)
  bake(
    `fence-front-${rows}`,
    models.fenceFrontModel(world.GW, world.siteDepth(rows)),
    16 / models.FENCE_VOXELS,
    null,
    0,
    2,
  );
// Small props, each anchored where the scene's pixel drawing stands.
bake('pad', models.emptyPad(), 2, [8, 8, 1]);
bake('generator', models.generatorModel(), 2);
bake('lamp', models.lampModel(), 2, [0.5, 0.5, 0]);
bake('pipes', models.pipeRackModel(), 2, [6, 2, 0]);
bake('tanker', models.tankerModel(), 2);
bake('tank', models.tankModel(), 2, [7, 7, 0]);
// Yard clutter, each standing on its footprint's centre.
for (const [kind, centre] of [
  ['drums', [3, 3]],
  ['reel', [2.5, 3.5]],
  ['crates', [4, 2]],
  ['cones', [1, 4]],
  ['extinguisher', [0.5, 0.5]],
])
  bake(`clutter-${kind}`, models.clutterModel(kind), 2, [centre[0], centre[1], 0], 1);
// The wellhead with the cuttings of each stratum.
const { module: sdk } = await runnerImport(join(web, '../../packages/sdk/src/depth.ts'));
for (const [i, s] of sdk.STRATA.entries()) bake(`wellhead-${i}`, models.wellheadModel(s.colour), 2);
// Core Collection decor, each standing on its footprint's centre.
for (const [set, centre] of [
  ['fossils', [3, 3]],
  ['cores', [4, 1]],
  ['bits', [4.5, 1.5]],
  ['relics', [3, 3]],
])
  bake(`decor-${set}`, models.decorModel(set), 2, [centre[0], centre[1], 0], 1.5);
writeFileSync(join(out, 'manifest.json'), JSON.stringify(manifest));
console.log(
  `gen-voxel: ${rigs.length} rigs, the site diorama and ${Object.keys(manifest).length} in-game sprites`,
);
