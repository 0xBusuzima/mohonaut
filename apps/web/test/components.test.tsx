import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BoreLog, depthFraction } from '../src/components/BoreLog';
import { Button } from '../src/components/Button';
import { counterValue } from '../src/components/Counter';
import { Modal } from '../src/components/Modal';
import { TankGauge, secondsLeft, tankState } from '../src/components/TankGauge';
import { ToastProvider, useToast } from '../src/components/Toast';
import { formatDuration, formatEth, formatMohn, formatUnits18, formatUtc } from '../src/lib/format';

const E18 = 10n ** 18n;

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('formatting', () => {
  it('formats 18-decimal amounts, rounding down', () => {
    expect(formatUnits18(1_234_567n * 10n ** 15n)).toBe('1,234.56');
    expect(formatUnits18(0n, 0)).toBe('0');
    expect(formatUnits18(-15n * 10n ** 17n, 1)).toBe('-1.5');
    expect(formatMohn(1240n * E18)).toBe('1,240.00 MOHN');
    expect(formatEth(41n * 10n ** 13n)).toBe('0.00041 ETH');
  });

  it('formats durations and UTC times', () => {
    expect(formatDuration(3 * 86_400 + 4 * 3600)).toBe('3 d 4 h');
    expect(formatDuration(5 * 3600 + 12 * 60)).toBe('5 h 12 min');
    expect(formatDuration(30)).toBe('1 min');
    expect(formatUtc(1_792_015_200)).toBe('14 Oct 22:00 UTC');
  });
});

describe('Counter', () => {
  it('derives the live value from the formula', () => {
    const since = 1_000_000;
    expect(counterValue(100n * E18, 36n * E18, since, since * 1000)).toBe(100n * E18);
    // 36 MOHN/h for 10 s = 0.1 MOHN
    expect(counterValue(100n * E18, 36n * E18, since, since * 1000 + 10_000)).toBe(
      1001n * 10n ** 17n,
    );
    expect(counterValue(5n, 36n * E18, since, since * 1000 - 5000)).toBe(5n); // clock skew
  });
});

describe('BoreLog', () => {
  it('gives each stratum an equal band', () => {
    expect(depthFraction(0)).toBe(0);
    expect(depthFraction(1000)).toBeCloseTo(0.5 / 8, 10); // half of Regolith (0-2,000 m)
    expect(depthFraction(2000)).toBeCloseTo(1 / 8, 10);
    expect(depthFraction(12_262)).toBeCloseTo(3 / 8, 10); // the Kola Line opens stratum IV
    expect(depthFraction(35_000)).toBeCloseTo(5 / 8, 10); // the Moho Line opens stratum VI
    expect(depthFraction(1_000_000)).toBe(1);
  });

  it('describes itself and marks the current depth', () => {
    render(<BoreLog depthMm={1_184_000n} height={800} />);
    const log = screen.getByRole('img');
    expect(log.getAttribute('aria-label')).toBe(
      'World Bore 1,184 m, stratum I Regolith; next: Sediment Cover at 2,000 m',
    );
    const here = screen.getByTestId('bore-here');
    expect(Number(here.getAttribute('y1'))).toBeCloseTo(800 * (1184 / 2000 / 8) + 1, 6);
  });
});

describe('TankGauge', () => {
  it('reports running, low, empty and idle', () => {
    expect(secondsLeft(12n * E18, 12n * E18)).toBe(3600);
    expect(secondsLeft(1n, 0n)).toBeNull();
    expect(tankState(432n * E18, 12n * E18)).toBe('running');
    expect(tankState(9n * E18, 12n * E18)).toBe('low');
    expect(tankState(0n, 12n * E18)).toBe('empty');
    expect(tankState(5n * E18, 0n)).toBe('idle');
  });

  it('reads like a shift report', () => {
    render(
      <TankGauge
        tank={432n * E18}
        capacity={720n * E18}
        burnPerHour={12n * E18}
        now={1_792_015_200 - 36 * 3600}
      />,
    );
    expect(screen.getByText(/Tank:/).textContent).toBe(
      'Tank: 432.0 ℓ · burn 12.0 ℓ/h · runs until 14 Oct 22:00 UTC',
    );
    expect(screen.getByRole('meter').getAttribute('aria-valuenow')).toBe('60');
  });
});

describe('Button', () => {
  it('blocks clicks while busy', () => {
    const onClick = vi.fn();
    render(
      <Button busy onClick={onClick}>
        Buy fuel
      </Button>,
    );
    const button = screen.getByRole('button', { name: 'Buy fuel' });
    expect(button.getAttribute('aria-busy')).toBe('true');
    fireEvent.click(button);
    expect(onClick).not.toHaveBeenCalled();
  });
});

function ModalHarness() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        Open
      </button>
      <Modal open={open} onClose={() => setOpen(false)} title="Refine">
        <button type="button">First</button>
        <button type="button">Last</button>
      </Modal>
    </>
  );
}

describe('Modal', () => {
  it('traps focus, closes on Escape and returns focus', () => {
    render(<ModalHarness />);
    const opener = screen.getByRole('button', { name: 'Open' });
    opener.focus();
    fireEvent.click(opener);
    const dialog = screen.getByRole('dialog', { name: 'Refine' });
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    const close = screen.getByRole('button', { name: 'Close' });
    const last = screen.getByRole('button', { name: 'Last' });
    expect(document.activeElement).toBe(close); // first focusable
    last.focus();
    fireEvent.keyDown(document, { key: 'Tab' });
    expect(document.activeElement).toBe(close); // wraps forward
    fireEvent.keyDown(document, { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(last); // wraps backward
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.activeElement).toBe(opener);
  });
});

function ToastHarness() {
  const toast = useToast();
  return (
    <>
      <button type="button" onClick={() => toast({ title: 'Fuel bought' })}>
        Info
      </button>
      <button type="button" onClick={() => toast({ tone: 'alarm', title: 'Game paused' })}>
        Alarm
      </button>
    </>
  );
}

describe('Toast', () => {
  it('announces politely, alarms assertively, and keeps alarms until dismissed', () => {
    vi.useFakeTimers();
    render(
      <ToastProvider timeoutMs={1000}>
        <ToastHarness />
      </ToastProvider>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Info' }));
    fireEvent.click(screen.getByRole('button', { name: 'Alarm' }));
    expect(screen.getByRole('status').textContent).toContain('Fuel bought');
    const alert = screen.getByRole('alert');
    expect(alert.closest('[aria-live]')?.getAttribute('aria-live')).toBe('assertive');
    act(() => {
      vi.advanceTimersByTime(1500);
    });
    expect(screen.queryByRole('status')).toBeNull();
    expect(screen.getByRole('alert')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
    expect(screen.queryByRole('alert')).toBeNull();
  });
});
