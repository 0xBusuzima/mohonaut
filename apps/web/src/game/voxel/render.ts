/**
 * A small voxel renderer for build-time sprites (docs/01 7, the "voxel diorama" look): voxels
 * seen from the game's isometric angle, lit by a night sky light from the upper left, with per-corner
 * ambient occlusion, cast shadows and glowing (emissive) voxels. Pure: no DOM, no canvas, so it
 * runs in Node at build time and in tests. Each model is ours, defined in code.
 */

export type Rgb = readonly [number, number, number];

export interface Voxel {
  colour: Rgb;
  /** Glows: not shaded, and lights its surroundings in the bloom pass. */
  emissive?: boolean;
}

/** A voxel model: integer x (right-down), y (left-down), z (up) to a voxel. */
export class Model {
  private readonly cells = new Map<string, Voxel>();

  set(x: number, y: number, z: number, v: Voxel): this {
    this.cells.set(`${x},${y},${z}`, v);
    return this;
  }

  /** Fills the box [x0, x1] x [y0, y1] x [z0, z1] (inclusive). */
  box(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, v: Voxel): this {
    for (let x = x0; x <= x1; x++)
      for (let y = y0; y <= y1; y++) for (let z = z0; z <= z1; z++) this.set(x, y, z, v);
    return this;
  }

  get(x: number, y: number, z: number): Voxel | undefined {
    return this.cells.get(`${x},${y},${z}`);
  }

  has(x: number, y: number, z: number): boolean {
    return this.cells.has(`${x},${y},${z}`);
  }

  entries(): [number, number, number, Voxel][] {
    return [...this.cells].map(([k, v]) => {
      const [x = 0, y = 0, z = 0] = k.split(',').map(Number);
      return [x, y, z, v];
    });
  }

  get size(): number {
    return this.cells.size;
  }
}

export interface Image {
  width: number;
  height: number;
  /** RGBA, row-major. */
  data: Uint8ClampedArray;
  /** Where the voxel-space origin (0, 0, 0) lands in the image, to anchor the sprite. */
  origin: [number, number];
}

/** Where a voxel-space point lands in a rendered image (e.g. a pad's centre, for anchoring). */
export function anchorOf(
  img: Image,
  x: number,
  y: number,
  z: number,
  scale: number,
): [number, number] {
  const [px, py] = project(x, y, z, scale);
  return [img.origin[0] + px, img.origin[1] + py];
}

export interface RenderOptions {
  /** Screen pixels per voxel edge (the top face is a 2s x s diamond). */
  scale: number;
  /** Direction towards the light, in voxel space (z up). */
  light?: readonly [number, number, number];
  /** How dark a face in shadow gets (0..1 of its lit value). */
  shadow?: number;
  /** Ambient occlusion strength (0..1). */
  occlusion?: number;
  /** Bloom radius around glowing voxels, in pixels (0 for none). */
  bloom?: number;
}

type Face = 'top' | 'right' | 'left';

/** The three faces the camera sees, their outward normals and light levels before shadows. */
const FACES: Record<Face, { n: readonly [number, number, number]; base: number }> = {
  top: { n: [0, 0, 1], base: 1 },
  left: { n: [0, 1, 0], base: 0.78 },
  right: { n: [1, 0, 0], base: 0.6 },
};

/** Screen position of a voxel-space point (before the image offset). */
function project(x: number, y: number, z: number, s: number): [number, number] {
  return [(x - y) * s, ((x + y) * s) / 2 - z * s];
}

/** Classic voxel AO for one face corner: two sides and the corner between them. */
function cornerAo(side1: boolean, side2: boolean, corner: boolean): number {
  if (side1 && side2) return 0;
  return 3 - Number(side1) - Number(side2) - Number(corner);
}

/**
 * The AO (0 dark .. 1 open) at each corner of a face, in the face's own (u, v) corner order
 * (0,0), (1,0), (1,1), (0,1). `a` and `b` are the face's two in-plane axes.
 */
function faceAo(
  m: Model,
  x: number,
  y: number,
  z: number,
  n: readonly [number, number, number],
  a: readonly [number, number, number],
  b: readonly [number, number, number],
): [number, number, number, number] {
  // The layer just outside the face.
  const ox = x + n[0];
  const oy = y + n[1];
  const oz = z + n[2];
  const at = (da: number, db: number) =>
    m.has(ox + a[0] * da + b[0] * db, oy + a[1] * da + b[1] * db, oz + a[2] * da + b[2] * db);
  const corner = (da: number, db: number) => cornerAo(at(da, 0), at(0, db), at(da, db)) / 3;
  return [corner(-1, -1), corner(1, -1), corner(1, 1), corner(-1, 1)];
}

/** True when a ray from `p` towards the light hits a voxel (a cast shadow). */
function shadowed(m: Model, p: readonly [number, number, number], l: readonly number[]): boolean {
  const step = 0.5;
  for (let t = 0.75; t < 64; t += step) {
    const x = Math.floor(p[0] + (l[0] ?? 0) * t);
    const y = Math.floor(p[1] + (l[1] ?? 0) * t);
    const z = Math.floor(p[2] + (l[2] ?? 0) * t);
    if (z > 64) return false;
    if (m.has(x, y, z)) return true;
  }
  return false;
}

/** Renders `m` to a transparent image just large enough to hold it. */
export function render(m: Model, opts: RenderOptions): Image {
  const s = opts.scale;
  const lightDir = opts.light ?? [-0.55, -0.35, 1];
  const len = Math.hypot(...lightDir);
  const l = lightDir.map((v) => v / len);
  const shadowLevel = opts.shadow ?? 0.62;
  const occlusion = opts.occlusion ?? 0.42;
  const bloom = opts.bloom ?? 0;

  // Bounds on screen.
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const [x, y, z] of m.entries()) {
    for (const [cx, cy, cz] of [
      [x, y + 1, z + 1],
      [x + 1, y, z + 1],
      [x, y, z + 1],
      [x + 1, y + 1, z],
    ] as const) {
      const [px, py] = project(cx, cy, cz, s);
      minX = Math.min(minX, px);
      maxX = Math.max(maxX, px);
      minY = Math.min(minY, py);
      maxY = Math.max(maxY, py);
    }
  }
  if (m.size === 0) return { width: 0, height: 0, data: new Uint8ClampedArray(0), origin: [0, 0] };
  const pad = Math.ceil(bloom);
  const width = Math.ceil(maxX - minX) + pad * 2;
  const height = Math.ceil(maxY - minY) + pad * 2;
  const offX = -minX + pad;
  const offY = -minY + pad;
  const rgb = new Float32Array(width * height * 3);
  const alpha = new Uint8Array(width * height);
  const depth = new Float32Array(width * height).fill(-Infinity);
  const glow = new Float32Array(width * height * 3);

  for (const [x, y, z, v] of m.entries()) {
    for (const face of ['top', 'left', 'right'] as const) {
      const { n, base } = FACES[face];
      if (m.has(x + n[0], y + n[1], z + n[2])) continue;
      // The face as an origin and two edges in voxel space.
      const origin: [number, number, number] =
        face === 'top' ? [x, y, z + 1] : face === 'right' ? [x + 1, y, z] : [x, y + 1, z];
      const a: [number, number, number] = face === 'right' ? [0, 1, 0] : [1, 0, 0];
      const b: [number, number, number] = face === 'top' ? [0, 1, 0] : [0, 0, 1];
      const ao = faceAo(m, x, y, z, n, a, b);
      const corners = [
        [0, 0],
        [1, 0],
        [1, 1],
        [0, 1],
      ].map(([u = 0, w = 0]) =>
        project(
          origin[0] + a[0] * u + b[0] * w,
          origin[1] + a[1] * u + b[1] * w,
          origin[2] + a[2] * u + b[2] * w,
          s,
        ),
      );
      const xs = corners.map((c) => c[0] + offX);
      const ys = corners.map((c) => c[1] + offY);
      const x0 = Math.floor(Math.min(...xs));
      const x1 = Math.ceil(Math.max(...xs));
      const y0 = Math.floor(Math.min(...ys));
      const y1 = Math.ceil(Math.max(...ys));
      // Screen deltas of the face's u and w edges, to map a pixel back to (u, w).
      const [ax, ay] = [xs[1]! - xs[0]!, ys[1]! - ys[0]!]; // eslint-disable-line @typescript-eslint/no-non-null-assertion -- four corners, always
      const [bx, by] = [xs[3]! - xs[0]!, ys[3]! - ys[0]!]; // eslint-disable-line @typescript-eslint/no-non-null-assertion -- four corners, always
      const det = ax * by - ay * bx;
      for (let py = y0; py < y1; py++) {
        for (let px = x0; px < x1; px++) {
          const dx = px + 0.5 - xs[0]!; // eslint-disable-line @typescript-eslint/no-non-null-assertion -- four corners, always
          const dy = py + 0.5 - ys[0]!; // eslint-disable-line @typescript-eslint/no-non-null-assertion -- four corners, always
          const u = (dx * by - dy * bx) / det;
          const w = (ax * dy - ay * dx) / det;
          if (u < 0 || u >= 1 || w < 0 || w >= 1) continue;
          const i = py * width + px;
          // Nearer the camera = larger x + y + z; a face point's depth.
          const d =
            origin[0] +
            a[0] * u +
            b[0] * w +
            origin[1] +
            a[1] * u +
            b[1] * w +
            origin[2] +
            a[2] * u +
            b[2] * w;
          if (d <= (depth[i] ?? -Infinity)) continue;
          depth[i] = d;
          alpha[i] = 255;
          let light = 1;
          if (v.emissive !== true) {
            const aoAt =
              ao[0] * (1 - u) * (1 - w) + ao[1] * u * (1 - w) + ao[2] * u * w + ao[3] * (1 - u) * w;
            const p: [number, number, number] = [
              origin[0] + a[0] * u + b[0] * w + n[0] * 0.01,
              origin[1] + a[1] * u + b[1] * w + n[1] * 0.01,
              origin[2] + a[2] * u + b[2] * w + n[2] * 0.01,
            ];
            const facing = n[0] * (l[0] ?? 0) + n[1] * (l[1] ?? 0) + n[2] * (l[2] ?? 0);
            const lit = facing > 0 && !shadowed(m, p, l) ? 1 : shadowLevel;
            light = base * lit * (1 - occlusion + occlusion * aoAt);
          }
          for (let c = 0; c < 3; c++) {
            const value = (v.colour[c] ?? 0) * light;
            rgb[i * 3 + c] = value;
            glow[i * 3 + c] = v.emissive === true ? (v.colour[c] ?? 0) : 0;
          }
        }
      }
    }
  }

  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    data[i * 4] = rgb[i * 3] ?? 0;
    data[i * 4 + 1] = rgb[i * 3 + 1] ?? 0;
    data[i * 4 + 2] = rgb[i * 3 + 2] ?? 0;
    data[i * 4 + 3] = alpha[i] ?? 0;
  }
  if (bloom > 0) addBloom(data, glow, width, height, bloom);
  return { width, height, data, origin: [offX, offY] };
}

/** A soft halo around glowing pixels, added on top (also onto transparent pixels). */
function addBloom(
  data: Uint8ClampedArray,
  glow: Float32Array,
  width: number,
  height: number,
  radius: number,
): void {
  const r = Math.ceil(radius);
  const halo = new Float32Array(width * height * 3);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      if ((glow[i * 3] ?? 0) + (glow[i * 3 + 1] ?? 0) + (glow[i * 3 + 2] ?? 0) === 0) continue;
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          const tx = x + dx;
          const ty = y + dy;
          if (tx < 0 || ty < 0 || tx >= width || ty >= height) continue;
          const fall = Math.max(0, 1 - Math.hypot(dx, dy) / (radius + 0.5));
          const k = fall * fall * 0.05;
          const j = ty * width + tx;
          for (let c = 0; c < 3; c++)
            halo[j * 3 + c] = (halo[j * 3 + c] ?? 0) + (glow[i * 3 + c] ?? 0) * k;
        }
      }
    }
  }
  for (let j = 0; j < width * height; j++) {
    const strength = Math.min(
      1,
      ((halo[j * 3] ?? 0) + (halo[j * 3 + 1] ?? 0) + (halo[j * 3 + 2] ?? 0)) / 255,
    );
    if (strength <= 0) continue;
    const a = (data[j * 4 + 3] ?? 0) / 255;
    for (let c = 0; c < 3; c++) {
      const h = Math.min(255, halo[j * 3 + c] ?? 0);
      data[j * 4 + c] = a > 0 ? (data[j * 4 + c] ?? 0) + h : h / Math.max(strength, 1e-6);
    }
    data[j * 4 + 3] = Math.max(data[j * 4 + 3] ?? 0, Math.round(strength * 255 * 0.85));
  }
}
