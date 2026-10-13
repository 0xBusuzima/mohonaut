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
});
