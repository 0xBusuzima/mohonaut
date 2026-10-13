import { afterEach, describe, expect, it, vi } from 'vitest';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe('the voxel rig sprites in the scene', () => {
  it('give nothing until the manifest and the image have loaded, then where to anchor it', async () => {
    const manifest = { 1: { w: 72, h: 98, ax: 36, ay: 76 } };
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
    const { voxelRig } = await import('../src/game/pixel/voxel-sprites');
    expect(voxelRig(1)).toBeNull(); // asks for the manifest
    await new Promise((r) => setTimeout(r, 0));
    const sprite = voxelRig(1);
    expect(sprite).toMatchObject({ ax: 36, ay: 76 });
    expect(sprite?.img.src).toBe('/voxel/site-rig-1.png');
    expect(voxelRig(9)).toBeNull(); // no such rig: the pixel drawing stays
  });

  it('keep the pixel rigs when the manifest is missing', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: false, json: async () => ({}) })),
    );
    const { voxelRig } = await import('../src/game/pixel/voxel-sprites');
    expect(voxelRig(1)).toBeNull();
    await new Promise((r) => setTimeout(r, 0));
    expect(voxelRig(1)).toBeNull();
  });
});
