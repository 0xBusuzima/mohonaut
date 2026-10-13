import { afterEach, describe, expect, it, vi } from 'vitest';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe('the voxel rig sprites in the scene', () => {
  it('give nothing until the manifest and the image have loaded, then where to anchor it', async () => {
    const manifest = { 'rig-1': { w: 72, h: 98, ax: 36, ay: 76 } };
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: true, json: async () => manifest })),
    );
    class LoadedImage {
      src = '';
      complete = true;
      naturalWidth = 72;
    }
    vi.stubGlobal('Image', LoadedImage);
    const { voxelSprite } = await import('../src/game/pixel/voxel-sprites');
    expect(voxelSprite('rig-1')).toBeNull(); // asks for the manifest
    await new Promise((r) => setTimeout(r, 0));
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
        json: async () => ({ shack: { w: 4, h: 4, ax: 2, ay: 4 } }),
      })),
    );
    const made: { onload: (() => void) | null; complete: boolean }[] = [];
    class PendingImage {
      src = '';
      complete = false;
      naturalWidth = 0;
      onload: (() => void) | null = null;
      constructor() {
        made.push(this);
      }
    }
    vi.stubGlobal('Image', PendingImage);
    const { onVoxelArrive, voxelSettled, voxelSprite } =
      await import('../src/game/pixel/voxel-sprites');
    let calls = 0;
    const off = onVoxelArrive(() => {
      calls += 1;
    });
    voxelSprite('shack');
    await new Promise((r) => setTimeout(r, 0));
    expect(calls).toBe(1); // the manifest
    expect(voxelSprite('shack')).toBeNull(); // the image is still on its way
    expect(voxelSettled()).toBe(false);
    if (made[0] !== undefined) made[0].complete = true;
    made[0]?.onload?.();
    expect(calls).toBe(2);
    expect(voxelSettled()).toBe(true);
    off();
    if (made[0] !== undefined) made[0].complete = true;
    made[0]?.onload?.();
    expect(calls).toBe(2);
    expect(voxelSettled()).toBe(true);
  });
});
