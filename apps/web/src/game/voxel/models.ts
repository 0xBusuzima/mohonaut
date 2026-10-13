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
  // Derrick: four legs leaning in, girts every six voxels and a diagonal brace in each bay.
  const top = 32;
  const insetAt = (z: number) => Math.floor((z - 5) / 10);
  for (let z = 5; z <= top; z++) {
    const lo = 4 + insetAt(z);
    const hi = 11 - insetAt(z);
    for (const [x, y] of [
      [lo, lo],
      [hi, lo],
      [lo, hi],
      [hi, hi],
    ] as const)
      m.set(x, y, z, ORANGE);
    const k = (z - 5) % 6;
    const span = hi - lo;
    if (k === 0) {
      // A girt round all four faces.
      for (let i = lo; i <= hi; i++) {
        m.set(i, lo, z, ORANGE_DARK);
        m.set(i, hi, z, ORANGE_DARK);
        m.set(lo, i, z, ORANGE_DARK);
        m.set(hi, i, z, ORANGE_DARK);
      }
    } else {
      // One diagonal brace per face of the bay, alternating direction bay by bay.
      const bay = Math.floor((z - 5) / 6);
      const t = Math.round((k / 6) * span);
      const i = bay % 2 === 0 ? lo + t : hi - t;
      m.set(i, hi, z, ORANGE_DARK);
      m.set(hi, i, z, ORANGE_DARK);
      m.set(i, lo, z, ORANGE_DARK);
      m.set(lo, i, z, ORANGE_DARK);
    }
  }
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
