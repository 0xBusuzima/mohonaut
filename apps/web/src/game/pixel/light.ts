/**
 * Night lighting and layer caching for the pixel world.
 *
 * Lighting: the scene is drawn fairly bright, then a layer of night is laid over it with holes
 * cut where the lights are. Each hole is a few stepped iso ellipses, so light falls off in hard
 * pixel bands rather than a smooth gradient, and a warm tint is added on top of the brightest
 * band. The screen edges get extra night (a stepped vignette) to pull the eye to the site.
 *
 * Caching: what does not move (sky, land, site ground, pads) is painted once and repainted only
 * when its key (size, pan, site size, unlocked pads, hover) changes; so is the night. Given a
 * `Stack` (PixelWorld's canvases under and over the scene) they are painted into those canvases
 * and the browser lays them together; otherwise into offscreen layers copied onto every frame.
 * Copying a screen-sized layer was the costliest part of a high-resolution frame.
 */
import { ellipse, rect, resolutionOf } from './draw';
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

/**
 * Canvases stacked with the scene's: `base` under it (the still layer), `night` over it, `glow`
 * over the night (the lights' tint, composited with plus-lighter) and `top` over all of that.
 */
export interface Stack {
  base: Ctx;
  night: Ctx;
  glow: Ctx;
  top: Ctx;
}

/** What a stack canvas holds: its key plus the canvas's own size (a resize clears it). */
const painted = new WeakMap<Ctx, string>();
function stale(g: Ctx, key: string): string | null {
  const full = `${g.canvas?.width ?? 0}x${g.canvas?.height ?? 0}|${key}`;
  return painted.get(g) === full ? null : full;
}

interface Layer {
  key: string;
  canvas: HTMLCanvasElement;
}
const statics = new WeakMap<Ctx, Layer>();
const nights = new WeakMap<Ctx, Layer>();

function layerFor(map: WeakMap<Ctx, Layer>, c: Ctx, W: number, H: number): Ctx | null {
  // No layer for an empty screen: drawImage throws on a 0-pixel canvas.
  if (typeof document === 'undefined' || W <= 0 || H <= 0) return null;
  let l = map.get(c);
  if (l === undefined) {
    l = { key: '', canvas: document.createElement('canvas') };
    map.set(c, l);
  }
  // A layer as sharp as the screen it is copied to (the high-resolution scene draws scaled).
  const r = resolutionOf(c);
  const w = Math.round(W * r);
  const h = Math.round(H * r);
  if (l.canvas.width !== w || l.canvas.height !== h) {
    l.canvas.width = w;
    l.canvas.height = h;
    l.key = '';
  }
  const g = l.canvas.getContext('2d');
  if (g !== null) {
    if (typeof g.setTransform === 'function') g.setTransform(r, 0, 0, r, 0, 0);
    g.imageSmoothingEnabled = r !== 1;
  }
  return g;
}

/**
 * Paints `paint` into `base` (a stack canvas) when `key` changed; without one, into a cached
 * layer that is then copied onto `c`.
 */
export function cached(
  c: Ctx,
  W: number,
  H: number,
  key: string,
  base: Ctx | undefined,
  paint: (g: Ctx) => void,
): void {
  if (base !== undefined) {
    const full = stale(base, key);
    if (full !== null) {
      base.clearRect(0, 0, W, H);
      paint(base);
      painted.set(base, full);
    }
    return;
  }
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
  c.drawImage(l.canvas, 0, 0, W, H);
}

/**
 * Lays the night over everything below `horizon`, with the lights cut out of it. `smooth` (the
 * voxel scene) uses soft gradients instead of the pixel scene's stepped, dithered bands.
 */
export function night(
  c: Ctx,
  W: number,
  H: number,
  horizon: number,
  lights: Light[],
  smooth = false,
  stack?: Stack,
): void {
  // Repainted only when a light moves or its strength visibly changes (eight steps).
  const key = `${horizon}|${lights
    .map((l) => `${Math.round(l.x)},${Math.round(l.y)},${l.r},${Math.round((l.power ?? 1) * 8)}`)
    .join(';')}`;
  if (stack !== undefined) {
    if (W <= 0 || H <= 0) return;
    const full = stale(stack.night, `${smooth ? 's' : 'p'}${key}`);
    if (full === null) return;
    if (smooth) paintNightSmooth(stack.night, W, H, horizon, lights);
    else paintNight(stack.night, W, H, horizon, lights);
    stack.glow.clearRect(0, 0, W, H);
    if (smooth) tintSmooth(stack.glow, lights);
    else tint(stack.glow, lights);
    painted.set(stack.night, full); // after the paint: a paint that throws is not kept
    return;
  }
  const g = layerFor(nights, c, W, H);
  const layer = nights.get(c);
  if (g === null || layer === undefined) return;
  if (layer.key !== `${smooth ? 's' : 'p'}${key}`) {
    if (smooth) paintNightSmooth(g, W, H, horizon, lights);
    else paintNight(g, W, H, horizon, lights);
    layer.key = `${smooth ? 's' : 'p'}${key}`; // after the paint: a paint that throws is not cached
  }
  c.drawImage(layer.canvas, 0, 0, W, H);
  if (smooth) tintSmooth(c, lights);
  else tint(c, lights);
}

/** An iso light pool as a radial gradient: `stops` of [offset, alpha] in `colour`. */
function pool(
  g: Ctx,
  l: Light,
  colour: string,
  stops: readonly [number, number][],
  scale = 1,
): void {
  if (typeof g.createRadialGradient !== 'function') return;
  const r = l.r * scale;
  g.save();
  g.translate(l.x, l.y);
  g.scale(1, 0.5);
  const grad = g.createRadialGradient(0, 0, 0, 0, 0, r);
  for (const [at, alpha] of stops) grad.addColorStop(at, withAlpha(colour, alpha));
  g.fillStyle = grad;
  g.fillRect(-r, -r, r * 2, r * 2);
  g.restore();
}

/** A soft pool of lamplight laid over the night (a light that moves every frame). */
export function glow(c: Ctx, l: Light): void {
  const p = l.power ?? 1;
  pool(c, l, l.tint ?? P.bone, [
    [0, 0.3 * p],
    [0.5, 0.12 * p],
    [1, 0],
  ]);
}

/** "#rrggbb" with an alpha, as rgba(). */
function withAlpha(hex: string, a: number): string {
  const n = Number.parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${Math.max(0, Math.min(1, a))})`;
}

function paintNightSmooth(g: Ctx, W: number, H: number, horizon: number, lights: Light[]): void {
  g.globalCompositeOperation = 'source-over';
  g.clearRect(0, 0, W, H);
  const top = Math.max(0, horizon - 24);
  // The night, a little lighter towards the horizon, and a soft vignette at the edges.
  if (typeof g.createLinearGradient === 'function') {
    const fade = g.createLinearGradient(0, top, 0, H);
    fade.addColorStop(0, withAlpha(P.dark, 0.25));
    fade.addColorStop(0.25, withAlpha(P.dark, 0.42));
    fade.addColorStop(1, withAlpha(P.dark, 0.5));
    g.fillStyle = fade;
    g.fillRect(0, top, W, H - top);
    const edge = g.createRadialGradient(
      W / 2,
      H / 2,
      Math.min(W, H) * 0.35,
      W / 2,
      H / 2,
      Math.max(W, H) * 0.75,
    );
    edge.addColorStop(0, withAlpha(P.night, 0));
    edge.addColorStop(1, withAlpha(P.night, 0.4));
    g.fillStyle = edge;
    g.fillRect(0, top, W, H - top);
  } else rect(g, 0, top, W, H - top, P.dark);
  // Light pools fade the night away smoothly.
  g.globalCompositeOperation = 'destination-out';
  for (const l of lights) {
    const p = l.power ?? 1;
    pool(g, l, '#000000', [
      [0, 0.95 * p],
      [0.45, 0.6 * p],
      [1, 0],
    ]);
  }
  g.globalCompositeOperation = 'source-over';
}

function tintSmooth(c: Ctx, lights: Light[]): void {
  c.globalCompositeOperation = 'lighter';
  for (const l of lights) {
    if (l.tint === null) continue;
    const p = l.power ?? 1;
    pool(
      c,
      l,
      l.tint,
      [
        [0, 0.22 * p],
        [0.5, 0.08 * p],
        [1, 0],
      ],
      0.85,
    );
  }
  c.globalCompositeOperation = 'source-over';
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
