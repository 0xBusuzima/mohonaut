import { act, cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ForemanMo } from '../src/game/pixel/ForemanMo';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('Foreman Mo', () => {
  it('redraws only when he blinks or his lamp glint changes', () => {
    vi.useFakeTimers();
    let clears = 0;
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
      clearRect: () => {
        clears += 1;
      },
      fillRect: () => undefined,
      fillStyle: '',
    } as unknown as CanvasRenderingContext2D);
    render(<ForemanMo label="Foreman Mo" />);
    expect(clears).toBe(1);
    // 8 ticks (1.2 s): the glint goes off once and comes back once.
    act(() => {
      vi.advanceTimersByTime(8 * 150);
    });
    expect(clears).toBe(3);
  });
});
