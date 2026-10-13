import { act, cleanup, render, screen } from '@testing-library/react';
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
  vi.unstubAllGlobals();
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

  it('re-fits to its own box in contained mode, and lets go of it on unmount', async () => {
    let refit: (() => void) | undefined;
    const watched: Element[] = [];
    let disconnected = 0;
    class Watcher {
      constructor(callback: () => void) {
        refit = callback;
      }
      observe(el: Element) {
        watched.push(el);
      }
      disconnect() {
        disconnected += 1;
      }
    }
    vi.stubGlobal('ResizeObserver', Watcher);
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
    const { PixelWorld } = await import('../src/game/pixel/PixelWorld');
    const { container, unmount } = render(
      <div>
        <PixelWorld contained model={{ pads: [], tankFill: 0 }} label="A drill site" />
      </div>,
    );
    const box = container.firstChild as HTMLElement;
    expect(watched).toEqual([box]);
    // The box is shown at 900 x 600 (it was 0 x 0): the scene takes its size.
    Object.defineProperty(box, 'clientWidth', { value: 900, configurable: true });
    Object.defineProperty(box, 'clientHeight', { value: 600, configurable: true });
    act(() => refit?.());
    const canvas = screen.getByRole('img', { name: 'A drill site' });
    const scale = Number.parseInt(canvas.style.width) / Number(canvas.getAttribute('width'));
    expect(Number(canvas.getAttribute('width'))).toBe(Math.ceil(900 / scale));
    expect(Number(canvas.getAttribute('height'))).toBe(Math.ceil(600 / scale));
    unmount();
    expect(disconnected).toBe(1);
  });
});
