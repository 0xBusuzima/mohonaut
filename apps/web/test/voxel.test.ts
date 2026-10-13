import { describe, expect, it } from 'vitest';
import {
  FENCE_VOXELS,
  GROUND_VOXELS,
  emptyPad,
  fenceBackModel,
  fenceFrontModel,
  generatorModel,
  lampModel,
  pipeRackModel,
  PAD_SIZES,
  containerModel,
  diamondCoreDrill,
  hex,
  pilotRig,
  plasmaBore,
  rotaryRig,
  shackModel,
  siteGround,
  tankerModel,
  siteDiorama,
  tankModel,
  topDrive,
  turbodrill,
} from '../src/game/voxel/models';
import { GW, siteDepth } from '../src/game/pixel/world';
import { Model, anchorOf, render } from '../src/game/voxel/render';
import type { Image } from '../src/game/voxel/render';

const GREY = { colour: [200, 200, 200] as const };

function pixel(img: Image, x: number, y: number): number[] {
  const i = (y * img.width + x) * 4;
  return [...img.data.slice(i, i + 4)];
}

/** The brightest opaque red value in a row band (for comparing faces). */
function brightest(img: Image, y0: number, y1: number): number {
  let best = 0;
  for (let y = y0; y < y1; y++)
    for (let x = 0; x < img.width; x++) {
      const [r = 0, , , a = 0] = pixel(img, x, y);
      if (a > 0) best = Math.max(best, r);
    }
  return best;
}

describe('the voxel renderer', () => {
  it('draws nothing for an empty model', () => {
    expect(render(new Model(), { scale: 4 })).toMatchObject({ width: 0, height: 0 });
  });

  it('draws one voxel as a lit top and two darker sides, in a 2s x 2s box', () => {
    const img = render(new Model().set(0, 0, 0, GREY), { scale: 4, occlusion: 0 });
    expect([img.width, img.height]).toEqual([8, 8]);
    const top = pixel(img, 4, 2);
    const left = pixel(img, 1, 5);
    const right = pixel(img, 6, 5);
    expect(top[3]).toBe(255);
    expect(top[0]).toBe(200);
    expect(left[0]).toBeLessThan(top[0] ?? 0);
    expect(right[0]).toBeLessThan(left[0] ?? 0);
    // The corners of the box stay transparent.
    expect(pixel(img, 0, 0)[3]).toBe(0);
  });

  it('darkens a floor next to a wall (ambient occlusion) and under an overhang (shadow)', () => {
    const open = render(new Model().box(0, 0, 0, 5, 5, 0, GREY), { scale: 4 });
    const walled = render(new Model().box(0, 0, 0, 5, 5, 0, GREY).box(0, 0, 1, 0, 5, 3, GREY), {
      scale: 4,
    });
    const roofed = render(
      new Model().box(0, 0, 0, 5, 5, 0, GREY).box(0, 0, 4, 5, 5, 4, { colour: [10, 10, 10] }),
      // The light straight overhead: the roof shades all the floor under it.
      { scale: 4, light: [0, 0, 1] },
    );
    const floor = (img: Image) => {
      let sum = 0;
      let n = 0;
      for (let i = 0; i < img.width * img.height; i++)
        if ((img.data[i * 4 + 3] ?? 0) > 0 && (img.data[i * 4] ?? 0) > 60) {
          sum += img.data[i * 4] ?? 0;
          n++;
        }
      return sum / n;
    };
    expect(floor(walled)).toBeLessThan(floor(open));
    expect(brightest(roofed, 0, roofed.height)).toBeLessThan(brightest(open, 0, open.height));
  });

  it('leaves glowing voxels unshaded and spreads a halo round them', () => {
    const lamp = { colour: [255, 210, 122] as const, emissive: true };
    const img = render(new Model().set(0, 0, 0, lamp), { scale: 4, bloom: 4 });
    expect(img.width).toBe(16); // the halo needs room
    // The right face keeps the lamp's own colour (no 0.6 side shade).
    expect(pixel(img, 4 + 6, 4 + 5)[0]).toBe(255);
    // Halo: a transparent pixel beside the voxel picks up some light.
    expect(pixel(img, 1, 8)[3]).toBeGreaterThan(0);
  });
});

describe('the voxel models', () => {
  it('reads colours from the palette', () => {
    expect(hex('#ff6b1a')).toEqual([255, 107, 26]);
  });

  it('builds the Rotary Rig on a hazard-striped pad, with a beacon on top', () => {
    const rig = rotaryRig();
    expect(rig.size).toBeGreaterThan(400);
    expect(rig.get(0, 0, 0)?.colour).toEqual(hex('#ff6b1a'));
    const tops = [...rig.entries()].filter(([, , , v]) => v.emissive === true);
    expect(Math.max(...tops.map(([, , z]) => z))).toBe(35);
  });

  it('cuts the diorama block to show the strata the rigs drill into, under an earth surface', () => {
    const site = siteDiorama();
    // The cut side: Regolith just under the surface, Granite Basement further down.
    expect(site.get(43, 20, -1)?.colour).toEqual(hex('#B08A5E'));
    expect(site.get(43, 20, -8)?.colour).toEqual(hex('#B79A9A'));
    // The rig stands on the surface, beacon and all; the lamps glow.
    expect(site.get(14, 14, 1)).toBeDefined();
    expect([...site.entries()].filter(([, , , v]) => v.emissive === true).length).toBeGreaterThan(
      4,
    );
  });

  it('builds all six rigs on hazard-striped pads, each with something lit, taller up the tiers', () => {
    const rigs = [
      pilotRig(),
      rotaryRig(),
      topDrive(),
      diamondCoreDrill(),
      turbodrill(),
      plasmaBore(),
    ];
    const height = (m: ReturnType<typeof pilotRig>) => Math.max(...m.entries().map(([, , z]) => z));
    for (const rig of rigs) {
      expect(rig.get(0, 0, 0)?.colour).toEqual(hex('#ff6b1a'));
      expect(rig.entries().some(([, , , vox]) => vox.emissive === true)).toBe(true);
    }
    // The derrick rigs grow with their tier.
    expect(height(rigs[0] ?? pilotRig())).toBeLessThan(height(rigs[1] ?? pilotRig()));
    expect(height(rigs[1] ?? pilotRig())).toBeLessThan(height(rigs[2] ?? pilotRig()));
    expect(height(rigs[2] ?? pilotRig())).toBeLessThan(height(rigs[4] ?? pilotRig()));
  });

  it('fits each in-game sprite to the 64-pixel pad, anchored at the pad top centre', () => {
    expect(PAD_SIZES).toHaveLength(6);
    const n = PAD_SIZES[1];
    const scale = 32 / n;
    const img = render(rotaryRig(), { scale });
    const [ax, ay] = anchorOf(img, n / 2, n / 2, 1, scale);
    // The pad spans 64 pixels across, centred on the anchor.
    expect(img.width).toBe(64);
    expect(ax).toBe(32);
    // The pad's near corner (n, n, 1) sits 16 pixels below its top centre.
    expect(anchorOf(img, n, n, 1, scale)[1] - ay).toBe(16);
  });

  it('builds the shack with its lit window and glowing core tray, and the open Market container', () => {
    const shack = shackModel();
    expect(shack.get(12, 9, 5)?.emissive).toBe(true); // the window on the right face
    expect(shack.get(5, 13, 5)?.emissive).toBe(true); // the cyan core tray on the left face
    // Both fit their footprints in the scene: 14 and 17 voxels across at most.
    const span = (m: ReturnType<typeof shackModel>) =>
      Math.max(...m.entries().map(([x, y]) => x + y)) -
      Math.min(...m.entries().map(([x, y]) => x + y));
    expect(span(shack)).toBeLessThanOrEqual(26);
    const box = containerModel();
    expect(box.get(15, 8, 3)?.colour).toEqual(hex('#0e1013')); // dark inside the open doors
    expect(span(box)).toBeLessThanOrEqual(30);
  });

  it('builds the diesel tank as a round steel cylinder with an orange band and a domed cap', () => {
    const tank = tankModel();
    expect(tank.get(6, 6, 13)?.colour).toEqual(hex('#ff6b1a'));
    expect(tank.get(6, 6, 17)).toBeDefined();
    expect(tank.get(0, 0, 5)).toBeUndefined(); // round: the footprint's corners stay empty
  });

  it('lays the site ground into the land at the scene grid: its surface top is z = 0, kerbed on the near edges', () => {
    // The scene's own site size (three pad rows), as gen-voxel bakes it.
    const ground = siteGround(GW, siteDepth(3));
    const W = GW * GROUND_VOXELS;
    const D = siteDepth(3) * GROUND_VOXELS;
    expect(ground.has(0, 0, -1)).toBe(true);
    expect(ground.has(0, 0, 0)).toBe(false);
    expect(ground.get(W, 5, -1)?.colour).toEqual(hex('#8b939c'));
    expect(ground.get(5, D, -1)?.colour).toEqual(hex('#8b939c'));
    // One grid cell is GROUND_VOXELS voxels of 16 / GROUND_VOXELS pixels: the scene's 32 x 16.
    const img = render(ground, { scale: 16 / GROUND_VOXELS });
    expect(anchorOf(img, GROUND_VOXELS, 0, 0, 16 / GROUND_VOXELS)[0] - img.origin[0]).toBe(16);
  });

  it('builds the small props: the empty pad, the generator, the lamp mast and the pipe rack', () => {
    expect(emptyPad().size).toBe(16 * 16);
    expect(generatorModel().has(5, 2, 9)).toBe(true); // the exhaust stack
    expect(
      lampModel()
        .entries()
        .filter(([, , , vox]) => vox.emissive === true),
    ).toHaveLength(2);
    // Three layers of pipe on two sleepers.
    const rack = pipeRackModel();
    expect(Math.max(...rack.entries().map(([, , z]) => z))).toBe(3);
    expect(rack.get(1, 0, 0)?.colour).toEqual(hex('#5e4330'));
  });

  it('runs the fence round the site at the scene grid, leaving the gate open on the left', () => {
    const k = FENCE_VOXELS;
    const back = fenceBackModel(GW);
    const front = fenceFrontModel(GW, siteDepth(3));
    // Posts every cell, rails between.
    expect(back.get(k, 0, 4)?.colour).toEqual(hex('#7b8692'));
    expect(back.get(k + 1, 0, 1)?.colour).toEqual(hex('#56606b'));
    // The gate: the left edge has no fence between rows 2 and 4.
    for (let y = 2 * k + 1; y < 4 * k; y++) {
      expect(back.has(0, y, 1)).toBe(false);
      expect(front.has(0, y, 1)).toBe(false);
    }
    expect(front.has(GW * k, siteDepth(3) * k, 4)).toBe(true); // the near corner post
  });

  it('builds the tanker nose first along x, with lit headlights and a round tank', () => {
    const tanker = tankerModel();
    expect(tanker.get(15, 0, 2)?.emissive).toBe(true);
    expect(tanker.get(15, 4, 2)?.emissive).toBe(true);
    expect(tanker.has(2, 0, 6)).toBe(false); // the tank's top corners are rounded off
    expect(tanker.get(4, 2, 3)?.colour).toEqual(hex('#ff6b1a'));
  });
});
