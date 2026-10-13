import { describe, expect, it } from 'vitest';
import { PLAQUE_ART, PLAQUE_PALETTES, plaqueTier } from '../src/index.js';

describe('season plaques', () => {
  it('are gold for first, silver for second and third, bronze to tenth', () => {
    expect([1, 2, 3, 4, 10].map(plaqueTier)).toEqual([
      'gold',
      'silver',
      'silver',
      'bronze',
      'bronze',
    ]);
  });

  it('are 12x12 pixel art in colours every tier defines', () => {
    expect(PLAQUE_ART).toHaveLength(12);
    for (const row of PLAQUE_ART) expect(row).toHaveLength(12);
    const keys = new Set(PLAQUE_ART.join('').replaceAll('.', ''));
    for (const palette of Object.values(PLAQUE_PALETTES))
      for (const k of keys) expect(palette[k]).toMatch(/^#[0-9a-f]{6}$/);
  });
});
