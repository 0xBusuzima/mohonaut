/**
 * The drill site at night, drawn as pixel art (docs/01 §7): a fenced site on open land, pads
 * (locked ones chained off), the core shack (refinery), the diesel tank, the equipment container
 * (market), the World Bore wellhead, rigs, crew walking their rounds, the diesel truck at the
 * gate, power poles along the road and other drillers' sites far off in the dark; then the night
 * with the lamps cut out of it, and rain. Pure drawing on a low-resolution canvas; gives back the
 * clickable areas.
 */
import { GEN1_RIGS } from '../../lib/catalog';
import type { ScenePad } from '../play';
import { diamond, diamondEdge, hash, line, px } from './draw';
import type { Ctx } from './draw';
import { drawText, textWidth } from './font';
import { cached, night } from './light';
import { voxelSprite } from './voxel-sprites';
import type { Light } from './light';
import { P } from './palette';
import {
  container,
  drawRig,
  generator,
  lampPost,
  surveyPlot,
  neighbourBeacons,
  neighbourSite,
  padTile,
  pipeRack,
  pole,
  puddle,
  rain,
  rigTop,
  shack,
  shackDressing,
  tankDressing,
  tank,
  truck,
  truckLights,
  wellhead,
  wire,
  worker,
} from './props';
import { land, sky, skyLife, skyStill } from './terrain';

import { DECOR_SPOTS, drawDecor } from './decor';
import type { DecorSet } from './decor';
export { drawRig, padTile } from './props';

export type Hit = 'tank' | 'shack' | 'market' | 'bore' | `pad:${number}`;
export interface HitBox {
  id: Hit;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface WorldModel {
  /** One entry per unlocked pad, in order (rig type and whether it runs). */
  pads: ScenePad[];
  /** 0..1, for the tank's gauge. */
  tankFill: number;
  /** Diesel for less than half a day: the tank's lamp blinks red. */
  tankLow?: boolean;
  /** Highlighted object (hover). */
  hover: Hit | null;
  /** Animate steam, lamps, crew and rain. */
  motion: boolean;
  /** Camera offset in art pixels (dragging the site around on small screens). */
  pan: { x: number; y: number };
  /**
   * The player's unrefined $MOHN per hour per DP right now (an estimate: it falls as others
   * join). Running rigs show what they cored every few seconds; 0 or absent shows nothing.
   */
  yieldPerDp?: number;
  /** One-off effects: a new rig dropping onto its pad, diesel arriving in the tank. */
  fx?: WorldFx[];
  /** Decor in the yard for the player's completed Core Collection sets. */
  decor?: readonly DecorSet[];
  /** The player's crew tag, flown on the shack's flagpole. */
  crewTag?: string;
  /** The player's season plaques (ranks, oldest season first), on the shack's wall. */
  plaques?: readonly number[];
  /** The colour of the stratum the World Bore is in: the cuttings by the wellhead. */
  stratum?: string;
  /** Draw the rigs as baked voxel sprites (docs/06 7.8, a preview while the redesign is on). */
  voxel?: boolean;
}

export interface WorldFx {
  kind: 'rig' | 'fuel' | 'pad';
  /** Pad index for 'rig' and 'pad' (a pad the site just gained). */
  pad: number;
  /** Start, in the same seconds as the draw clock (performance.now() / 1000). */
  at: number;
}

const DROP = 0.6; // seconds a new rig takes to fall onto its pad
const DUST = 1.2; // seconds the dust takes to settle

/** Seconds between a rig's "+amount" floats. */
const FLOAT_EVERY = 6;

const TW = 32; // tile width (2:1 diamonds)
const GW = 14; // site size in tiles
const MAX_ROWS = 9; // 36 pad slots: enough for the 33 pads of site level 30 and one locked

/**
 * Pad rows to draw for `padCount` pads (one rig each): every pad the site has plus at least one
 * locked slot to show where it grows next, and never fewer than three rows.
 */
export function siteRows(padCount: number): number {
  return Math.min(MAX_ROWS, Math.max(3, Math.ceil((padCount + 1) / 4)));
}

/** Site depth in tiles: the yard behind the pads, three tiles per row, and a margin. */
const siteDepth = (rows: number) => 3 * rows + 4;

/** Pad slots, four to a row, front rows added as the site grows. */
function padSlots(rows: number): [number, number][] {
  const out: [number, number][] = [];
  for (let r = 0; r < rows; r++) for (let k = 0; k < 4; k++) out.push([2 + 3 * k, 5 + 3 * r]);
  return out;
}

/** The art size the site needs on screen, for picking the scale. */
export function worldSize(rows: number): { w: number; h: number } {
  const gh = siteDepth(rows);
  return { w: ((GW + gh) * TW) / 2 + 40, h: ((GW + gh) * TW) / 4 + 92 };
}

/** Crew rounds, in grid coordinates: each walks there and back. */
function crewRounds(gh: number): [number, number][][] {
  return [
    [
      [2.4, 2.7],
      [5.6, 2.7],
    ],
    [
      [0.5, 3.2],
      [0.5, gh - 1.5],
    ],
    [
      [9.6, 3.4],
      [7.8, 5.8],
    ],
    [
      [3.6, 7.0],
      [10.6, 7.0],
    ],
  ];
}

/** Where a walker is at `t`: back and forth along its round at a slow walk. */
function walk(path: [number, number][], t: number, seed: number) {
  const [a, b] = path as [[number, number], [number, number]];
  const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
  const pos = (t * 0.32 + seed * 1.7) % (2 * len);
  const forward = pos < len;
  const k = (forward ? pos : 2 * len - pos) / len;
  // Screen direction of travel: +1 when x grows on screen.
  const dx = (b[0] - a[0] - (b[1] - a[1])) * (forward ? 1 : -1);
  return { gx: a[0] + (b[0] - a[0]) * k, gy: a[1] + (b[1] - a[1]) * k, facing: dx >= 0 ? 1 : -1 };
}

export function drawWorld(c: Ctx, W: number, H: number, t: number, m: WorldModel): HitBox[] {
  const hits: HitBox[] = [];
  // A hidden or collapsed box (0 pixels): nothing to draw until it has a size again.
  if (W <= 0 || H <= 0) return hits;
  const rows = siteRows(m.pads.length);
  const gh = siteDepth(rows);
  const slots = padSlots(rows);
  const ox = Math.round(W / 2 + ((gh - GW) * TW) / 4 + m.pan.x);
  const oy = Math.round(H / 2 - ((GW + gh) * TW) / 8 + 46 + m.pan.y);
  // Open land behind the site up to the horizon: the road and other drillers' sites are there.
  const horizon = oy - 40;
  const iso = (gx: number, gy: number) => ({
    x: ox + ((gx - gy) * TW) / 2,
    y: oy + ((gx + gy) * TW) / 4,
  });
  const lamps: [number, number][] = [];
  for (let gy = 4; gy < gh; gy += 6) lamps.push([1, gy], [7, gy], [13, gy]);
  // Other drillers, far off on both sides; the truck at the gate; poles along the road.
  const neighbours: [number, number, number][] = [
    [3, -5, 1],
    [12, -6, 2],
    [-9, 3, 3],
    [GW + 5, 3, 4],
    [-7, gh + 3, 5],
    [-4, -12, 6],
  ];
  const truckAt = iso(-3.6, 2.3);

  // ---- Still layer: sky, land, site ground, pads, back fence, the road's furniture.
  const key = `${W}x${H}:${ox},${oy}:${gh}:${m.pads.length}:${m.hover ?? ''}`;
  cached(c, W, H, key, (g) => {
    sky(g, W, horizon);
    land(g, W, H, horizon, ox, oy, iso, GW, gh);
    for (const [nx, ny, seed] of neighbours) {
      const p = iso(nx, ny);
      neighbourSite(g, p.x, p.y, seed);
    }
    // Power line from the horizon to the gate.
    let prev: { x: number; y: number } | null = null;
    for (let gx = -20; gx <= -1; gx += 3) {
      const p = iso(gx, 1.3);
      if (p.y < horizon + 14) continue;
      const top = pole(g, p.x, p.y);
      if (prev !== null) wire(g, prev, top);
      prev = top;
    }
    truck(g, truckAt.x, truckAt.y);
    // Site ground.
    for (let gy = 0; gy < gh; gy++) {
      for (let gx = 0; gx < GW; gx++) {
        const p = iso(gx, gy);
        const n = hash(gx, gy, 7);
        diamond(g, p.x, p.y, TW, n < 0.25 ? P.groundWet : P.ground);
        for (let k = 0; k < 4; k++) {
          const sx = p.x - 8 + Math.floor(hash(gx, gy, 10 + k) * 16);
          const sy = p.y + 3 + Math.floor(hash(gx, gy, 20 + k) * 10);
          px(g, sx, sy, P.groundSpeck);
        }
        // Tyre marks on the yard behind the pads.
        if (gy < 4 && n > 0.6) line(g, p.x - 6, p.y + 5, p.x + 6, p.y + 11, P.groundWet);
      }
    }
    // Gravel track from the gate down the left edge.
    for (let gy = 2; gy < gh; gy++) {
      const p = iso(0, gy);
      diamond(g, p.x, p.y, TW, P.gravel);
      for (let k = 0; k < 6; k++) {
        px(
          g,
          p.x - 9 + Math.floor(hash(0, gy, 30 + k) * 18),
          p.y + 2 + Math.floor(hash(0, gy, 40 + k) * 12),
          P.groundSpeck,
        );
      }
    }
    fenceBack(g, iso);
    slots.forEach(([gx, gy], i) => {
      const p = iso(gx, gy);
      padTile(g, p.x, p.y, i < m.pads.length, m.hover === `pad:${i}`);
    });
  });
  slots.forEach(([gx, gy], i) => {
    const p = iso(gx, gy);
    hits.push({ id: `pad:${i}`, x: p.x - TW, y: p.y - 60, w: TW * 2, h: 76 });
  });
  if (m.motion) skyLife(c, W, horizon, t);
  else skyStill(c, W, horizon);

  // ---- Everything standing, back to front.
  type Item = { depth: number; draw: () => void };
  const items: Item[] = [];
  const at = (gx: number, gy: number, draw: () => void) => items.push({ depth: gx + gy, draw });
  const lights: Light[] = [];

  at(3, 2, () => {
    const p = iso(1, 1);
    const built = m.voxel === true ? voxelSprite('shack') : null;
    if (built === null) shack(c, p.x, p.y, t, m.motion, m.hover === 'shack', m.crewTag, m.plaques);
    else {
      c.drawImage(built.img, p.x - built.ax, p.y + 4 - built.ay);
      shackDressing(c, p.x, p.y, t, m.motion, m.crewTag, m.plaques);
    }
    // A crew flag reaches past the roof to the right: it is part of the shack too.
    const flag = m.crewTag === undefined ? 0 : Math.max(0, 15 + textWidth(m.crewTag) + 6 - 34);
    hits.push({ id: 'shack', x: p.x - 34, y: p.y - 48, w: 68 + flag, h: 74 });
  });
  {
    const p = iso(1, 1);
    lights.push({ x: p.x + 22, y: p.y + 28, r: 26, tint: P.window });
  }
  at(6, 2, () => {
    const p = iso(5, 1);
    const built = m.voxel === true ? voxelSprite('tank') : null;
    if (built === null)
      tank(c, p.x, p.y + 16, m.tankFill, m.tankLow === true, m.hover === 'tank', t, m.motion);
    else {
      c.drawImage(built.img, p.x - built.ax, p.y + 16 - built.ay);
      tankDressing(c, p.x, p.y + 16, m.tankFill, m.tankLow === true, t, m.motion);
    }
    hits.push({ id: 'tank', x: p.x - 16, y: p.y - 26, w: 32, h: 50 });
  });
  at(10, 2, () => {
    const p = iso(9, 1);
    const built = m.voxel === true ? voxelSprite('container') : null;
    if (built === null) container(c, p.x, p.y, m.hover === 'market');
    else c.drawImage(built.img, p.x - built.ax, p.y + 8 - built.ay);
    hits.push({ id: 'market', x: p.x - 40, y: p.y - 30, w: 80, h: 56 });
  });
  {
    const p = iso(9, 1);
    lights.push({ x: p.x + 16, y: p.y + 34, r: 20, tint: P.window });
  }
  at(13, 2, () => {
    const p = iso(12, 1);
    generator(c, p.x, p.y, t, m.motion);
  });
  at(1, 4, () => {
    const p = iso(0.4, 3.4);
    pipeRack(c, p.x, p.y);
  });
  for (const set of m.decor ?? []) {
    const [gx, gy] = DECOR_SPOTS[set];
    at(gx, gy, () => {
      const p = iso(gx, gy);
      drawDecor(c, set, p.x, p.y);
    });
    // A work light on each piece, so it reads at night.
    const p = iso(gx, gy);
    lights.push({ x: p.x, y: p.y + 2, r: 22, tint: P.window, power: 0.9 });
  }
  at(7, 7, () => {
    const p = iso(7, 6.5);
    wellhead(c, p.x, p.y + 8, t, m.motion, m.hover === 'bore', m.stratum);
    hits.push({ id: 'bore', x: p.x - 20, y: p.y - 10, w: 40, h: 30 });
  });
  {
    const p = iso(7, 6.5);
    const pulse = m.motion ? Math.sin(t * 2) * 0.25 + 0.75 : 1;
    lights.push({ x: p.x, y: p.y + 12, r: 22, tint: P.cyan, power: pulse });
  }
  // Puddles catching the lamps.
  for (const [gx, gy] of lamps) {
    at(gx - 0.5, gy + 0.6, () => {
      const p = iso(gx + 0.6, gy + 0.8);
      puddle(c, p.x, p.y, t + gx, m.motion);
    });
  }
  lamps.forEach(([gx, gy], i) => {
    const on = !m.motion || Math.sin(t * 0.7 + gx + gy) > -0.97; // an occasional flicker
    at(gx, gy, () => {
      const p = iso(gx, gy);
      lampPost(c, p.x, p.y + 8, on);
    });
    const p = iso(gx, gy);
    lights.push({ x: p.x, y: p.y + 6, r: 54 + (i % 2) * 6, tint: P.glow, power: on ? 1 : 0.35 });
  });
  slots.forEach(([gx, gy], i) => {
    const p = iso(gx, gy);
    const cx = p.x;
    const cy = p.y + TW / 2;
    const pad = m.pads[i];
    at(gx + 1, gy + 1, () => {
      if (i >= m.pads.length) {
        surveyPlot(c, cx, cy);
        return;
      }
      // A pad the site just gained: dust settles and its rim flashes amber.
      const opened = m.fx?.find((f) => f.kind === 'pad' && f.pad === i);
      const fresh = opened === undefined || t < opened.at ? Infinity : t - opened.at;
      if (fresh < 1.6) {
        dust(c, cx, cy, fresh / 1.6);
        if (Math.floor(fresh * 6) % 2 === 0) diamondEdge(c, cx, p.y, TW * 2, P.amber);
      }
      if (pad === undefined || pad.typeId === null) return;
      const drop = m.fx?.find((f) => f.kind === 'rig' && f.pad === i);
      // A still scene (reduced motion) is drawn at t = 0: effects stamped later never play.
      const age = drop === undefined || t < drop.at ? Infinity : t - drop.at;
      const fall = age < DROP ? -((1 - age / DROP) ** 2) * 56 : 0;
      const sprite = m.voxel === true ? voxelSprite(`rig-${pad.typeId}`) : null;
      if (sprite !== null) c.drawImage(sprite.img, cx - sprite.ax, cy + fall - sprite.ay + 1);
      else drawRig(c, cx, cy + fall, pad.typeId, pad.running, t, m.motion, gx * 3 + gy);
      if (age >= DROP * 0.8 && age < DROP + DUST) dust(c, cx, cy, (age - DROP * 0.8) / DUST);
    });
    if (pad?.typeId !== null && pad?.typeId !== undefined && pad.running) {
      lights.push({ x: cx, y: cy, r: 26, tint: P.glow, power: 0.6 });
      const top = rigTop(pad.typeId, cx, cy);
      lights.push({ x: top.x, y: top.y, r: 6, tint: P.beacon, power: 0.5 });
    }
  });
  crewRounds(gh).forEach((path, i) => {
    const w = walk(path, m.motion ? t : 0, i);
    at(w.gx, w.gy, () => {
      const p = iso(w.gx, w.gy);
      worker(c, Math.round(p.x), Math.round(p.y), w.facing, m.motion ? Math.floor(t * 4) % 2 : 0);
    });
    const p = iso(w.gx, w.gy);
    lights.push({ x: p.x + w.facing * 5, y: p.y, r: 6, tint: null, power: 0.4 });
  });
  items.sort((a, b) => a.depth - b.depth);
  for (const it of items) it.draw();
  fenceFront(c, iso, gh);

  // Lights out on the land: the truck's headlights and the neighbours' lamps and beacons.
  const head = truckLights(truckAt.x, truckAt.y);
  lights.push({ x: head.x, y: head.y, r: 30, tint: P.bone, power: 0.8 });
  for (const [nx, ny, seed] of neighbours) {
    const p = iso(nx, ny);
    lights.push({ x: p.x, y: p.y + 18, r: 44, tint: P.glow, power: 0.55 });
    neighbourBeacons(p.x, p.y, seed).forEach((b, k) => {
      const on = !m.motion || (t * 0.8 + seed * 0.3 + k * 0.4) % 1 < 0.25;
      if (on) {
        px(c, b.x, b.y, P.beacon);
        px(c, b.x - 1, b.y, P.beacon);
      }
    });
  }
  if (m.tankLow === true && (!m.motion || Math.sin(t * 6) > 0)) {
    const p = iso(5, 1);
    lights.push({ x: p.x, y: p.y - 18, r: 10, tint: P.beacon, power: 0.8 });
  }
  // Diesel arriving: amber sparks spiralling up around the tank.
  const tankAt = iso(5, 1);
  for (const f of m.fx ?? []) {
    const age = t - f.at;
    if (f.kind === 'fuel' && age >= 0 && age < 2.4) {
      lights.push({ x: tankAt.x, y: tankAt.y + 12, r: 30, tint: P.amber, power: 1 - age / 2.4 });
    }
  }
  night(c, W, H, horizon, lights);
  for (const f of m.fx ?? []) {
    const age = t - f.at;
    if (f.kind !== 'fuel' || age < 0 || age >= 2.4) continue;
    c.globalAlpha = 1 - age / 2.4;
    for (let j = 0; j < 12; j++) {
      const a = j * 0.52 + age * 3;
      const x = tankAt.x + Math.cos(a) * (12 + (j % 3) * 2);
      const y = tankAt.y + 6 - age * 16 - (j % 4) * 3 + Math.sin(a) * 4;
      px(c, x, y, j % 3 === 0 ? P.flareHot : P.amber);
    }
    c.globalAlpha = 1;
  }
  // What each drilling rig cored since its last float, rising from its crown and fading out.
  const perDp = m.yieldPerDp ?? 0;
  if (m.motion && perDp > 0) {
    slots.forEach(([gx, gy], i) => {
      const pad = m.pads[i];
      if (pad?.typeId === null || pad?.typeId === undefined || !pad.running) return;
      const phase = ((t + i * 0.83) % FLOAT_EVERY) / FLOAT_EVERY;
      if (phase > 0.4) return;
      const dp = GEN1_RIGS[pad.typeId]?.dp ?? 0;
      const amount = (perDp * dp * FLOAT_EVERY) / 3600;
      if (amount <= 0) return;
      const text = `+${amount.toFixed(amount < 0.1 ? 3 : 2)}`;
      const p = iso(gx, gy);
      const top = rigTop(pad.typeId, p.x, p.y + TW / 2);
      const k = phase / 0.4;
      c.globalAlpha = k < 0.7 ? 1 : (1 - k) / 0.3;
      drawText(c, top.x - textWidth(text) / 2, top.y - 10 - k * 14, text, P.cyan, P.night);
      c.globalAlpha = 1;
    });
  }
  if (m.motion) rain(c, W, H, t);
  return hits;
}

// ------------------------------------------------------------------ fence

function fencePosts(
  c: Ctx,
  iso: (gx: number, gy: number) => { x: number; y: number },
  from: [number, number],
  to: [number, number],
): void {
  const steps = Math.max(Math.abs(to[0] - from[0]), Math.abs(to[1] - from[1]));
  let prev: { x: number; y: number } | null = null;
  for (let i = 0; i <= steps; i++) {
    const gx = from[0] + ((to[0] - from[0]) * i) / steps;
    const gy = from[1] + ((to[1] - from[1]) * i) / steps;
    const p = iso(gx, gy);
    c.fillStyle = P.fence;
    c.fillRect(p.x, p.y - 10, 1, 10);
    if (prev !== null) {
      line(c, prev.x, prev.y - 9, p.x, p.y - 9, P.fenceDark);
      line(c, prev.x, prev.y - 5, p.x, p.y - 5, P.fenceDark);
    }
    prev = p;
  }
}

function fenceBack(c: Ctx, iso: (gx: number, gy: number) => { x: number; y: number }): void {
  fencePosts(c, iso, [0, 0], [GW, 0]);
  fencePosts(c, iso, [0, 0], [0, 2]); // gate gap on the left edge (the track)
}

function fenceFront(
  c: Ctx,
  iso: (gx: number, gy: number) => { x: number; y: number },
  gh: number,
): void {
  fencePosts(c, iso, [GW, 0], [GW, gh]);
  fencePosts(c, iso, [0, gh], [GW, gh]);
  fencePosts(c, iso, [0, 4], [0, gh]);
}

/** Dust kicked up by a rig landing on its pad: puffs spreading out and thinning, k in 0..1. */
function dust(c: Ctx, x: number, y: number, k: number): void {
  c.globalAlpha = 0.55 * (1 - k);
  for (let j = 0; j < 12; j++) {
    const a = (j / 12) * Math.PI * 2;
    const r = 8 + k * 26;
    const s = 2 + Math.floor(k * 3);
    c.fillStyle = P.boneDark;
    c.fillRect(
      Math.round(x + Math.cos(a) * r - s / 2),
      Math.round(y + Math.sin(a) * r * 0.5 - s / 2 - k * 4),
      s,
      s,
    );
  }
  c.globalAlpha = 1;
}
