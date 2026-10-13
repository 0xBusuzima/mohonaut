/**
 * The other drillers' sites far off in the dark, as the voxel scene draws them (baked from
 * src/game/voxel/models.ts): a 24 x 24 voxel dirt pad, 1.5 art pixels a voxel, with one or two
 * small derricks. Shared by the model and the scene, which puts the derricks' beacons on their
 * crowns, without the renderer in the game's code.
 */
export const NEIGHBOUR_SIZE = 24;
export const NEIGHBOUR_SCALE = 1.5;

/** The derricks on neighbour site `seed` (1-6): voxel position on the pad and height. */
export function neighbourRigs(seed: number): { x: number; y: number; h: number }[] {
  const spots = [
    [11, 18],
    [15, 9],
  ] as const;
  return spots
    .slice(0, 1 + (seed % 2))
    .map(([x, y], k) => ({ x, y, h: 14 + ((seed + k) % 3) * 3 }));
}

/**
 * Where a derrick's beacon is, in the scene's art pixels, for a site whose pad has its back
 * corner (voxel 0, 0 on the ground) at (x, y).
 */
export function neighbourBeaconsAt(x: number, y: number, seed: number): { x: number; y: number }[] {
  const s = NEIGHBOUR_SCALE;
  return neighbourRigs(seed).map((r) => ({
    x: Math.round(x + (r.x - r.y) * s),
    y: Math.round(y + (r.x + r.y + 1) * (s / 2) - (r.h + 1) * s),
  }));
}
