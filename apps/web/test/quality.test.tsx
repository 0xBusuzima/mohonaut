import { act, cleanup, fireEvent, render, renderHook, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ErrorScreen } from '../src/components/ErrorScreen';
import { reportError, scrub } from '../src/lib/errors';
import { lowPowerByDefault, setLowPower, useLowPower } from '../src/lib/power';

afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

describe('low-power mode', () => {
  it('starts on for data saver and small devices only', () => {
    expect(lowPowerByDefault({ connection: { saveData: true }, hardwareConcurrency: 16 })).toBe(
      true,
    );
    expect(lowPowerByDefault({ deviceMemory: 2, hardwareConcurrency: 8 })).toBe(true);
    expect(lowPowerByDefault({ hardwareConcurrency: 2 })).toBe(true);
    expect(lowPowerByDefault({ hardwareConcurrency: 8, deviceMemory: 8 })).toBe(false);
    expect(lowPowerByDefault({})).toBe(false);
  });

  it('remembers the player choice and updates subscribers', () => {
    const { result } = renderHook(() => useLowPower());
    act(() => setLowPower(true));
    expect(result.current).toBe(true);
    expect(window.localStorage.getItem('mohonaut.lowPower')).toBe('on');
    act(() => setLowPower(false));
    expect(result.current).toBe(false);
  });
});

describe('error reporting', () => {
  it('removes wallet addresses from report text', () => {
    expect(
      scrub(
        'revert for 0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC at /s/0xabcdefabcdefabcdefabcdefabcdefabcdefabcd',
      ),
    ).toBe('revert for 0x… at /s/0x…');
  });

  it('does nothing without a DSN (no SDK download)', () => {
    expect(() => reportError(new Error('x'))).not.toThrow();
  });

  it('shows a calm error screen that can retry', () => {
    const reset = vi.fn();
    render(<ErrorScreen error={new Error('boom')} reset={reset} />);
    expect(screen.getByRole('alert').textContent).toContain('Your drill site is safe');
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(reset).toHaveBeenCalledOnce();
  });
});

describe('/play loading', () => {
  it('reconnects straight away only when a wallet was used here before', async () => {
    const { knownWallet } = await import('../src/app/play/PlayLoader');
    expect(knownWallet({ getItem: () => '"injected"' })).toBe(true);
    expect(knownWallet({ getItem: () => null })).toBe(false);
    expect(
      knownWallet({
        getItem: () => {
          throw new Error('blocked');
        },
      }),
    ).toBe(false);
  });
});
