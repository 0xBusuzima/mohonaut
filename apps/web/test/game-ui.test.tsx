import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { StratumNotice } from '../src/app/play/StratumNotice';

beforeEach(() => {
  window.localStorage.clear();
  // jsdom has no canvas; Foreman Mo just draws nothing here.
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('the new-stratum notice', () => {
  it('only notes the stratum on a first visit', () => {
    render(<StratumNotice depthMm={2_500_000n} />);
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(window.localStorage.getItem('mohonaut.stratum')).toBe('1');
  });

  it('announces a stratum reached since the last visit, once', () => {
    window.localStorage.setItem('mohonaut.stratum', '0');
    render(<StratumNotice depthMm={2_500_000n} />);
    expect(screen.getByRole('dialog', { name: 'New stratum' })).toBeTruthy();
    expect(screen.getByText('II: Sediment Cover')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Back to work' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(window.localStorage.getItem('mohonaut.stratum')).toBe('1');
  });

  it('stays quiet within the same stratum', () => {
    window.localStorage.setItem('mohonaut.stratum', '1');
    render(<StratumNotice depthMm={3_000_000n} />);
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});
