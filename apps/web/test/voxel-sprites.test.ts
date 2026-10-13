import { afterEach, describe, expect, it, vi } from 'vitest';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

const tick = () => new Promise((r) => setTimeout(r, 0));

describe('the voxel rig sprites in the scene', () => {
  it('give nothing until the manifest is in and the image decoded, then where to anchor it', async () => {
    const manifest = { 'rig-1': { w: 72, h: 98, ax: 36, ay: 76 } };
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: true, json: async () => manifest })),
    );
    class DecodedImage {
      src = '';
      decode = () => Promise.resolve();
    }
    vi.stubGlobal('Image', DecodedImage);
    const { voxelSprite } = await import('../src/game/pixel/voxel-sprites');
    expect(voxelSprite('rig-1')).toBeNull(); // asks for the manifest
    await tick();
    expect(voxelSprite('rig-1')).toBeNull(); // asks for the image
    await tick();
    const sprite = voxelSprite('rig-1');
    expect(sprite).toMatchObject({ ax: 36, ay: 76 });
    expect(sprite?.img.src).toBe('/voxel/site-rig-1.webp');
    expect(voxelSprite('rig-9')).toBeNull(); // no such rig: the pixel drawing stays
  });

  it('keep the pixel rigs when the manifest is missing', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: false, json: async () => ({}) })),
    );
    const { voxelSprite } = await import('../src/game/pixel/voxel-sprites');
    expect(voxelSprite('rig-1')).toBeNull();
    await new Promise((r) => setTimeout(r, 0));
    expect(voxelSprite('rig-1')).toBeNull();
  });

  it('tell the scene when the manifest and each image arrive, until it stops listening', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        json: async () => ({
          shack: { w: 4, h: 4, ax: 2, ay: 4 },
          tank: { w: 4, h: 4, ax: 2, ay: 4 },
        }),
      })),
    );
    const decoding: { resolve: () => void; reject: () => void }[] = [];
    class PendingImage {
      src = '';
      decode = () =>
        new Promise<void>((resolve, reject) => {
          decoding.push({ resolve, reject });
        });
    }
    vi.stubGlobal('Image', PendingImage);
    const { onVoxelArrive, voxelSettled, voxelSprite } =
      await import('../src/game/pixel/voxel-sprites');
    let calls = 0;
    const off = onVoxelArrive(() => {
      calls += 1;
    });
    voxelSprite('shack');
    await tick();
    expect(calls).toBe(1); // the manifest
    expect(voxelSprite('shack')).toBeNull(); // the image is still decoding
    expect(voxelSettled()).toBe(false);
    decoding[0]?.resolve();
    await tick();
    expect(calls).toBe(2);
    expect(voxelSettled()).toBe(true);
    expect(voxelSprite('shack')).not.toBeNull();
    // A sprite that fails to decode settles too, and the pixel drawing stays.
    off();
    voxelSprite('tank');
    expect(voxelSettled()).toBe(false);
    decoding[1]?.reject();
    await tick();
    expect(calls).toBe(2);
    expect(voxelSettled()).toBe(true);
    expect(voxelSprite('tank')).toBeNull();
  });
});
