/**
 * Night lighting and layer caching for the pixel world.
 *
 * Lighting: the scene is drawn fairly bright, then a layer of night is laid over it with holes
 * cut where the lights are. Each hole is a few stepped iso ellipses, so light falls off in hard
 * pixel bands rather than a smooth gradient, and a warm tint is added on top of the brightest
 * band. The screen edges get extra night (a stepped vignette) to pull the eye to the site.
 *
 * Caching: what does not move (sky, land, site ground, pads) is painted once into an offscreen
 * canvas and copied each frame; it is repainted only when its key (size, pan, site size,
 * unlocked pads, hover) changes.
 */
import { ellipse, rect } from './draw';
import type { Ctx } from './draw';
import { P } from './palette';

export interface Light {
  x: number;
  y: number;
  /** Radius of the outer band, in art pixels (the pool is an iso ellipse, half as tall). */
  r: number;
  /** Tint for the inner bands; null for a plain (white) hole in the night. */
  tint: string | null;
  /** 0..1, for flicker. */
  power?: number;
}

/** Inner bands, solid; the outer band (1.0) is dithered so the pool's edge breaks up. */
const BANDS = [0.7, 0.46, 0.24];

const checkers = new WeakMap<Ctx, CanvasPattern | null>();
/** A 2x2 checkerboard pattern (one opaque pixel in two), made once per context. */
function checker(g: Ctx): CanvasPattern | null {
  if (checkers.has(g)) return checkers.get(g) ?? null;
  const tile = document.createElement('canvas');
  tile.width = 2;
  tile.height = 2;
  const t = tile.getContext('2d');
  if (t !== null) {
    t.fillStyle = '#000';
    t.fillRect(0, 0, 1, 1);
    t.fillRect(1, 1, 1, 1);
  }
  const pattern = g.createPattern(tile, 'repeat');
  checkers.set(g, pattern);
  return pattern;
}

interface Layer {
  key: string;
  canvas: HTMLCanvasElement;
}
const statics = new WeakMap<Ctx, Layer>();
const nights = new WeakMap<Ctx, Layer>();

function layerFor(map: WeakMap<Ctx, Layer>, c: Ctx, W: number, H: number): Ctx | null {
  if (typeof document === 'undefined') return null;
  let l = map.get(c);
  if (l === undefined) {
    l = { key: '', canvas: document.createElement('canvas') };
    map.set(c, l);
  }
  if (l.canvas.width !== W || l.canvas.height !== H) {
    l.canvas.width = W;
    l.canvas.height = H;
    l.key = '';
  }
  const g = l.canvas.getContext('2d');
  if (g !== null) g.imageSmoothingEnabled = false;
  return g;
}

/** Paints `paint` into a cached layer when `key` changed, then copies the layer onto `c`. */
export function cached(c: Ctx, W: number, H: number, key: string, paint: (g: Ctx) => void): void {
  const g = layerFor(statics, c, W, H);
  const l = statics.get(c);
  if (g === null || l === undefined) {
    paint(c);
    return;
  }
  if (l.key !== key) {
    g.clearRect(0, 0, W, H);
    paint(g);
    l.key = key;
  }
  c.drawImage(l.canvas, 0, 0);
}

/** Lays the night over everything below `horizon`, with the lights cut out of it. */
export function night(c: Ctx, W: number, H: number, horizon: number, lights: Light[]): void {
  const g = layerFor(nights, c, W, H);
  const layer = nights.get(c);
  if (g === null || layer === undefined) return;
  // Rebuilt only when a light moves or its strength visibly changes (eight steps): the layer
  // was the costliest part of every frame.
  const key = `${horizon}|${lights
    .map((l) => `${Math.round(l.x)},${Math.round(l.y)},${l.r},${Math.round((l.power ?? 1) * 8)}`)
    .join(';')}`;
  if (layer.key !== key) {
    paintNight(g, W, H, horizon, lights);
    layer.key = key; // after the paint: a paint that throws is not cached
  }
  c.drawImage(layer.canvas, 0, 0);
  tint(c, lights);
}

function paintNight(g: Ctx, W: number, H: number, horizon: number, lights: Light[]): void {
  g.globalCompositeOperation = 'source-over';
  g.clearRect(0, 0, W, H);
  const top = Math.max(0, horizon - 24);
  rect(g, 0, top, W, H - top, P.dark);
  // Stepped vignette: three bands of extra night towards the edges.
  for (let k = 0; k < 3; k++) {
    const m = 10 + k * 14;
    g.globalAlpha = 0.16;
    rect(g, 0, top, m, H - top, P.night);
    rect(g, W - m, top, m, H - top, P.night);
    rect(g, m, H - m * 0.7, W - 2 * m, m * 0.7, P.night);
  }
  g.globalAlpha = 1;
  // Holes: every band takes away a share of the night.
  g.globalCompositeOperation = 'destination-out';
  const dither = checker(g);
  for (const l of lights) {
    const power = l.power ?? 1;
    g.globalAlpha = 0.45 * power;
    if (dither !== null) ellipse(g, l.x, l.y, l.r, l.r / 2, dither);
    for (const b of BANDS) {
      g.globalAlpha = 0.3 * power;
      ellipse(g, l.x, l.y, l.r * b, (l.r * b) / 2, '#000');
    }
  }
  g.globalAlpha = 1;
  g.globalCompositeOperation = 'source-over';
}

function tint(c: Ctx, lights: Light[]): void {
  // Warm (or cold) tint on the inner bands.
  c.globalCompositeOperation = 'lighter';
  for (const l of lights) {
    if (l.tint === null) continue;
    const power = l.power ?? 1;
    c.globalAlpha = 0.06 * power;
    ellipse(c, l.x, l.y, l.r * 0.72, l.r * 0.36, l.tint);
    c.globalAlpha = 0.08 * power;
    ellipse(c, l.x, l.y, l.r * 0.42, l.r * 0.21, l.tint);
  }
  c.globalAlpha = 1;
  c.globalCompositeOperation = 'source-over';
}
