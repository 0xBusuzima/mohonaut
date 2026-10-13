/**
 * The baked voxel sprites (scripts/gen-voxel.mjs) for the scene, loaded on first use. Until an
 * image has loaded (or without a DOM) it gives null, and the scene draws the pixel drawing.
 */
interface Meta {
  w: number;
  h: number;
  /** The pad's top centre in the image. */
  ax: number;
  ay: number;
}

let manifest: Record<string, Meta> | null = null;
let asked = false;
const images = new Map<string, HTMLImageElement>();

/** A baked sprite by name ("rig-1", "shack", "container"), or null until it has loaded. */
export function voxelSprite(name: string): (Meta & { img: HTMLImageElement }) | null {
  if (typeof document === 'undefined' || typeof fetch === 'undefined') return null;
  if (manifest === null) {
    if (!asked) {
      asked = true;
      fetch('/voxel/manifest.json')
        .then((r) => (r.ok ? (r.json() as Promise<Record<string, Meta>>) : null))
        .then((m) => {
          manifest = m;
        })
        .catch(() => {
          // No sprites: the pixel drawings stay.
        });
    }
    return null;
  }
  const meta = manifest[name];
  if (meta === undefined) return null;
  let img = images.get(name);
  if (img === undefined) {
    img = new Image();
    img.src = `/voxel/site-${name}.png`;
    images.set(name, img);
  }
  return img.complete && img.naturalWidth > 0 ? { ...meta, img } : null;
}
