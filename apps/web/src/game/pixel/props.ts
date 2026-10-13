/**
 * Everything that stands on the land: site furniture, rigs, crew, the diesel truck, power poles
 * and the neighbouring sites in the distance. Each function draws at a screen point (iso
 * already applied); none keeps state, animation comes from `t` (seconds).
 */
import { plaqueTier } from '@mohonaut/sdk';
import { rigShape } from '../rigs';
import {
  box,
  diamond,
  diamondEdge,
  ellipse,
  line,
  polygon,
  polyline,
  px,
  rect,
  resolutionOf,
  shade,
  stamp,
} from './draw';
import type { Ctx } from './draw';
import { drawText, textWidth } from './font';
import { P } from './palette';

const TW = 32;
const hex = (n: number) => `#${n.toString(16).padStart(6, '0')}`;

/** A concrete pad slab whose top corner is at (x, y). */
export function padTile(c: Ctx, x: number, y: number, unlocked: boolean, hover: boolean): void {
  const w = TW * 2;
  // A low concrete slab: sides, top, hazard-striped rim.
  box(c, x, y + 2, w, 2, unlocked ? P.padTop : P.padSide, P.padSide, P.padEdge);
  if (unlocked) {
    diamond(c, x, y + 4, w - 12, P.padLight);
    diamond(c, x, y + 7, w - 24, P.padTop);
  }
  // Hazard dashes along the rim.
  const h = w / 2;
  for (let i = 0; i < w / 2; i += 4) {
    const col = (i / 4) % 2 === 0 ? P.hazard : P.hazardDark;
    if (!unlocked && col === P.hazard) continue;
    px(c, x - i, y + i / 2, col);
    px(c, x + i - 1, y + i / 2, col);
    px(c, x - w / 2 + i, y + h / 2 + i / 2, col);
    px(c, x + w / 2 - 1 - i, y + h / 2 + i / 2, col);
  }
  if (hover) diamondEdge(c, x, y, w, P.amber);
}

/**
 * A pad the site has not reached yet, staked out by the surveyors: flagged stakes at its corners
 * with hazard tape between them, and a levelling tripod in the middle (ours; not a padlock sign).
 */
export function surveyPlot(c: Ctx, x: number, y: number): void {
  stamp(c, 'survey', x, y, [-27, -23, 56, 38], paintSurveyPlot);
}

function paintSurveyPlot(c: Ctx, x: number, y: number): void {
  const corners: [number, number][] = [
    [x - 26, y],
    [x, y - 13],
    [x + 26, y],
    [x, y + 13],
  ];
  // Tape: dashes of hazard orange and bone from stake to stake, a little above the ground.
  corners.forEach(([ax, ay], k) => {
    const [bx, by] = corners[(k + 1) % 4] ?? corners[0] ?? [x, y];
    const steps = 26;
    for (let i = 0; i <= steps; i++) {
      const tx = Math.round(ax + ((bx - ax) * i) / steps);
      const ty = Math.round(ay + ((by - ay) * i) / steps) - 4;
      px(c, tx, ty, Math.floor(i / 3) % 2 === 0 ? P.hazard : P.bone);
    }
  });
  // Stakes with orange flagged tips.
  for (const [sx, sy] of corners) {
    rect(c, sx, sy - 7, 1, 7, P.wood);
    rect(c, sx, sy - 9, 2, 2, P.orange);
  }
  // The levelling tripod and its instrument.
  line(c, x - 4, y + 1, x, y - 11, P.woodDark);
  line(c, x + 4, y + 1, x, y - 11, P.woodDark);
  line(c, x, y + 3, x, y - 11, P.woodDark);
  rect(c, x - 2, y - 15, 5, 4, P.amber);
  px(c, x + 2, y - 14, P.night);
}

/** Lamp mast with a sodium head; `on` false during a flicker. */
export function lampPost(c: Ctx, x: number, y: number, on: boolean): void {
  rect(c, x, y - 30, 1, 30, P.steelLight);
  rect(c, x - 3, y - 31, 7, 2, P.steel);
  rect(c, x - 2, y - 29, 5, 1, on ? P.flareHot : P.steel);
  if (on) {
    c.globalAlpha = 0.18;
    polygon(c, [x - 2, y - 28, x + 3, y - 28, x + 10, y - 4, x - 9, y - 4], P.glow);
    c.globalAlpha = 1;
  }
}

export function tank(
  c: Ctx,
  x: number,
  y: number,
  fill: number,
  low: boolean,
  hover: boolean,
  t = 0,
  motion = false,
): void {
  const w = 26;
  const h = 34;
  const top = y - h;
  // Body with vertical shading.
  for (let i = 0; i < w; i++) {
    const col = i < 5 ? P.steelLight : i > w - 7 ? P.graphite : P.steel;
    rect(c, x - w / 2 + i, top + 3, 1, h - 3, col);
  }
  // Rims and top ellipse.
  rect(c, x - w / 2, top + 10, w, 1, P.graphite);
  rect(c, x - w / 2, top + 22, w, 1, P.graphite);
  polygon(
    c,
    [
      x - w / 2,
      top + 3,
      x - 6,
      top,
      x + 6,
      top,
      x + w / 2 - 1,
      top + 3,
      x + 6,
      top + 6,
      x - 6,
      top + 6,
    ],
    P.steelLight,
  );
  // Ladder and stencil band.
  for (let i = 0; i < h - 6; i += 3) rect(c, x - 9, top + 5 + i, 3, 1, P.concrete);
  rect(c, x - w / 2, top + 28, w, 3, P.orange);
  // Hose to the ground.
  polyline(c, [x + w / 2 - 1, top + 26, x + w / 2 + 4, top + 30, x + w / 2 + 6, y], P.graphite);
  tankDressing(c, x, y, fill, low, t, motion);
  if (hover) rect(c, x - w / 2 - 1, top - 1, w + 2, 1, P.amber);
}

/** The tank's live parts, drawn over either tank (pixel or voxel): the gauge and the low lamp. */
export function tankDressing(
  c: Ctx,
  x: number,
  y: number,
  fill: number,
  low: boolean,
  t: number,
  motion: boolean,
): void {
  const top = y - 34;
  // Gauge: a window showing the fill level.
  const gh = 16;
  rect(c, x + 2, top + 9, 5, gh + 2, P.night);
  const f = Math.max(0, Math.min(1, fill));
  const filled = Math.round(gh * f);
  rect(c, x + 3, top + 10 + gh - filled, 3, filled, f < 0.15 ? P.orange : P.amber);
  // A warning lamp on top that blinks red when the diesel runs low.
  if (low) {
    const on = !motion || Math.sin(t * 6) > 0;
    rect(c, x - 2, top - 3, 4, 3, on ? P.beacon : '#6b1d18');
  }
}

export function shack(
  c: Ctx,
  x: number,
  y: number,
  t: number,
  motion: boolean,
  hover: boolean,
  /** The player's crew tag: the flag becomes the crew's, with the tag on it (docs/01 4.7). */
  crewTag?: string,
  /** Season plaques (their ranks), screwed to the wall under the core trays: the best three. */
  plaques: readonly number[] = [],
): void {
  box(c, x, y + 4, 56, 22, P.graphite, P.boneDark, P.concrete);
  // Pitched roof.
  polygon(c, [x - 30, y - 12, x, y - 28, x + 30, y - 12, x, y + 4], P.orangeDark);
  polygon(c, [x - 30, y - 12, x, y + 4, x, y + 6, x - 30, y - 10], P.orange);
  // Door, step and lit window on the right face.
  rect(c, x + 6, y + 12, 6, 14, P.graphite);
  rect(c, x + 5, y + 26, 8, 2, P.concrete);
  rect(c, x + 16, y + 6, 8, 6, P.window);
  rect(c, x + 20, y + 6, 1, 6, P.graphite);
  // Core trays on the left face.
  for (let i = 0; i < 3; i++)
    rect(c, x - 22, y + 6 + i * 4, 14, 2, i === 1 ? P.cyan : P.steelLight);
  // Chimney with steam.
  rect(c, x - 10, y - 28, 4, 8, P.steel);
  shackDressing(c, x, y, t, motion, crewTag, plaques);
  if (hover) diamondEdge(c, x, y - 18, 56, P.amber);
}

/**
 * What the player's progress puts on the shack, drawn over either shack (pixel or voxel): the
 * season plaques on its wall, the chimney's steam and the flag (the crew's, with its tag).
 */
export function shackDressing(
  c: Ctx,
  x: number,
  y: number,
  t: number,
  motion: boolean,
  crewTag?: string,
  plaques: readonly number[] = [],
): void {
  [...plaques]
    .sort((a, b) => a - b)
    .slice(0, 3)
    .forEach((rank, i) => {
      const tier = plaqueTier(rank);
      const [face, shine] =
        tier === 'gold'
          ? [P.amber, P.flareHot]
          : tier === 'silver'
            ? [P.boneDark, P.bone]
            : [P.orangeDark, P.orange];
      const left = x - 23 + i * 6;
      rect(c, left, y + 19, 5, 4, P.graphite);
      rect(c, left + 1, y + 20, 3, 2, face);
      rect(c, left + 1, y + 20, 1, 1, shine);
    });
  if (motion) puff(c, x - 8, y - 32, t, 0);
  if (crewTag === undefined) {
    // Flag on the roof ridge: the casing mark colours, waving.
    rect(c, x + 14, y - 40, 1, 22, P.steelLight);
    for (let k = 0; k < 8; k++) {
      const wave = motion ? Math.round(Math.sin(t * 4 - k * 0.8)) : 0;
      rect(c, x + 15 + k, y - 40 + wave, 1, 5, k < 3 ? P.bone : P.orange);
    }
  } else {
    // The crew flag: a taller pole and the tag on orange cloth; only the free edge flutters.
    const text = crewTag.toUpperCase();
    const w = textWidth(text) + 6;
    rect(c, x + 14, y - 46, 1, 28, P.steelLight);
    for (let k = 0; k < w; k++) {
      const wave = motion && k >= w - 2 ? Math.round(Math.sin(t * 4 - k * 0.8)) : 0;
      rect(c, x + 15 + k, y - 46 + wave, 1, 9, k < 2 ? P.bone : P.orange);
    }
    drawText(c, x + 19, y - 44, text, P.bone, P.orangeDark);
  }
}

export function container(c: Ctx, x: number, y: number, hover: boolean): void {
  box(c, x, y + 8, 64, 20, P.orangeDark, P.orange, P.orangeDark);
  // Corrugation.
  for (let i = 2; i < 30; i += 3)
    line(c, x - 32 + i, y + 4 + i / 2, x - 32 + i, y + 22 + i / 2, P.orangeDark);
  // Open doors with crates inside on the right face.
  polygon(c, [x + 8, y + 14, x + 22, y + 7, x + 22, y + 27, x + 8, y + 34], P.night);
  rect(c, x + 11, y + 22, 5, 5, P.boneDark);
  rect(c, x + 16, y + 20, 4, 4, P.concrete);
  // A sign: a little rig glyph.
  rect(c, x - 8, y - 22, 16, 10, P.charcoal);
  line(c, x - 4, y - 13, x, y - 21, P.orange);
  line(c, x + 4, y - 13, x, y - 21, P.orange);
  if (hover) diamondEdge(c, x, y - 12, 64, P.amber);
}

export function wellhead(
  c: Ctx,
  x: number,
  y: number,
  t: number,
  motion: boolean,
  hover: boolean,
  /** The colour of the stratum the World Bore is coring now: its cuttings pile up by the cellar. */
  stratum?: string,
): void {
  // The World Bore: casing rings seen from above (the brand mark) on a concrete cellar.
  diamond(c, x, y - 4, 40, P.padEdge);
  diamond(c, x, y - 1, 30, P.orange);
  diamond(c, x, y + 2, 22, P.graphite);
  diamond(c, x, y + 4, 16, P.bone);
  diamond(c, x, y + 6, 10, P.graphite);
  const pulse = motion ? Math.sin(t * 2) * 0.5 + 0.5 : 1;
  diamond(c, x, y + 8, 4, pulse > 0.4 ? P.cyan : P.teal);
  // A short flanged spool and valve wheel.
  rect(c, x - 2, y - 6, 4, 10, P.steelLight);
  rect(c, x - 4, y - 7, 8, 2, P.concrete);
  rect(c, x + 3, y - 3, 3, 1, P.amber);
  if (stratum !== undefined) {
    // Cuttings from the stratum being cored, heaped on the cellar's right corner (docs/01 4.6:
    // each stratum brings its own colour to the site).
    const dark = shade(stratum, 0.6);
    rect(c, x + 9, y - 2, 10, 2, dark);
    rect(c, x + 10, y - 4, 8, 2, stratum);
    rect(c, x + 12, y - 6, 4, 2, shade(stratum, 1.2));
    rect(c, x + 11, y - 3, 1, 1, dark);
    rect(c, x + 15, y - 4, 1, 1, dark);
  }
  if (hover) diamondEdge(c, x, y - 4, 40, P.amber);
}

/** Generator set with an exhaust stack. */
export function generator(c: Ctx, x: number, y: number, t: number, motion: boolean): void {
  box(c, x, y + 8, 26, 11, P.steelLight, P.steel, P.graphite);
  for (let i = 0; i < 4; i++) rect(c, x - 10 + i * 3, y + 14 + i * 1.5, 1, 4, P.graphite);
  rect(c, x + 5, y + 1, 2, 7, P.night);
  generatorDressing(c, x, y, t, motion);
}

/** The generator's live parts, over either generator: the run LED and the exhaust. */
export function generatorDressing(c: Ctx, x: number, y: number, t: number, motion: boolean): void {
  rect(c, x - 3, y + 10, 2, 1, motion && Math.sin(t * 6) > 0 ? P.led : P.teal);
  if (motion) puff(c, x + 6, y - 2, t, 0.3);
}

/** A rack of drill pipe lying on two sleepers. */
export function pipeRack(c: Ctx, x: number, y: number): void {
  rect(c, x - 16, y + 6, 3, 3, P.graphite);
  rect(c, x + 10, y + 6, 3, 3, P.graphite);
  for (let i = 0; i < 3; i++) {
    for (let k = 0; k < 3 - i; k++) {
      const yy = y + 4 - i * 2;
      const xx = x - 14 + k * 2 + i;
      line(c, xx, yy, xx + 24, yy + 0, i % 2 === 0 ? P.concrete : P.steelLight);
    }
  }
  for (let k = 0; k < 3; k++) px(c, x - 14 + k * 2, y + 4, P.night);
}

/** One rig standing on its pad centre (x, y); also drawn alone on the market cards. */
export function drawRig(
  c: Ctx,
  x: number,
  y: number,
  typeId: number,
  running: boolean,
  t: number,
  motion: boolean,
  seed: number,
): void {
  const shape = rigShape(typeId, running);
  for (const part of shape.parts) {
    if (part.kind === 'line') {
      const pts = part.points.map((v, i) => (i % 2 === 0 ? x + v : y + v));
      polyline(c, pts, hex(part.color), part.width >= 3 ? 2 : 1);
    } else if (part.kind === 'poly') {
      polygon(
        c,
        part.points.map((v, i) => (i % 2 === 0 ? x + v : y + v)),
        hex(part.fill),
      );
    } else if (part.kind === 'rect') {
      rect(c, x + part.x, y + part.y, part.w, part.h, hex(part.fill));
    } else {
      const lit = !motion || !running || Math.sin(t * 3 + seed) > -0.6;
      rect(c, x + part.x - 1, y + part.y - 1, 2, 2, lit ? hex(part.fill) : P.steel);
    }
  }
  const top = y + shape.steamY + 1;
  // Travelling block on its line inside the mast: it rides up and down while the rig drills.
  if (typeId === 1 || typeId === 2 || typeId === 4) {
    const hi = top + 10;
    const lo = y - 12;
    const k = running && motion ? Math.sin(t * 0.9 + seed) * 0.5 + 0.5 : running ? 0.5 : 1;
    const by = Math.round(hi + (lo - hi) * k);
    rect(c, x, hi - 6, 1, by - hi + 6, P.concrete);
    rect(c, x - 2, by, 4, 3, running ? P.amber : P.steelLight);
  }
  // Aviation beacon at the crown: a short red blink.
  if (running) {
    const on = !motion || (t * 0.9 + seed * 0.17) % 1 < 0.22;
    rect(c, x - 1, top - 2, 2, 2, on ? P.beacon : '#6b1d18');
  }
  if (running && motion) puff(c, x, y + shape.steamY - 2, t, seed);
}

/** Where a rig's crown beacon sits, for its light. */
export function rigTop(typeId: number, x: number, y: number): { x: number; y: number } {
  return { x, y: y + rigShape(typeId, true).steamY - 1 };
}

/** Steam: three pixel puffs rising and fading. */
function puff(c: Ctx, x: number, y: number, t: number, seed: number): void {
  // On a high-resolution canvas (the voxel scene) the steam is soft round puffs.
  const smooth = resolutionOf(c) > 1;
  for (let k = 0; k < 3; k++) {
    const phase = (t * 0.6 + seed * 0.37 + k / 3) % 1;
    const yy = y - phase * 18;
    const xx = x + Math.sin(phase * 6 + seed) * 3;
    const r = 1 + Math.floor(phase * 3);
    c.globalAlpha = 0.45 * (1 - phase);
    if (smooth) {
      c.fillStyle = P.bone;
      c.beginPath();
      c.arc(xx, yy, r * 1.4 + phase * 2, 0, Math.PI * 2);
      c.fill();
    } else rect(c, xx - r, yy - r, r * 2, r * 2, P.bone);
  }
  c.globalAlpha = 1;
}

/**
 * A crew member, feet at (x, y): hard hat with a headlamp, hi-vis vest with a reflective band.
 * `facing` -1 or 1; `step` alternates the legs while walking.
 */
export function worker(c: Ctx, x: number, y: number, facing: number, step: number): void {
  c.globalAlpha = 0.35;
  rect(c, x - 2, y, 5, 1, P.night);
  c.globalAlpha = 1;
  if (step === 0) {
    px(c, x - 1, y - 1, P.trousers);
    px(c, x + 1, y - 1, P.trousers);
  } else {
    px(c, x, y - 1, P.trousers);
    px(c, x + facing, y - 1, P.trousers);
  }
  rect(c, x - 1, y - 2, 3, 1, P.trousers);
  rect(c, x - 1, y - 5, 3, 3, P.vest);
  rect(c, x - 1, y - 4, 3, 1, P.hardHat);
  px(c, x, y - 6, P.skin);
  rect(c, x - 1, y - 7, 3, 1, P.hardHat);
  px(c, x + facing, y - 7, P.flareHot);
}

/** The diesel tanker parked on the road, its cab towards +gx (down and to the right). */
export function truck(c: Ctx, x: number, y: number): void {
  // Three boxes back to front along the road: tank, tank, cab.
  const step = (k: number) => ({ x: x + k * 9, y: y + k * 4.5 });
  for (let k = 0; k < 2; k++) {
    const p = step(k);
    box(c, p.x, p.y, 18, 12, P.boneDark, P.bone, P.concrete);
  }
  // Stencil band and hose reel.
  rect(c, x - 8, y + 9, 16, 2, P.orange);
  rect(c, x + 2, y + 13, 16, 2, P.orange);
  const cab = step(2.4);
  box(c, cab.x, cab.y, 16, 13, P.orangeDark, P.orange, P.orangeDark);
  // Windscreen and headlights on the front (right) face.
  polygon(
    c,
    [cab.x + 1, cab.y - 3, cab.x + 7, cab.y - 6, cab.x + 7, cab.y - 2, cab.x + 1, cab.y + 1],
    P.night,
  );
  px(c, cab.x + 2, cab.y + 7, P.flareHot);
  px(c, cab.x + 6, cab.y + 5, P.flareHot);
  // Wheels.
  for (const k of [0.2, 1.4, 2.6]) {
    const p = step(k);
    rect(c, p.x - 9, p.y + 13, 3, 3, P.night);
    rect(c, p.x + 3, p.y + 15, 3, 3, P.night);
  }
}

/** Front of the truck, for its headlight pool. */
export function truckLights(x: number, y: number): { x: number; y: number } {
  return { x: x + 2.4 * 9 + 22, y: y + 2.4 * 4.5 + 16 };
}

/** A wooden power pole, foot at (x, y); gives back where the wire hangs. */
export function pole(c: Ctx, x: number, y: number): { x: number; y: number } {
  rect(c, x, y - 26, 2, 26, P.pole);
  rect(c, x - 4, y - 24, 10, 1, P.pole);
  px(c, x - 4, y - 25, P.concrete);
  px(c, x + 5, y - 25, P.concrete);
  return { x: x + 1, y: y - 25 };
}

/** A sagging wire between two pole tops. */
export function wire(c: Ctx, a: { x: number; y: number }, b: { x: number; y: number }): void {
  const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 + 4 };
  polyline(
    c,
    [
      a.x,
      a.y,
      (a.x + mid.x) / 2,
      (a.y + mid.y) / 2 + 1,
      mid.x,
      mid.y,
      (mid.x + b.x) / 2,
      (mid.y + b.y) / 2 + 1,
      b.x,
      b.y,
    ],
    P.wire,
  );
}

/**
 * Another driller's site far off in the dark: a slab, a short fence and one or two rigs. The
 * lights (lamp pool, crown beacons) are added by the world's light list.
 */
export function neighbourSite(c: Ctx, x: number, y: number, seed: number): void {
  diamond(c, x, y, 72, '#332d28');
  diamond(c, x, y + 6, 48, '#3d3730');
  for (let i = 0; i < 36; i += 4) {
    px(c, x - i, y + i / 2 - 2, P.fenceDark);
    px(c, x + i, y + i / 2 - 2, P.fenceDark);
  }
  const rigs = 1 + (seed % 2);
  for (let k = 0; k < rigs; k++) {
    const rx = x - 10 + k * 18;
    const ry = y + 22 - k * 4;
    const h = 22 + ((seed + k) % 3) * 4;
    line(c, rx - 5, ry, rx - 1, ry - h, '#9b4a1d');
    line(c, rx + 5, ry, rx + 1, ry - h, '#9b4a1d');
    for (let b = 1; b < 3; b++)
      line(c, rx - 5 + b, ry - (h * b) / 3, rx + 5 - b, ry - (h * b) / 3, '#7a3a17');
  }
  rect(c, x + 16, y + 4, 10, 6, P.steel);
}

/** Crown points of a neighbour's rigs, for their beacons. */
export function neighbourBeacons(x: number, y: number, seed: number): { x: number; y: number }[] {
  const rigs = 1 + (seed % 2);
  return Array.from({ length: rigs }, (_, k) => ({
    x: x - 10 + k * 18,
    y: y + 22 - k * 4 - (22 + ((seed + k) % 3) * 4) - 2,
  }));
}

/** A small rock or a clump of scrub on open land. */
export function scrub(c: Ctx, x: number, y: number, kind: number): void {
  if (kind === 0) {
    rect(c, x - 2, y - 1, 4, 2, P.rock);
    px(c, x - 1, y - 2, P.rockLit);
    px(c, x, y - 2, P.rock);
    return;
  }
  rect(c, x - 3, y - 1, 6, 1, P.scrub);
  rect(c, x - 2, y - 2, 4, 1, P.scrub);
  px(c, x - 1, y - 3, P.scrubLit);
  px(c, x + 1, y - 2, P.scrubLit);
  px(c, x - 3, y - 2, P.scrubLit);
}

export function rain(c: Ctx, W: number, H: number, t: number): void {
  c.globalAlpha = 0.3;
  // On a high-resolution canvas (the voxel scene) the drops are thin streaks, one path in all.
  const smooth = resolutionOf(c) > 1 && typeof c.stroke === 'function';
  if (smooth) c.beginPath();
  const n = Math.floor((W * H) / 1500);
  for (let i = 0; i < n; i++) {
    const seed = i * 7.31;
    const x0 = ((Math.sin(seed) + 1) / 2) * (W + 40);
    const speed = 160 + ((Math.sin(seed * 3.1) + 1) / 2) * 80;
    const y = ((((Math.sin(seed * 1.7) + 1) / 2) * H + t * speed) % (H + 20)) - 10;
    const x = x0 - ((y * 0.25) % (W + 40));
    if (smooth) {
      c.moveTo(x, y);
      c.lineTo(x - 1, y + 3);
    } else line(c, x, y, x - 1, y + 3, P.rain);
  }
  if (smooth) {
    c.strokeStyle = P.rain;
    c.lineWidth = 0.6;
    c.stroke();
  }
  c.globalAlpha = 1;
}

/** A puddle catching a lamp: a dark pool with a couple of lit ripples. */
export function puddle(c: Ctx, x: number, y: number, t: number, motion: boolean): void {
  ellipse(c, x, y, 9, 3, P.puddle);
  const k = motion ? Math.floor(t * 2) % 3 : 0;
  rect(c, x - 4 + k * 2, y - 1, 3, 1, P.puddleLit);
}
