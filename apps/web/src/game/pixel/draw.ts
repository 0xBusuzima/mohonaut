/**
 * Pixel-art drawing on a low-resolution canvas (one canvas pixel = one art pixel; the canvas is
 * scaled up with `image-rendering: pixelated`). Only integer rectangles are drawn, never
 * anti-aliased paths, so every edge stays a hard pixel edge.
 */

export type Ctx = CanvasRenderingContext2D;

export function rect(c: Ctx, x: number, y: number, w: number, h: number, color: string): void {
  if (w <= 0 || h <= 0) return;
  c.fillStyle = color;
  c.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
}

export function px(c: Ctx, x: number, y: number, color: string): void {
  rect(c, x, y, 1, 1, color);
}

/** Bresenham line, `t` pixels thick (a square brush). */
export function line(
  c: Ctx,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  color: string,
  t = 1,
): void {
  let x = Math.round(x0);
  let y = Math.round(y0);
  const xe = Math.round(x1);
  const ye = Math.round(y1);
  const dx = Math.abs(xe - x);
  const dy = -Math.abs(ye - y);
  const sx = x < xe ? 1 : -1;
  const sy = y < ye ? 1 : -1;
  let err = dx + dy;
  const o = Math.floor((t - 1) / 2);
  c.fillStyle = color;
  for (;;) {
    c.fillRect(x - o, y - o, t, t);
    if (x === xe && y === ye) break;
    const e2 = 2 * err;
    if (e2 >= dy) {
      err += dy;
      x += sx;
    }
    if (e2 <= dx) {
      err += dx;
      y += sy;
    }
  }
}

/** A polyline through [x0, y0, x1, y1, ...]. */
export function polyline(c: Ctx, pts: number[], color: string, t = 1): void {
  for (let i = 0; i + 3 < pts.length; i += 2) {
    line(c, pts[i] ?? 0, pts[i + 1] ?? 0, pts[i + 2] ?? 0, pts[i + 3] ?? 0, color, t);
  }
}

/** A filled convex polygon, scanline by scanline. */
export function polygon(c: Ctx, pts: number[], color: string): void {
  const n = pts.length / 2;
  let top = Infinity;
  let bottom = -Infinity;
  for (let i = 0; i < n; i++) {
    top = Math.min(top, pts[2 * i + 1] ?? 0);
    bottom = Math.max(bottom, pts[2 * i + 1] ?? 0);
  }
  c.fillStyle = color;
  for (let y = Math.round(top); y <= Math.round(bottom); y++) {
    let lo = Infinity;
    let hi = -Infinity;
    for (let i = 0; i < n; i++) {
      const ax = pts[2 * i] ?? 0;
      const ay = pts[2 * i + 1] ?? 0;
      const bx = pts[(2 * i + 2) % (2 * n)] ?? 0;
      const by = pts[(2 * i + 3) % (2 * n)] ?? 0;
      if ((y >= ay && y <= by) || (y >= by && y <= ay)) {
        const x = ay === by ? Math.min(ax, bx) : ax + ((y - ay) * (bx - ax)) / (by - ay);
        const x2 = ay === by ? Math.max(ax, bx) : x;
        lo = Math.min(lo, x, x2);
        hi = Math.max(hi, x, x2);
      }
    }
    if (lo <= hi) c.fillRect(Math.round(lo), y, Math.round(hi) - Math.round(lo) + 1, 1);
  }
}

/** A 2:1 isometric diamond whose top corner is at (x, y): `w` wide, `w / 2` tall. */
export function diamond(c: Ctx, x: number, y: number, w: number, color: string): void {
  const h = w / 2;
  c.fillStyle = color;
  for (let r = 0; r < h; r++) {
    const half = r < h / 2 ? (r + 1) * 2 : (h - r) * 2;
    c.fillRect(Math.round(x - half), Math.round(y + r), half * 2, 1);
  }
}

/** The outline of the same diamond. */
export function diamondEdge(c: Ctx, x: number, y: number, w: number, color: string): void {
  const h = w / 2;
  line(c, x - 1, y, x - w / 2, y + h / 2 - 1, color);
  line(c, x, y, x + w / 2 - 1, y + h / 2 - 1, color);
  line(c, x - w / 2, y + h / 2, x - 1, y + h - 1, color);
  line(c, x + w / 2 - 1, y + h / 2, x, y + h - 1, color);
}

/**
 * An isometric box standing on a footprint `w` wide (2:1 diamond) and `z` tall; the footprint's
 * top corner at (x, y). Top, left and right faces in their own colours.
 */
export function box(
  c: Ctx,
  x: number,
  y: number,
  w: number,
  z: number,
  top: string,
  left: string,
  right: string,
): void {
  const h = w / 2;
  polygon(c, [x - w / 2, y + h / 2 - z, x, y + h - z, x, y + h, x - w / 2, y + h / 2], left);
  polygon(
    c,
    [x, y + h - z, x + w / 2 - 1, y + h / 2 - z, x + w / 2 - 1, y + h / 2, x, y + h],
    right,
  );
  diamond(c, x, y - z, w, top);
}

/** Deterministic noise in [0, 1) for texture speckles. */
export function hash(x: number, y: number, s = 0): number {
  let h = (x * 374761393 + y * 668265263 + s * 2246822519) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** A filled ellipse, scanline by scanline (whole pixels; iso light pools use ry = rx / 2). */
export function ellipse(
  c: Ctx,
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  color: string | CanvasPattern,
): void {
  if (rx <= 0 || ry <= 0) return;
  c.fillStyle = color;
  const top = Math.round(cy - ry);
  const bottom = Math.round(cy + ry);
  for (let y = top; y <= bottom; y++) {
    const dy = (y + 0.5 - cy) / ry;
    if (Math.abs(dy) > 1) continue;
    const half = Math.round(rx * Math.sqrt(1 - dy * dy));
    if (half > 0) c.fillRect(Math.round(cx) - half, y, half * 2, 1);
  }
}

/** `hex` lighter (factor > 1) or darker (< 1), each channel clamped. */
export function shade(hex: string, factor: number): string {
  const n = Number.parseInt(hex.slice(1), 16);
  const ch = (shift: number) =>
    Math.max(0, Math.min(255, Math.round(((n >> shift) & 255) * factor)))
      .toString(16)
      .padStart(2, '0');
  return `#${ch(16)}${ch(8)}${ch(0)}`;
}
