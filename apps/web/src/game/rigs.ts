/**
 * Gen-1 rig drawings (docs/05 §2.9): one shape per rig type, in two states, as plain drawing
 * primitives so the PixiJS scene and the SVG style sheet (brand/sprites) draw the same thing.
 * Origin = the pad centre on the ground; y grows downwards. Rigs are painted safety orange while
 * running (sodium lamp lit, steam at the top) and steel grey when switched off (docs/05 §2.4).
 */

type Primitive =
  | { kind: 'line'; points: number[]; color: number; width: number }
  | { kind: 'poly'; points: number[]; fill: number }
  | { kind: 'rect'; x: number; y: number; w: number; h: number; fill: number }
  | { kind: 'circle'; x: number; y: number; r: number; fill: number };

export interface RigShape {
  parts: Primitive[];
  /** Where the steam rises from (top of the rig). */
  steamY: number;
}

const ORANGE = 0xff6b1a;
const STEEL = 0x39414a;
const GRAPHITE = 0x22272d;
const CONCRETE = 0x8b939c;
const AMBER = 0xffb31a;
const BONE = 0xece7dc;

/** Two legs from the ground to the crown and crossbars between them. */
function mast(base: number, top: number, h: number, bars: number, paint: number): Primitive[] {
  const out: Primitive[] = [
    { kind: 'line', points: [-base, 0, -top, -h], color: paint, width: 3 },
    { kind: 'line', points: [base, 0, top, -h], color: paint, width: 3 },
  ];
  for (let i = 1; i <= bars; i++) {
    const t = i / (bars + 1);
    const w = base + (top - base) * t;
    out.push({ kind: 'line', points: [-w, -h * t, w, -h * t], color: paint, width: 2 });
  }
  return out;
}

function lamp(x: number, y: number, running: boolean): Primitive {
  return { kind: 'circle', x, y, r: 2.5, fill: running ? AMBER : STEEL };
}

function skid(w: number): Primitive {
  return { kind: 'rect', x: -w / 2, y: -5, w, h: 5, fill: GRAPHITE };
}

/** The highest point of a drawing (the smallest y). */
function topOf(parts: Primitive[]): number {
  return Math.min(
    ...parts.map((p) => {
      if (p.kind === 'rect') return p.y;
      if (p.kind === 'circle') return p.y - p.r;
      return Math.min(...p.points.filter((_, k) => k % 2 === 1));
    }),
  );
}

/** The drawing of rig `typeId` (0-5); unknown types fall back to the Rotary Rig. */
export function rigShape(typeId: number, running: boolean): RigShape {
  const parts = rigParts(typeId, running);
  return { parts, steamY: topOf(parts) - 1 };
}

function rigParts(typeId: number, running: boolean): Primitive[] {
  const paint = running ? ORANGE : STEEL;
  const box = running ? CONCRETE : GRAPHITE;
  switch (typeId) {
    case 0: // Pilot Rig: a tripod over the hole with a small engine.
      return [
        skid(26),
        { kind: 'line', points: [-11, 0, 0, -28], color: paint, width: 3 },
        { kind: 'line', points: [11, 0, 0, -28], color: paint, width: 3 },
        { kind: 'line', points: [0, -3, 0, -28], color: paint, width: 2 },
        { kind: 'rect', x: 6, y: -11, w: 9, h: 6, fill: box },
        lamp(0, -30, running),
      ];
    case 2: // Top Drive: a straight lattice mast with the drive box half way up.
      return [
        skid(34),
        ...mast(7, 5, 46, 0, paint),
        { kind: 'line', points: [-7, -6, 5, -18, -6, -30, 5, -42], color: paint, width: 2 },
        { kind: 'rect', x: -6, y: -50, w: 12, h: 4, fill: paint },
        { kind: 'rect', x: -4, y: -30, w: 8, h: 8, fill: box },
        lamp(-8, -44, running),
      ];
    case 3: // Diamond Core Drill: an angled mast and a rack of core boxes.
      return [
        skid(38),
        { kind: 'line', points: [-8, 0, 6, -50], color: paint, width: 3 },
        { kind: 'line', points: [2, 0, 12, -48], color: paint, width: 3 },
        { kind: 'line', points: [-5, -12, 4, -12], color: paint, width: 2 },
        { kind: 'line', points: [-2, -26, 7, -26], color: paint, width: 2 },
        { kind: 'line', points: [1, -39, 10, -39], color: paint, width: 2 },
        { kind: 'rect', x: 12, y: -9, w: 12, h: 3, fill: BONE },
        { kind: 'rect', x: 12, y: -5, w: 12, h: 3, fill: CONCRETE },
        lamp(10, -51, running),
      ];
    case 4: // Turbodrill: a tall mast, a V-door ramp and a mud pump beside it.
      return [
        skid(44),
        ...mast(11, 4, 58, 3, paint),
        { kind: 'rect', x: -6, y: -62, w: 12, h: 4, fill: paint },
        { kind: 'line', points: [20, 0, 6, -14], color: paint, width: 2 },
        { kind: 'rect', x: -26, y: -11, w: 12, h: 9, fill: box },
        { kind: 'line', points: [-14, -6, -9, -6], color: CONCRETE, width: 2 },
        lamp(0, -66, running),
      ];
    case 5: // Plasma Bore: a heavy enclosed tower with a power unit.
      return [
        skid(46),
        { kind: 'poly', points: [-13, -5, 13, -5, 7, -66, -7, -66], fill: paint },
        { kind: 'rect', x: -2, y: -64, w: 4, h: 56, fill: GRAPHITE },
        { kind: 'rect', x: -9, y: -70, w: 18, h: 4, fill: paint },
        { kind: 'rect', x: 15, y: -14, w: 10, h: 12, fill: box },
        lamp(-4, -72, running),
        lamp(4, -72, running),
      ];
    default: // 1, Rotary Rig: an A-frame mast, crown block and rotary table.
      return [
        skid(30),
        ...mast(10, 3, 36, 2, paint),
        { kind: 'rect', x: -5, y: -40, w: 10, h: 4, fill: paint },
        { kind: 'rect', x: -7, y: -8, w: 14, h: 3, fill: box },
        lamp(0, -43, running),
      ];
  }
}

const hex = (c: number) => `#${c.toString(16).padStart(6, '0')}`;

/** One rig as SVG elements, for the style sheet and tests. */
export function rigSvg(shape: RigShape): string {
  return shape.parts
    .map((p) => {
      switch (p.kind) {
        case 'line':
          return `<polyline points="${p.points.join(' ')}" fill="none" stroke="${hex(p.color)}" stroke-width="${p.width}" stroke-linecap="round" stroke-linejoin="round"/>`;
        case 'poly':
          return `<polygon points="${p.points.join(' ')}" fill="${hex(p.fill)}"/>`;
        case 'rect':
          return `<rect x="${p.x}" y="${p.y}" width="${p.w}" height="${p.h}" fill="${hex(p.fill)}"/>`;
        default:
          return `<circle cx="${p.x}" cy="${p.y}" r="${p.r}" fill="${hex(p.fill)}"/>`;
      }
    })
    .join('');
}
