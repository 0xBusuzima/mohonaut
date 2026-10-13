/**
 * Voxel models of the drill site, all ours and defined in code (docs/01 7: the voxel diorama
 * look of our own night drilling plateau; no island, no pastel trees, no outside models).
 */
import { P } from '../pixel/palette';
import { Model } from './render';
import type { Rgb, Voxel } from './render';

/** "#rrggbb" to a voxel colour. */
export function hex(c: string): Rgb {
  const n = Number.parseInt(c.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

const v = (c: string, emissive = false): Voxel =>
  emissive ? { colour: hex(c), emissive } : { colour: hex(c) };

const CONCRETE = v(P.padTop);
const CONCRETE_EDGE = v(P.padEdge);
const HAZARD = v(P.hazard);
const HAZARD_DARK = v(P.hazardDark);
const STEEL = v(P.steel);
const STEEL_LIGHT = v(P.steelLight);
const ORANGE = v(P.orange);
const ORANGE_DARK = v(P.orangeDark);
const MUD = v('#4a3626');
const CABLE = v(P.concrete);
const LAMP = v(P.window, true);
const BEACON = v('#ff3b30', true);

/** A concrete pad `n` voxels square with a hazard-striped rim, one voxel thick at z = 0. */
function pad(m: Model, n: number): Model {
  for (let x = 0; x < n; x++) {
    for (let y = 0; y < n; y++) {
      const rim = x === 0 || y === 0 || x === n - 1 || y === n - 1;
      const stripe = Math.floor((x + y) / 2) % 2 === 0;
      m.set(
        x,
        y,
        0,
        rim ? (stripe ? HAZARD : HAZARD_DARK) : (x + y) % 7 === 0 ? CONCRETE_EDGE : CONCRETE,
      );
    }
  }
  return m;
}

/**
 * A lattice derrick: four legs from (lo, lo) to (hi, hi) at z0 leaning in by one voxel every
 * ten, girts every six voxels and a diagonal brace in each bay (alternating bay by bay).
 */
function derrick(
  m: Model,
  lo0: number,
  hi0: number,
  z0: number,
  top: number,
  paint = ORANGE,
): void {
  const dark = paint === ORANGE ? ORANGE_DARK : paint;
  for (let z = z0; z <= top; z++) {
    const inset = Math.floor((z - z0) / 10);
    const lo = lo0 + inset;
    const hi = hi0 - inset;
    for (const [x, y] of [
      [lo, lo],
      [hi, lo],
      [lo, hi],
      [hi, hi],
    ] as const)
      m.set(x, y, z, paint);
    const k = (z - z0) % 6;
    const span = hi - lo;
    if (k === 0) {
      for (let i = lo; i <= hi; i++) {
        m.set(i, lo, z, dark);
        m.set(i, hi, z, dark);
        m.set(lo, i, z, dark);
        m.set(hi, i, z, dark);
      }
    } else {
      const bay = Math.floor((z - z0) / 6);
      const t = Math.round((k / 6) * span);
      const i = bay % 2 === 0 ? lo + t : hi - t;
      m.set(i, hi, z, dark);
      m.set(hi, i, z, dark);
      m.set(i, lo, z, dark);
      m.set(lo, i, z, dark);
    }
  }
}

/** The Pilot Rig: a small skid with an engine box and a short A-frame mast, free with a site. */
export function pilotRig(): Model {
  const m = pad(new Model(), 12);
  m.box(3, 3, 1, 8, 8, 1, v(P.graphite));
  m.box(6, 4, 2, 8, 7, 4, STEEL);
  m.set(8, 5, 3, LAMP);
  for (let z = 2; z <= 13; z++) {
    const lean = Math.floor((z - 2) / 5);
    m.set(3 + lean, 4, z, ORANGE);
    m.set(3 + lean, 7, z, ORANGE);
    if (z % 4 === 0) m.box(3 + lean, 4, z, 3 + lean, 7, z, ORANGE_DARK);
  }
  m.box(4, 4, 14, 6, 7, 14, STEEL_LIGHT);
  m.set(5, 5, 15, BEACON);
  for (let z = 5; z <= 13; z++) m.set(5, 6, z, CABLE);
  return m;
}

/** The Top Drive: a taller derrick with the top drive on its rails, pipe set back on the floor. */
export function topDrive(): Model {
  const m = pad(new Model(), 18);
  m.box(4, 4, 1, 13, 13, 4, STEEL);
  m.box(5, 5, 1, 12, 12, 3, v(P.graphite));
  m.box(3, 3, 5, 14, 14, 5, STEEL_LIGHT);
  const top = 40;
  derrick(m, 4, 13, 6, top);
  m.box(7, 7, top + 1, 10, 10, top + 2, STEEL_LIGHT);
  m.set(8, 8, top + 3, BEACON);
  // Guide rails and the top drive itself, painted amber.
  for (let z = 8; z <= top; z++) m.set(10, 9, z, STEEL_LIGHT);
  m.box(8, 8, 18, 10, 10, 21, v(P.amber));
  for (let z = 6; z <= 17; z++) m.set(9, 9, z, STEEL_LIGHT);
  // Pipe stands set back on the floor, and the doghouse.
  for (let y = 5; y <= 12; y += 2) for (let z = 6; z <= 16; z++) m.set(5, y, z, v(P.concrete));
  m.box(14, 5, 6, 16, 10, 8, v(P.boneDark));
  m.box(14, 5, 9, 16, 10, 9, ORANGE_DARK);
  m.set(16, 8, 7, LAMP);
  return m;
}

/** The Diamond Core Drill: a crawler with a raked mast and trays of glowing core. */
export function diamondCoreDrill(): Model {
  const m = pad(new Model(), 16);
  // Tracks and body.
  m.box(3, 3, 1, 12, 4, 2, v(P.night));
  m.box(3, 10, 1, 12, 11, 2, v(P.night));
  m.box(4, 5, 2, 11, 9, 4, v(P.boneDark));
  m.box(9, 5, 5, 11, 9, 7, v(P.steel));
  m.box(11, 6, 6, 11, 8, 6, v(P.glassShine));
  // The raked mast: leaning back over the hole.
  for (let z = 5; z <= 26; z++) {
    const back = Math.floor((z - 5) / 4);
    m.set(6 - back, 6, z, ORANGE);
    m.set(6 - back, 8, z, ORANGE);
    if (z % 3 === 0) m.box(6 - back, 6, z, 6 - back, 8, z, ORANGE_DARK);
  }
  m.box(0, 6, 27, 2, 8, 28, STEEL_LIGHT);
  m.set(1, 7, 29, BEACON);
  // Core trays beside the drill: the samples glow cyan under the lamps.
  for (const y of [12, 13, 14]) {
    m.box(2, y, 1, 7, y, 1, v(P.woodDark));
    for (let x = 2; x <= 7; x += 2) m.set(x, y, 2, v(P.cyan, true));
  }
  return m;
}

/** The Turbodrill: a heavy derrick, two mud units and a power pack with exhaust stacks. */
export function turbodrill(): Model {
  const m = pad(new Model(), 22);
  m.box(5, 5, 1, 16, 16, 5, STEEL);
  m.box(6, 6, 1, 15, 15, 4, v(P.graphite));
  m.box(4, 4, 6, 17, 17, 6, STEEL_LIGHT);
  const top = 46;
  derrick(m, 5, 16, 7, top);
  m.box(8, 8, top + 1, 13, 13, top + 3, STEEL_LIGHT);
  m.set(10, 10, top + 4, BEACON);
  m.set(11, 11, top + 4, BEACON);
  for (let z = 12; z <= top; z++) m.set(10, 11, z, CABLE);
  m.box(9, 10, 9, 11, 12, 12, v(P.amber));
  // Two mud units on the pad and the power pack with its stacks.
  m.box(1, 15, 1, 4, 20, 4, ORANGE_DARK);
  m.box(6, 18, 1, 9, 21, 4, ORANGE_DARK);
  m.box(15, 1, 1, 20, 4, 5, v(P.steel));
  for (const x of [16, 19]) for (let z = 6; z <= 11; z++) m.set(x, 2, z, v(P.steelLight));
  m.set(19, 3, 3, LAMP);
  return m;
}

/** The Plasma Bore: no lattice; a sealed tower ringed with glowing coils over a coolant skid. */
export function plasmaBore(): Model {
  const m = pad(new Model(), 20);
  m.box(4, 4, 1, 15, 15, 3, v(P.graphite));
  // Coolant tanks at the corners.
  for (const [x, y] of [
    [2, 2],
    [15, 2],
    [2, 15],
  ] as const)
    m.box(x, y, 1, x + 2, y + 2, 6, v(P.steelLight));
  // The tower: a round column with a cyan coil every five voxels.
  for (let z = 4; z <= 44; z++) {
    const r = z > 38 ? 2.4 : 3.6;
    for (let x = 5; x <= 14; x++)
      for (let y = 5; y <= 14; y++) {
        const d = Math.hypot(x - 9.5, y - 9.5);
        if (d > r || d < r - 1.2) continue;
        m.set(x, y, z, z % 5 === 0 ? v(P.cyan, true) : v(z > 38 ? P.steelLight : P.steel));
      }
  }
  m.box(9, 9, 45, 10, 10, 46, v(P.cyan, true));
  return m;
}

/**
 * The Rotary Rig on its pad: a lattice derrick on a steel substructure, crown block with an
 * aircraft beacon, the drill line and travelling block, a drawworks house with a lit window, a
 * mud tank and a work lamp on the pad's corner.
 */
export function rotaryRig(): Model {
  const m = pad(new Model(), 16);
  // Substructure and rig floor.
  m.box(4, 4, 1, 11, 11, 3, STEEL);
  m.box(5, 5, 1, 10, 10, 2, v(P.graphite));
  m.box(3, 3, 4, 12, 12, 4, STEEL_LIGHT);
  const top = 32;
  derrick(m, 4, 11, 5, top);
  // Crown block and its beacon.
  m.box(6, 6, top + 1, 9, 9, top + 2, STEEL_LIGHT);
  m.set(7, 7, top + 3, BEACON);
  // Drill line and travelling block, and the kelly down to the floor.
  for (let z = 14; z <= top; z++) m.set(7, 8, z, CABLE);
  m.box(7, 7, 11, 8, 8, 13, v(P.amber));
  for (let z = 5; z <= 10; z++) m.set(7, 8, z, STEEL_LIGHT);
  // Drawworks house on the floor with a lit window.
  m.box(12, 5, 5, 14, 9, 7, v(P.boneDark));
  m.box(12, 5, 8, 14, 9, 8, ORANGE_DARK);
  m.set(14, 7, 6, LAMP);
  // Mud tank on the pad, open on top.
  m.box(1, 12, 1, 4, 14, 3, STEEL);
  m.box(2, 13, 3, 3, 13, 3, MUD);
  // Work lamp on the far corner.
  for (let z = 1; z <= 7; z++) m.set(1, 1, z, STEEL_LIGHT);
  m.set(1, 1, 8, LAMP);
  return m;
}

/** A stable 0..1 value per cell, for textures without randomness. */
function noise(x: number, y: number, z: number): number {
  const h = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453;
  return h - Math.floor(h);
}

/**
 * A corner of the drill site as a cut-away block of ground (docs/01 7): earth and gravel on
 * top, and on its cut sides the World Bore's strata in their lithology colours, so the maquette
 * shows what the rigs are drilling into. On it: the Rotary Rig, the diesel tank, the Market
 * container, a pipe rack, a mud pit and work lamps.
 */
export function siteDiorama(): Model {
  const m = new Model();
  const N = 44;
  const strata = ['#B08A5E', '#D8C8A0', '#B79A9A', '#7E8288'];
  // The block: four strata bands below the surface, three voxels each.
  for (let x = 0; x < N; x++)
    for (let y = 0; y < N; y++)
      for (let z = -12; z < 0; z++) {
        const band = Math.min(3, Math.floor(-z / 3));
        const c = strata[band] ?? '#7E8288';
        m.set(x, y, z, v(noise(x, y, z) > 0.94 ? P.rock : c));
      }
  // The surface: dark earth with gravel and a few puddles.
  for (let x = 0; x < N; x++)
    for (let y = 0; y < N; y++) {
      const n = noise(x, y, 0);
      m.set(x, y, 0, v(n > 0.9 ? P.gravel : n > 0.72 ? P.groundSpeck : P.ground));
    }
  for (const [cx, cy] of [
    [30, 8],
    [10, 34],
  ] as const)
    for (let x = cx - 2; x <= cx + 2; x++)
      for (let y = cy - 1; y <= cy + 1; y++) m.set(x, y, 0, v(P.puddle));
  // The rig on its pad, lifted onto the surface.
  for (const [x, y, z, vox] of rotaryRig().entries()) m.set(x + 14, y + 14, z + 1, vox);
  // Diesel tank: a cylinder of steel with an orange band and a gauge window.
  for (let x = 2; x <= 9; x++)
    for (let y = 18; y <= 25; y++) {
      if (Math.hypot(x - 5.5, y - 21.5) > 3.8) continue;
      for (let z = 1; z <= 10; z++)
        m.set(x, y, z, z === 7 ? v(P.orange) : z === 10 ? v(P.steelLight) : v(P.steel));
    }
  m.set(9, 21, 5, v(P.cyan, true));
  // The Market container.
  m.box(34, 2, 1, 41, 5, 4, v(P.orangeDark));
  m.box(34, 2, 5, 41, 5, 5, v(P.orange));
  for (let x = 35; x <= 40; x += 2) m.box(x, 5, 1, x, 5, 4, v(P.orange));
  // A pipe rack: three layers of drill pipe on sleepers.
  m.box(4, 30, 1, 4, 38, 1, v(P.woodDark));
  m.box(10, 30, 1, 10, 38, 1, v(P.woodDark));
  for (let layer = 0; layer < 3; layer++)
    for (let y = 31 + layer; y <= 37 - layer; y += 2)
      m.box(3, y, 2 + layer, 11, y, 2 + layer, v(layer % 2 === 0 ? P.concrete : P.steelLight));
  // The mud pit beside the pad.
  m.box(32, 30, 0, 39, 37, 0, v('#3a2a1e'));
  m.box(31, 29, 1, 40, 29, 1, v(P.woodDark));
  m.box(31, 38, 1, 40, 38, 1, v(P.woodDark));
  // A fence along the two near edges: posts every six voxels with hazard tape between.
  for (let i = 0; i < N; i++) {
    for (const [x, y] of [
      [N - 1, i],
      [i, N - 1],
    ] as const) {
      if (i % 6 === 0) m.box(x, y, 1, x, y, 3, v(P.fenceDark));
      else m.set(x, y, 2, Math.floor(i / 2) % 2 === 0 ? HAZARD : v(P.bone));
    }
  }
  // The diesel tanker at the gate.
  m.box(18, 36, 1, 27, 39, 1, v(P.graphite));
  for (const x of [19, 22, 26]) {
    m.set(x, 36, 1, v(P.night));
    m.set(x, 39, 1, v(P.night));
  }
  for (let x = 18; x <= 24; x++)
    for (let y = 36; y <= 39; y++)
      for (let z = 2; z <= 5; z++)
        if (Math.hypot(y - 37.5, z - 3.5) <= 2.2) m.set(x, y, z, v(z === 4 ? P.orange : P.bone));
  m.box(25, 36, 2, 27, 39, 5, v(P.orangeDark));
  m.box(27, 37, 4, 27, 38, 4, v(P.glassShine));
  m.set(27, 36, 2, LAMP);
  m.set(27, 39, 2, LAMP);
  // Crew on their rounds: hard hat, vest, dark trousers.
  for (const [x, y, vest] of [
    [12, 24, P.amber],
    [31, 17, P.orange],
    [28, 26, P.amber],
  ] as const) {
    m.box(x, y, 1, x, y, 2, v(P.graphite));
    m.box(x, y, 3, x, y, 4, v(vest));
    m.set(x, y, 5, v('#c9a27a'));
    m.set(x, y, 6, v(P.orange));
  }
  // Work lamps on posts at the corners of the yard.
  for (const [x, y] of [
    [13, 2],
    [42, 20],
    [20, 42],
  ] as const) {
    for (let z = 1; z <= 9; z++) m.set(x, y, z, v(P.steelLight));
    m.set(x, y, 10, LAMP);
  }
  return m;
}
