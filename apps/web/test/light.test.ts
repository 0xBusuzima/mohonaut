import { afterEach, describe, expect, it, vi } from 'vitest';
import { night } from '../src/game/pixel/light';
import type { Light } from '../src/game/pixel/light';

/** A 2D context that only counts what the light code asks of it. */
function fakeContext() {
  const calls = { clearRect: 0, drawImage: 0 };
  const ctx = {
    calls,
    fillStyle: '',
    globalAlpha: 1,
    globalCompositeOperation: 'source-over',
    imageSmoothingEnabled: true,
    fillRect: () => {},
    clearRect: () => (calls.clearRect += 1),
    drawImage: () => (calls.drawImage += 1),
    createPattern: () => null,
  };
  return ctx;
}

afterEach(() => vi.restoreAllMocks());

describe('the night layer', () => {
  it('is repainted only when a light, the horizon or the size changes', () => {
    // Every offscreen layer canvas gets the same counting context.
    const layer = fakeContext();
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(
      layer as unknown as CanvasRenderingContext2D,
    );
    const screen = fakeContext() as unknown as CanvasRenderingContext2D;
    const lamps: Light[] = [{ x: 40, y: 60, r: 30, tint: '#ffd27a', power: 1 }];

    night(screen, 200, 120, 20, lamps);
    night(screen, 200, 120, 20, lamps);
    // A flicker too small to see (under one eighth) keeps the cached layer.
    night(screen, 200, 120, 20, [{ ...lamps[0], power: 0.97 } as Light]);
    expect(layer.calls.clearRect).toBe(1);

    night(screen, 200, 120, 20, [{ ...lamps[0], x: 41 } as Light]);
    expect(layer.calls.clearRect).toBe(2);
    night(screen, 200, 120, 22, [{ ...lamps[0], x: 41 } as Light]);
    expect(layer.calls.clearRect).toBe(3);
    night(screen, 240, 120, 22, [{ ...lamps[0], x: 41 } as Light]);
    expect(layer.calls.clearRect).toBe(4);
    // The layer is laid over the scene on every frame.
    expect((screen as unknown as { calls: { drawImage: number } }).calls.drawImage).toBe(6);
  });

  it('lays nothing over a screen of 0 pixels (a hidden box), and does not throw', () => {
    const layer = fakeContext();
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(
      layer as unknown as CanvasRenderingContext2D,
    );
    const screen = fakeContext();
    night(screen as unknown as CanvasRenderingContext2D, 0, 120, 20, []);
    night(screen as unknown as CanvasRenderingContext2D, 200, 0, 20, []);
    expect(screen.calls.drawImage).toBe(0);
    expect(layer.calls.clearRect).toBe(0);
  });
});

describe('the high-resolution night (the voxel scene)', () => {
  it('makes its layer as sharp as the screen and lays soft gradient pools, not dithered bands', () => {
    const made: HTMLCanvasElement[] = [];
    const create = document.createElement.bind(document);
    vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
      const el = create(tag);
      if (tag === 'canvas') made.push(el as HTMLCanvasElement);
      return el;
    });
    const gradients: string[] = [];
    const layer = {
      ...fakeContext(),
      setTransform: () => {},
      save: () => {},
      restore: () => {},
      translate: () => {},
      scale: () => {},
      createLinearGradient: () => ({ addColorStop: () => gradients.push('linear') }),
      createRadialGradient: () => ({ addColorStop: () => gradients.push('radial') }),
    };
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(
      layer as unknown as CanvasRenderingContext2D,
    );
    const screen = { ...fakeContext(), getTransform: () => ({ a: 3 }) };
    night(
      screen as unknown as CanvasRenderingContext2D,
      200,
      120,
      20,
      [{ x: 40, y: 60, r: 30, tint: '#ffd27a' }],
      true,
    );
    expect([made[0]?.width, made[0]?.height]).toEqual([600, 360]);
    expect(gradients).toContain('radial');
    expect(layer.calls.drawImage).toBe(0);
    expect(screen.calls.drawImage).toBe(1);
  });
});

describe('the site scene', () => {
  it('draws nothing into a box of 0 pixels and reports no hit areas', async () => {
    const { drawWorld } = await import('../src/game/pixel/world');
    const screen = fakeContext();
    const hits = drawWorld(screen as unknown as CanvasRenderingContext2D, 0, 0, 0, {
      pads: [],
      tankFill: 0,
      hover: null,
      motion: false,
      pan: { x: 0, y: 0 },
    });
    expect(hits).toEqual([]);
    expect(screen.calls.drawImage).toBe(0);
  });
});

describe('stratum shades', () => {
  it('lightens and darkens each channel, clamped', async () => {
    const { shade } = await import('../src/game/pixel/draw');
    expect(shade('#B08A5E', 1)).toBe('#b08a5e');
    expect(shade('#B08A5E', 0.5)).toBe('#58452f');
    expect(shade('#D8C8A0', 1.5)).toBe('#fffff0');
  });
});

describe("the bore's drone", () => {
  it('steps down a minor scale, one stratum at a time, an octave in all', async () => {
    const { droneHz } = await import('../src/game/audio');
    const { STRATA } = await import('@mohonaut/sdk');
    const hz = STRATA.map((_, i) => droneHz(i));
    expect(hz[0]).toBe(98);
    expect(hz.at(-1)).toBe(49);
    for (let i = 1; i < hz.length; i++) expect(hz[i]).toBeLessThan(hz[i - 1] ?? 0);
    expect(droneHz(99)).toBe(49);
  });
});
