import { describe, expect, it } from 'vitest';
import { hex, rotaryRig, siteDiorama } from '../src/game/voxel/models';
import { Model, render } from '../src/game/voxel/render';
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
      // The moon straight overhead: the roof shades all the floor under it.
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
});
