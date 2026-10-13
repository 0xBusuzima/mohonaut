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
    expect(sprite?.img.src).toBe('/voxel/site-rig-1.png');
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
});
