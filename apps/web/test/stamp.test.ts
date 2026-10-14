import { afterEach, describe, expect, it, vi } from 'vitest';
import { stamp } from '../src/game/pixel/draw';

afterEach(() => vi.restoreAllMocks());

describe('stamps (still drawings copied each frame)', () => {
  it('paint once per resolution, then copy to where they are asked for', () => {
    const scales: number[] = [];
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
      setTransform: (a: number) => scales.push(a),
    } as unknown as CanvasRenderingContext2D);
    const copies: number[][] = [];
    const screen = (res: number) =>
      ({
        getTransform: () => ({ a: res }),
        drawImage: (_: unknown, ...at: number[]) => copies.push(at),
      }) as unknown as CanvasRenderingContext2D;
    let paints = 0;
    const paint = () => {
      paints += 1;
    };
    stamp(screen(3), 'probe', 10.4, 20, [-2, -5, 8, 6], paint);
    stamp(screen(3), 'probe', 30, 40, [-2, -5, 8, 6], paint);
    expect(paints).toBe(1);
    expect(copies).toEqual([
      [8, 15, 8, 6],
      [28, 35, 8, 6],
    ]);
    // Another resolution (the screen was resized): painted again, as sharp as that screen.
    stamp(screen(2), 'probe', 30, 40, [-2, -5, 8, 6], paint);
    expect(paints).toBe(2);
    expect(scales).toEqual([3, 2]);
  });

  it('draw straight onto the screen where no canvas can be made', () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
    const at: number[][] = [];
    stamp({} as CanvasRenderingContext2D, 'bare', 5, 6, [0, 0, 1, 1], (_, x, y) => at.push([x, y]));
    expect(at).toEqual([[5, 6]]);
  });
});
