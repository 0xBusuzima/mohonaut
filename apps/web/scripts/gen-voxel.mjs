/* global console, URL, TextEncoder, Buffer */
// Bakes the voxel models (src/game/voxel/models.ts) into isometric sprites in public/voxel
// (lossless WebP, about 40 % smaller than PNG), with the build-time renderer
// (src/game/voxel/render.ts): docs/01 7, the voxel diorama look.
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { crc32, deflateSync } from 'node:zlib';
import { Resvg } from '@resvg/resvg-js';
import sharp from 'sharp';
import { runnerImport } from 'vite';

const web = fileURLToPath(new URL('..', import.meta.url));
/** Files still being encoded; awaited before the script ends. */
const pending = [];
/** Writes an RGBA image as lossless WebP (the colour under fully clear pixels is dropped). */
function writeWebp(file, { width, height, data }) {
  pending.push(
    sharp(Buffer.from(data.buffer, data.byteOffset, data.byteLength), {
      raw: { width, height, channels: 4 },
    })
      .webp({ lossless: true, effort: 6 })
      .toFile(file),
  );
}
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

// Build output only (gitignored): cleared first, so no stale file is ever deployed.
const out = join(web, 'public/voxel');
rmSync(out, { recursive: true, force: true });
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
  writeWebp(join(out, `site-${name}.webp`), image);
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
  // A stopped rig: its lights off.
  bake(`rig-${i}-off`, models.switchedOff(model), 32 / n, [n / 2, n / 2, 1]);
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
// Scrub and rocks for the open land, standing on their footprint's centre.
for (let kind = 0; kind <= 4; kind++)
  bake(`land-${kind}`, models.landPropModel(kind), 2, [2.5, 2.5, 0], 0);
// The crew: two facings and two strides, at 1 art px a voxel, standing on their feet.
for (const facing of ['r', 'l'])
  for (const step of [0, 1])
    bake(`worker-${facing}-${step}`, models.workerModel(facing, step), 1, [1, 1, 0], 1);
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

// ---- Rig portraits for the site and the game's cards (public/rigs): each rig on a soft night
// scene, running (lights on) and stopped, at twice the cards' 300 x 276 CSS size.
const PW = 600;
const PH = 552;
/** A night backdrop: sky gradient, the plain, and a warm pool of light where the rig stands. */
function backdrop() {
  const data = new Uint8ClampedArray(PW * PH * 4);
  const lerp = (a, b, t) => a + (b - a) * t;
  const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const sky = [hex('#0a1022'), hex('#1a2445'), hex('#2c2c50')];
  const land = [hex('#2a2622'), hex('#1f1b18')];
  const horizon = Math.round(PH * 0.52);
  for (let y = 0; y < PH; y++) {
    for (let x = 0; x < PW; x++) {
      let c;
      if (y < horizon) {
        const t = y / horizon;
        c =
          t < 0.6
            ? sky[0].map((v, i) => lerp(v, sky[1][i], t / 0.6))
            : sky[1].map((v, i) => lerp(v, sky[2][i], (t - 0.6) / 0.4));
      } else {
        const t = (y - horizon) / (PH - horizon);
        c = land[0].map((v, i) => lerp(v, land[1][i], t));
        // The lamp pool: an iso ellipse round the rig's foot, warm and soft.
        const dx = (x - PW / 2) / (PW * 0.42);
        const dy = (y - PH * 0.84) / (PH * 0.14);
        const d = Math.hypot(dx, dy);
        const glow = Math.max(0, 1 - d) ** 2 * 0.55;
        c = c.map((v, i) => v + ([255, 200, 120][i] - v) * glow * 0.6);
      }
      const k = (y * PW + x) * 4;
      data[k] = c[0];
      data[k + 1] = c[1];
      data[k + 2] = c[2];
      data[k + 3] = 255;
    }
  }
  // A few stars.
  for (let i = 0; i < 70; i++) {
    const sx = Math.floor(((((Math.sin(i * 12.9898) * 43758.5453) % 1) + 1) % 1) * PW);
    const sy = Math.floor(((((Math.sin(i * 78.233) * 12345.678) % 1) + 1) % 1) * horizon * 0.8);
    const k = (sy * PW + sx) * 4;
    data[k] = data[k + 1] = data[k + 2] = 200;
  }
  return data;
}
/** Lays `img` (RGBA) over `dst` with its point (ax, ay) at (x, y). */
function over(dst, img, x, y, ax, ay) {
  for (let j = 0; j < img.height; j++)
    for (let i = 0; i < img.width; i++) {
      const tx = Math.round(x - ax + i);
      const ty = Math.round(y - ay + j);
      if (tx < 0 || ty < 0 || tx >= PW || ty >= PH) continue;
      const s = (j * img.width + i) * 4;
      const a = img.data[s + 3] / 255;
      if (a === 0) continue;
      const d = (ty * PW + tx) * 4;
      for (let c = 0; c < 3; c++) dst[d + c] = img.data[s + c] * a + dst[d + c] * (1 - a);
    }
}
const rigsOut = join(web, 'public/rigs');
rmSync(rigsOut, { recursive: true, force: true });
mkdirSync(rigsOut, { recursive: true });
const portraits = [];
for (const [i, model] of rigs.entries()) {
  const n = models.PAD_SIZES[i];
  const top = Math.max(...model.entries().map(([, , z]) => z));
  // As large as fits: the pad at most 440 px across, the rig at most 470 px tall.
  const scale = Math.min(440 / (2 * n), 470 / (top + n / 2 + 2));
  for (const [suffix, m] of [
    ['', model],
    ['-off', models.switchedOff(model)],
  ]) {
    const image = voxel.render(m, { scale, bloom: 10, light: LIGHT });
    const [ax, ay] = voxel.anchorOf(image, n / 2, n / 2, 1, scale);
    const data = backdrop();
    over(data, image, PW / 2, PH * 0.84, ax, ay);
    // WebP for the pages; PNG for the brand page's downloads and the share card.
    writeWebp(join(rigsOut, `rig-${i}${suffix}.webp`), { width: PW, height: PH, data });
    const file = png({ width: PW, height: PH, data });
    writeFileSync(join(rigsOut, `rig-${i}${suffix}.png`), file);
    if (suffix === '') portraits[i] = file;
  }
}
console.log(`gen-voxel: ${rigs.length} rig portraits in public/rigs`);

// ---- The training site's share card (public/og-train.png, docs/05 2.9): four rigs along the
// bottom, the title above, Foreman Mo top right (fonts from the repo, OFL).
{
  const require = createRequire(import.meta.url);
  const fontDir = (pkg) => dirname(require.resolve(`${pkg}/package.json`));
  const display = join(
    fontDir('@expo-google-fonts/big-shoulders-display'),
    'BigShouldersDisplay_900Black.ttf',
  );
  const body = join(fontDir('@expo-google-fonts/barlow'), '600SemiBold', 'Barlow_600SemiBold.ttf');
  const { module: mo } = await runnerImport(join(web, '../../packages/sdk/src/art.ts'));
  const W4 = 300;
  const H4 = 276;
  const cards = [1, 2, 3, 4]
    .map(
      (id, i) =>
        `<image x="${i * W4}" y="${630 - H4}" width="${W4}" height="${H4}" href="data:image/png;base64,${Buffer.from(portraits[id]).toString('base64')}"/>`,
    )
    .join('');
  const stripes = Array.from(
    { length: 40 },
    (_, i) =>
      `<polygon points="${i * 40},0 ${i * 40 + 20},0 ${i * 40 + 4},16 ${i * 40 - 16},16" fill="#ffb31a"/>`,
  ).join('');
  const foreman = mo.MO_ART.flatMap((row, y) =>
    [...row].map((ch, x) =>
      ch === '.'
        ? ''
        : `<rect x="${960 + x * 7}" y="${60 + y * 7}" width="7" height="7" fill="${mo.MO_COLORS[ch]}"/>`,
    ),
  ).join('');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
<rect width="1200" height="630" fill="#0d1220"/>
${cards}
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
  console.log('gen-voxel: public/og-train.png');
}

await Promise.all(pending);
console.log(
  `gen-voxel: ${rigs.length} rigs, the site diorama and ${Object.keys(manifest).length} in-game sprites`,
);
