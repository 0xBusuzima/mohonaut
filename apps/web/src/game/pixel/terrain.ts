/**
 * The night sky and the open land around the site. Static parts are painted into the cached
 * layer; `skyLife` adds what moves (twinkling stars, flickering flares) every frame.
 */
import { diamond, hash, line, px, rect } from './draw';
import type { Ctx } from './draw';
import { P } from './palette';
import { scrub } from './props';

const TW = 32;

export type Iso = (gx: number, gy: number) => { x: number; y: number };

/** The far ridge's flare stacks, as screen points. */
function flares(W: number, horizon: number): { x: number; y: number }[] {
  return Array.from({ length: 5 }, (_, k) => ({
    x: Math.floor(((k + 0.5) / 5) * W + Math.sin(k * 7) * 30),
    y: horizon - 10 - Math.floor(hash(k, 9) * 8),
  }));
}

function ridge(c: Ctx, W: number, base: number, amp: number, seed: number, col: string): void {
  for (let x = 0; x < W; x++) {
    const h = Math.sin(x / 37 + seed) * amp * 0.6 + Math.sin(x / 13 + seed * 2) * amp * 0.25 + amp;
    rect(c, x, Math.round(base - h), 1, Math.round(h) + 3, col);
  }
}

/** Sky bands, stars, the far ridge with its flare stacks. Static. */
export function sky(c: Ctx, W: number, horizon: number): void {
  const bands = [P.skyTop, P.skyMid, P.skyLow];
  const bh = Math.ceil((horizon + 10) / bands.length);
  bands.forEach((col, i) => {
    rect(c, 0, i * bh, W, bh, col);
    // Dithered edge into the next band.
    const next = bands[i + 1];
    if (next !== undefined) {
      for (let y = 0; y < 4; y++) {
        for (let x = y % 2; x < W; x += 2)
          px(c, x, (i + 1) * bh - 4 + y, y < 2 ? (x % 4 === 0 ? next : col) : next);
      }
    }
  });
  for (let i = 0; i < W / 4; i++) {
    const x = Math.floor(hash(i, 3) * W);
    const y = Math.floor(hash(i, 4) * (horizon - 20));
    px(c, x, y, hash(i, 5) > 0.8 ? P.star : P.starDim);
  }
  // A faint glow over the horizon from the oil field's flares.
  c.globalAlpha = 0.12;
  rect(c, 0, horizon - 26, W, 10, P.flare);
  rect(c, 0, horizon - 16, W, 10, P.flare);
  c.globalAlpha = 1;
  ridge(c, W, horizon - 2, 18, 1.3, P.hillFar);
  for (const f of flares(W, horizon)) {
    line(c, f.x - 3, f.y, f.x, f.y - 12, P.hillNear);
    line(c, f.x + 3, f.y, f.x, f.y - 12, P.hillNear);
  }
  ridge(c, W, horizon + 2, 9, 4.1, P.hillNear);
}

/** What moves in the sky: a few stars twinkle, the flare stacks flicker. */
export function skyLife(c: Ctx, W: number, horizon: number, t: number): void {
  for (let i = 0; i < W / 4; i += 3) {
    if (Math.sin(t * 2 + i) <= 0.7) continue;
    const x = Math.floor(hash(i, 3) * W);
    const y = Math.floor(hash(i, 4) * (horizon - 20));
    px(c, x, y, P.star);
  }
  flares(W, horizon).forEach((f, k) => {
    const hot = Math.sin(t * 9 + k * 3) > 0;
    px(c, f.x, f.y - 13, hot ? P.flareHot : P.flare);
    px(c, f.x, f.y - 14, P.flare);
    if (hot) px(c, f.x, f.y - 15, P.flare);
  });
}

/** The flare tips, lit with flicker off (reduced motion). */
export function skyStill(c: Ctx, W: number, horizon: number): void {
  for (const f of flares(W, horizon)) {
    px(c, f.x, f.y - 13, P.flareHot);
    px(c, f.x, f.y - 14, P.flare);
  }
}

/**
 * Open land: iso tiles from the horizon to the bottom of the screen, everywhere outside the
 * site (gx 0..gw, gy 0..gh). Warm dark earth with specks, rocks and scrub, hazier towards the
 * horizon; the access road runs from the gate (gx < 0, gy 2..3) up to the horizon.
 */
export function land(
  c: Ctx,
  W: number,
  H: number,
  horizon: number,
  ox: number,
  oy: number,
  iso: Iso,
  gw: number,
  gh: number,
): void {
  const sMin = Math.floor((4 * (horizon - oy)) / TW) - 2;
  const sMax = Math.ceil((4 * (H - oy)) / TW) + 2;
  const dMin = Math.floor((2 * (-TW - ox)) / TW) - 1;
  const dMax = Math.ceil((2 * (W + TW - ox)) / TW) + 1;
  c.save();
  c.beginPath();
  c.rect(0, horizon + 1, W, H - horizon);
  c.clip();
  for (let s = sMin; s <= sMax; s++) {
    for (let d = dMin; d <= dMax; d++) {
      if ((s + d) % 2 !== 0) continue;
      const gx = (s + d) / 2;
      const gy = (s - d) / 2;
      if (gx >= 0 && gx < gw && gy >= 0 && gy < gh) continue;
      const p = iso(gx, gy);
      const far = p.y - horizon; // distance below the horizon, in pixels
      const n = hash(gx, gy, 3);
      const road = gx < 0 && (gy === 2 || gy === 3);
      // Broad patches (3x3 tiles) rather than tile-by-tile changes, so no checkerboard shows.
      const patch = hash(Math.floor(gx / 3), Math.floor(gy / 3), 4);
      let col: string = patch < 0.3 ? P.earthAlt : patch > 0.8 ? P.earthDark : P.earth;
      if (road) col = P.road;
      if (far < 8) col = P.haze;
      diamond(c, p.x, p.y, TW, col);
      if (far < 30 && !road) {
        // Haze thinning out towards the viewer: a sparse dither over the far land.
        for (let k = 0; k < (30 - far) / 2; k++) {
          px(
            c,
            p.x - 10 + Math.floor(hash(gx, gy, 60 + k) * 20),
            p.y + 2 + Math.floor(hash(gx, gy, 70 + k) * 12),
            P.haze,
          );
        }
      }
      if (far < 18) continue;
      if (road) {
        // Two ruts along the road (the gx direction: down and to the right).
        const a = gy === 2 ? 4 : -4;
        line(c, p.x - 8 + a, p.y + 4, p.x + 8 + a, p.y + 12, P.roadRut);
        continue;
      }
      for (let k = 0; k < 3; k++) {
        px(
          c,
          p.x - 8 + Math.floor(hash(gx, gy, 10 + k) * 16),
          p.y + 3 + Math.floor(hash(gx, gy, 20 + k) * 10),
          P.earthSpeck,
        );
      }
      if (n > 0.84) scrub(c, p.x - 4 + Math.floor(hash(gx, gy, 5) * 8), p.y + 9, n > 0.93 ? 0 : 1);
    }
  }
  c.restore();
}
