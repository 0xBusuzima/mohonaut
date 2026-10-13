import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const reported = vi.hoisted(() => ({ count: 0 }));
vi.mock('../src/lib/errors', () => ({
  reportError: () => {
    reported.count += 1;
  },
}));

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('the pixel world', () => {
  it('stops the scene once and reports a drawing error, keeping the page around it', async () => {
    // A context whose every paint fails, as a drawing bug would.
    const broken = new Proxy(
      {},
      {
        get: (_, key) =>
          key === 'canvas'
            ? document.createElement('canvas')
            : () => {
                throw new Error('drawing bug');
              },
        set: () => true,
      },
    );
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(
      broken as unknown as CanvasRenderingContext2D,
    );
    const { PixelWorld } = await import('../src/game/pixel/PixelWorld');
    const model = { pads: [{ typeId: 0, running: true }], tankFill: 0.5 };
    const { rerender } = render(
      <>
        <p>HUD</p>
        <PixelWorld model={model} label="A drill site" />
      </>,
    );
    // A new state from the chain redraws: the scene stays stopped, nothing is reported again.
    rerender(
      <>
        <p>HUD</p>
        <PixelWorld model={{ ...model, tankFill: 0.4 }} label="A drill site" />
      </>,
    );
    expect(reported.count).toBe(1);
    expect(screen.getByText('HUD')).toBeTruthy();
  });
});
