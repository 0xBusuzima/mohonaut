/**
 * The drill site at night, drawn as pixel art (docs/01 §7): sky, distant flares, a fenced site
 * on wet ground, pads (locked ones chained off), the diesel tank, the core shack (refinery), the
 * equipment container (market), the World Bore wellhead, lamps, rigs with steam, and rain.
 * Pure drawing on a low-resolution canvas; gives back the clickable areas.
 */
import type { ScenePad } from '../play';
import { rigShape } from '../rigs';
import { box, diamond, diamondEdge, hash, line, polygon, polyline, px, rect } from './draw';
import type { Ctx } from './draw';
import { P } from './palette';

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
  /** Highlighted object (hover). */
  hover: Hit | null;
  /** Animate steam, lamps and rain. */
  motion: boolean;
  /** Camera offset in art pixels (dragging the site around on small screens). */
  pan: { x: number; y: number };
}

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
  return { w: ((GW + gh) * TW) / 2 + 40, h: ((GW + gh) * TW) / 4 + 80 };
}

export function drawWorld(c: Ctx, W: number, H: number, t: number, m: WorldModel): HitBox[] {
  const hits: HitBox[] = [];
  const gh = siteDepth(siteRows(m.pads.length));
  const slots = padSlots(siteRows(m.pads.length));
  const ox = Math.round(W / 2 + ((gh - GW) * TW) / 4 + m.pan.x);
  const oy = Math.round(H / 2 - ((GW + gh) * TW) / 8 + 40 + m.pan.y);
  const iso = (gx: number, gy: number) => ({
    x: ox + ((gx - gy) * TW) / 2,
    y: oy + ((gx + gy) * TW) / 4,
  });

  sky(c, W, oy, t, m.motion);
  // The land beyond the fence.
  rect(c, 0, oy + 8, W, H - oy, P.groundDark);
  for (let i = 0; i < (W * (H - oy)) / 90; i++) {
    const x = Math.floor(hash(i, 1) * W);
    const y = oy + 8 + Math.floor(hash(i, 2) * (H - oy));
    px(c, x, y, P.ground);
  }

  // Site ground.
  for (let gy = 0; gy < gh; gy++) {
    for (let gx = 0; gx < GW; gx++) {
      const p = iso(gx, gy);
      const n = hash(gx, gy, 7);
      diamond(c, p.x, p.y, TW, n < 0.25 ? P.groundWet : P.ground);
      for (let k = 0; k < 4; k++) {
        const sx = p.x - 8 + Math.floor(hash(gx, gy, 10 + k) * 16);
        const sy = p.y + 3 + Math.floor(hash(gx, gy, 20 + k) * 10);
        px(c, sx, sy, P.groundSpeck);
      }
      if (n > 0.93) diamond(c, p.x, p.y + 4, 16, P.puddle);
    }
  }
  // Gravel track from the gate to the wellhead.
  for (let gy = 2; gy < gh; gy++) {
    const p = iso(0, gy);
    diamond(c, p.x, p.y, TW, P.gravel);
    for (let k = 0; k < 6; k++) {
      px(
        c,
        p.x - 9 + Math.floor(hash(0, gy, 30 + k) * 18),
        p.y + 2 + Math.floor(hash(0, gy, 40 + k) * 12),
        P.groundSpeck,
      );
    }
  }

  // Lamp light pools on the ground (under everything standing).
  const lamps: [number, number][] = [];
  for (let gy = 4; gy < gh; gy += 6) lamps.push([1, gy], [7, gy], [13, gy]);
  c.globalAlpha = 0.22;
  for (const [gx, gy] of lamps) {
    const p = iso(gx, gy);
    diamond(c, p.x, p.y - 14, 72, P.glow);
  }
  c.globalAlpha = 1;

  fenceBack(c, iso);

  // Pads (ground level).
  slots.forEach(([gx, gy], i) => {
    const p = iso(gx, gy);
    const unlocked = i < m.pads.length;
    padTile(c, p.x, p.y, unlocked, m.hover === `pad:${i}`);
    hits.push({ id: `pad:${i}`, x: p.x - TW, y: p.y - 60, w: TW * 2, h: 76 });
  });

  // Everything standing, back to front.
  type Item = { depth: number; draw: () => void };
  const items: Item[] = [];
  const at = (gx: number, gy: number, draw: () => void) => items.push({ depth: gx + gy, draw });

  // Core shack (refinery), back left.
  at(3, 2, () => {
    const p = iso(1, 1);
    shack(c, p.x, p.y, t, m.motion, m.hover === 'shack');
    hits.push({ id: 'shack', x: p.x - 34, y: p.y - 40, w: 68, h: 66 });
  });
  // Diesel tank.
  at(6, 2, () => {
    const p = iso(5, 1);
    tank(c, p.x, p.y + 16, m.tankFill, m.hover === 'tank');
    hits.push({ id: 'tank', x: p.x - 16, y: p.y - 26, w: 32, h: 50 });
  });
  // Equipment container (market).
  at(10, 2, () => {
    const p = iso(9, 1);
    container(c, p.x, p.y, m.hover === 'market');
    hits.push({ id: 'market', x: p.x - 40, y: p.y - 30, w: 80, h: 56 });
  });
  // Generator and pipe rack.
  at(13, 2, () => {
    const p = iso(12, 1);
    box(c, p.x, p.y + 8, 24, 10, P.steelLight, P.steel, P.graphite);
    rect(c, p.x + 4, p.y + 2, 2, 6, P.night);
    if (m.motion) puff(c, p.x + 5, p.y - 2, t, 0.3);
  });
  at(1, 4, () => {
    const p = iso(0, 3);
    for (let i = 0; i < 3; i++)
      rect(c, p.x - 14, p.y + 4 - i * 3, 24, 2, i % 2 ? P.concrete : P.steelLight);
  });
  // World Bore wellhead (between the pad rows).
  at(7, 7, () => {
    const p = iso(7, 6.5);
    wellhead(c, p.x, p.y + 8, t, m.motion, m.hover === 'bore');
    hits.push({ id: 'bore', x: p.x - 20, y: p.y - 10, w: 40, h: 30 });
  });
  // Lamp posts.
  for (const [gx, gy] of lamps) {
    at(gx, gy, () => {
      const p = iso(gx, gy);
      lampPost(c, p.x, p.y + 8, t, m.motion, gx + gy);
    });
  }
  // Rigs on unlocked pads; locked pads get a sign.
  slots.forEach(([gx, gy], i) => {
    at(gx + 1, gy + 1, () => {
      const p = iso(gx, gy);
      const cx = p.x;
      const cy = p.y + TW / 2;
      const pad = m.pads[i];
      if (i >= m.pads.length) {
        lockSign(c, cx, cy);
        return;
      }
      if (pad === undefined || pad.typeId === null) return;
      drawRig(c, cx, cy, pad.typeId, pad.running, t, m.motion, gx * 3 + gy);
    });
  });
  items.sort((a, b) => a.depth - b.depth);
  for (const it of items) it.draw();

  fenceFront(c, iso, gh);
  if (m.motion) rain(c, W, H, t);
  return hits;
}

// ------------------------------------------------------------------ background

function sky(c: Ctx, W: number, horizon: number, t: number, motion: boolean): void {
  const bands = [P.skyTop, P.skyMid, P.skyLow];
  const bh = Math.ceil((horizon + 10) / bands.length);
  bands.forEach((col, i) => {
    rect(c, 0, i * bh, W, bh, col);
    // Dithered edge into the next band.
    const next = bands[i + 1];
    if (next !== undefined) {
      for (let y = 0; y < 4; y++) {
        for (let x = (y % 2) * 1; x < W; x += 2)
          px(c, x, (i + 1) * bh - 4 + y, y < 2 ? (x % 4 === 0 ? next : col) : next);
      }
    }
  });
  // Stars.
  for (let i = 0; i < W / 4; i++) {
    const x = Math.floor(hash(i, 3) * W);
    const y = Math.floor(hash(i, 4) * (horizon - 20));
    const tw = motion ? Math.sin(t * 2 + i) > 0.6 : false;
    px(c, x, y, hash(i, 5) > 0.8 || tw ? P.star : P.starDim);
  }
  // Two ridges.
  const ridge = (base: number, amp: number, seed: number, col: string) => {
    for (let x = 0; x < W; x++) {
      const h =
        Math.sin(x / 37 + seed) * amp * 0.6 + Math.sin(x / 13 + seed * 2) * amp * 0.25 + amp;
      rect(c, x, Math.round(base - h), 1, Math.round(h) + 20, col);
    }
  };
  ridge(horizon - 4, 18, 1.3, P.hillFar);
  // Distant rigs with flare stacks on the far ridge.
  for (let k = 0; k < 5; k++) {
    const x = Math.floor(((k + 0.5) / 5) * W + Math.sin(k * 7) * 30);
    const y = horizon - 10 - Math.floor(hash(k, 9) * 8);
    line(c, x - 3, y, x, y - 12, P.hillNear);
    line(c, x + 3, y, x, y - 12, P.hillNear);
    const flick = motion ? Math.sin(t * 9 + k * 3) > 0 : true;
    px(c, x, y - 13, flick ? P.flareHot : P.flare);
    px(c, x, y - 14, P.flare);
  }
  ridge(horizon + 4, 10, 4.1, P.hillNear);
}

// ------------------------------------------------------------------ site furniture

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
    rect(c, p.x, p.y - 10, 1, 10, P.fence);
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

function lockSign(c: Ctx, x: number, y: number): void {
  // Chain between two bollards and a sign with a padlock.
  rect(c, x - 14, y - 8, 2, 8, P.hazard);
  rect(c, x + 12, y - 8, 2, 8, P.hazard);
  for (let i = -12; i < 12; i += 2) px(c, x + i, y - 6 + Math.round(Math.abs(i) / 6), P.concrete);
  rect(c, x - 1, y - 20, 2, 14, P.steel);
  rect(c, x - 8, y - 30, 16, 12, P.lockSign);
  rect(c, x - 8, y - 30, 16, 1, P.steelLight);
  // Padlock.
  rect(c, x - 3, y - 25, 6, 5, P.lockMetal);
  rect(c, x - 2, y - 28, 1, 3, P.lockMetal);
  rect(c, x + 1, y - 28, 1, 3, P.lockMetal);
  rect(c, x - 1, y - 29, 2, 1, P.lockMetal);
  px(c, x, y - 23, P.lockSign);
}

function lampPost(c: Ctx, x: number, y: number, t: number, motion: boolean, seed: number): void {
  rect(c, x, y - 30, 1, 30, P.steelLight);
  rect(c, x - 3, y - 31, 7, 2, P.steel);
  const on = !motion || Math.sin(t * 0.7 + seed) > -0.97; // an occasional flicker
  rect(c, x - 2, y - 29, 5, 1, on ? P.amber : P.steel);
  if (on) {
    c.globalAlpha = 0.25;
    polygon(c, [x - 2, y - 28, x + 3, y - 28, x + 9, y - 8, x - 8, y - 8], P.glow);
    c.globalAlpha = 1;
  }
}

function tank(c: Ctx, x: number, y: number, fill: number, hover: boolean): void {
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
  // Gauge: a window showing the fill level.
  const gh = 16;
  rect(c, x + 2, top + 9, 5, gh + 2, P.night);
  const f = Math.max(0, Math.min(1, fill));
  const filled = Math.round(gh * f);
  rect(c, x + 3, top + 10 + gh - filled, 3, filled, f < 0.15 ? P.orange : P.amber);
  // Ladder and stencil band.
  for (let i = 0; i < h - 6; i += 3) rect(c, x - 9, top + 5 + i, 3, 1, P.concrete);
  rect(c, x - w / 2, top + 28, w, 3, P.orange);
  if (hover) rect(c, x - w / 2 - 1, top - 1, w + 2, 1, P.amber);
}

function shack(c: Ctx, x: number, y: number, t: number, motion: boolean, hover: boolean): void {
  box(c, x, y + 4, 56, 22, P.graphite, P.boneDark, P.concrete);
  // Pitched roof.
  polygon(
    c,
    [x - 30, y + 10 - 22, x, y - 6 - 22, x + 30, y + 10 - 22, x, y + 26 - 22],
    P.orangeDark,
  );
  polygon(c, [x - 30, y + 10 - 22, x, y + 26 - 22, x, y + 28 - 22, x - 30, y + 12 - 22], P.orange);
  // Door and lit window on the right face.
  rect(c, x + 6, y + 12, 6, 14, P.graphite);
  rect(c, x + 16, y + 6, 8, 6, P.window);
  rect(c, x + 20, y + 6, 1, 6, P.graphite);
  c.globalAlpha = 0.2;
  diamond(c, x + 22, y + 24, 30, P.window);
  c.globalAlpha = 1;
  // Core trays on the left face.
  for (let i = 0; i < 3; i++)
    rect(c, x - 22, y + 6 + i * 4, 14, 2, i === 1 ? P.cyan : P.steelLight);
  // Chimney with steam.
  rect(c, x - 10, y - 28, 4, 8, P.steel);
  if (motion) puff(c, x - 8, y - 32, t, 0);
  if (hover) diamondEdge(c, x, y + 4 - 22, 56, P.amber);
}

function container(c: Ctx, x: number, y: number, hover: boolean): void {
  box(c, x, y + 8, 64, 20, P.orangeDark, P.orange, P.orangeDark);
  // Corrugation.
  for (let i = 2; i < 30; i += 3) {
    line(c, x - 32 + i, y + 24 - 20 + i / 2, x - 32 + i, y + 24 + i / 2 - 2, P.orangeDark);
  }
  // Open doors with crates inside on the right face.
  polygon(c, [x + 8, y + 34 - 20, x + 22, y + 27 - 20, x + 22, y + 27, x + 8, y + 34], P.night);
  rect(c, x + 11, y + 22, 5, 5, P.boneDark);
  rect(c, x + 16, y + 20, 4, 4, P.concrete);
  // A sign: a little rig glyph.
  rect(c, x - 8, y - 22, 16, 10, P.charcoal);
  line(c, x - 4, y - 13, x, y - 21, P.orange);
  line(c, x + 4, y - 13, x, y - 21, P.orange);
  if (hover) diamondEdge(c, x, y + 8 - 20, 64, P.amber);
}

function wellhead(c: Ctx, x: number, y: number, t: number, motion: boolean, hover: boolean): void {
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
  if (hover) diamondEdge(c, x, y - 4, 40, P.amber);
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
  if (running && motion) puff(c, x, y + shape.steamY, t, seed);
}

/** Steam: three pixel puffs rising and fading. */
function puff(c: Ctx, x: number, y: number, t: number, seed: number): void {
  for (let k = 0; k < 3; k++) {
    const phase = (t * 0.6 + seed * 0.37 + k / 3) % 1;
    const yy = y - phase * 18;
    const xx = x + Math.sin(phase * 6 + seed) * 3;
    const r = 1 + Math.floor(phase * 3);
    c.globalAlpha = 0.5 * (1 - phase);
    rect(c, xx - r, yy - r, r * 2, r * 2, P.bone);
  }
  c.globalAlpha = 1;
}

function rain(c: Ctx, W: number, H: number, t: number): void {
  c.globalAlpha = 0.35;
  const n = Math.floor((W * H) / 1400);
  for (let i = 0; i < n; i++) {
    const x0 = hash(i, 50) * (W + 40);
    const speed = 160 + hash(i, 51) * 80;
    const y = ((hash(i, 52) * H + t * speed) % (H + 20)) - 10;
    const x = x0 - ((y * 0.25) % (W + 40));
    line(c, x, y, x - 1, y + 3, P.rain);
  }
  c.globalAlpha = 1;
}

const hex = (n: number) => `#${n.toString(16).padStart(6, '0')}`;
