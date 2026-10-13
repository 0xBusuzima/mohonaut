import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Guide } from '../src/app/play/Guide';
import { StratumNotice } from '../src/app/play/StratumNotice';
import type { GameState } from '../src/game/state';

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

const E18 = 10n ** 18n;
const NEW_SITE: GameState = {
  at: 1_791_900_000,
  network: {
    activeDp: 1_000n,
    hourEmission: 2_000n * E18,
    emitted: 0n,
    pausedUntil: 0,
    marketOpened: false,
    marketOpenTime: 1_791_990_000,
    genesisTime: 1_791_800_000,
    litresPerEth: 25_000n * E18,
    maxTankHours: 720,
  },
  rigs: [
    {
      id: 0,
      dp: 10n,
      burn: E18 / 4n,
      premiumBps: 0,
      minLevel: 0,
      generation: 1,
      price: 0n,
      owned: 1,
      active: 1,
    },
  ],
  player: {
    registered: true,
    level: 1,
    dp: 10n,
    burn: E18 / 4n,
    tank: 100n * E18,
    pending: 0n,
    scrapCredit: 0n,
    padsUsed: 1,
    walletMohn: 0n,
    siteUpgradePrice: null,
    refines: [],
  },
};
const WALLET = '0x000000000000000000000000000000000000dEaD';

describe("Foreman Mo's guide", () => {
  it('opens the window a tip points at and moves on', () => {
    const open = vi.fn();
    render(<Guide state={NEW_SITE} address={WALLET} open={open} />);
    expect(screen.getByRole('status').textContent).toContain('Equipment Market');
    fireEvent.click(screen.getByRole('button', { name: 'Equipment market' }));
    expect(open).toHaveBeenCalledWith('market');
    expect(screen.getByRole('status').textContent).toContain('World Bore');
  });

  it('remembers dismissed tips per wallet on the device', () => {
    const { unmount } = render(<Guide state={NEW_SITE} address={WALLET} open={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: 'Got it' }));
    unmount();
    render(<Guide state={NEW_SITE} address={WALLET} open={() => {}} />);
    expect(screen.getByRole('status').textContent).toContain('World Bore');
  });
});

describe('the diesel tank window', () => {
  const action = { run: () => Promise.resolve(true), busy: null };
  const withTank = (litres: bigint): GameState => ({
    ...NEW_SITE,
    player: NEW_SITE.player === null ? null : { ...NEW_SITE.player, tank: litres * E18 },
  });
  // After Market Open, so the tank holds its full 720 hours of fuel line (4,320 l at level 1).
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(1_792_000_000_000);
  });
  afterEach(() => vi.useRealTimers());
  const lit = (cls: string) =>
    [...screen.getByRole('meter').children].filter((s) => s.className.includes(cls)).length;

  it('shows a few litres in a big tank as one lit segment, amber while there is a day left', async () => {
    const { FuelWindow } = await import('../src/app/play/windows');
    // 24 l against a 4,320 l tank: under 1%, still a day and more of diesel for the Pilot Rig.
    render(<FuelWindow state={withTank(24n)} action={action} first={false} ethBalance={0n} />);
    expect(lit('bg-amber')).toBe(1);
    expect(lit('bg-alarm')).toBe(0);
    // 0.001 ETH buys 25 l: about 100 hours for the Pilot Rig's 0.25 l/h.
    expect(screen.getByText(/about 4\.2 days for your rigs/)).toBeTruthy();
    // The burn in ETH an hour (0.25 l/h at 25,000 l per ETH) and when the tank runs dry (96 h).
    expect(screen.getByText('0.25 ℓ/h ≈ 0.000010 ETH/h')).toBeTruthy();
    expect(screen.getByText(/^\d+ \w{3} \d\d:\d\d UTC \(≈ 96\.0 h\)$/)).toBeTruthy();
    // An empty wallet: said before the wallet opens.
    expect(screen.getByText(/more than your wallet holds/)).toBeTruthy();
    expect((screen.getByRole('button', { name: /Buy diesel/ }) as HTMLButtonElement).disabled).toBe(
      true,
    );
  });

  it('turns red under 12 hours of diesel', async () => {
    const { FuelWindow } = await import('../src/app/play/windows');
    render(<FuelWindow state={withTank(2n)} action={action} first={false} ethBalance={0n} />);
    expect(lit('bg-alarm')).toBe(1);
    // The value is read out in litres and hours, not as a rounded 0%.
    expect(screen.getByRole('meter').getAttribute('aria-valuetext')).toBe(
      '2.0 ℓ, about 8.0 h of diesel, running low',
    );
  });
});

describe('game windows', () => {
  it('keep focus in a field when the game re-renders, close on Esc, keep Tab inside', async () => {
    const { PxModal } = await import('../src/app/play/px');
    const closed = vi.fn();
    const ui = (n: number) => (
      <PxModal title="Diesel tank" onClose={() => closed(n)}>
        <input aria-label="ETH to spend" />
        <button type="button">Buy diesel</button>
      </PxModal>
    );
    const { rerender } = render(ui(1));
    const input = screen.getByLabelText('ETH to spend');
    input.focus();
    rerender(ui(2)); // a fresh onClose, as every state refresh gives
    expect(document.activeElement).toBe(input);

    const buy = screen.getByRole('button', { name: 'Buy diesel' });
    buy.focus();
    fireEvent.keyDown(window, { key: 'Tab' });
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Close' }));

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(closed).toHaveBeenCalledWith(2);
  });
});

describe('a window that breaks', () => {
  it('shows a note in that window only, and can be closed', async () => {
    const { WindowBoundary } = await import('../src/app/play/WindowBoundary');
    const onClose = vi.fn();
    // React logs the caught error; keep the test output clean.
    vi.spyOn(console, 'error').mockImplementation(() => {});
    function Broken(): never {
      throw new Error('unexpected answer');
    }
    render(
      <>
        <p>The site keeps running</p>
        <WindowBoundary onClose={onClose}>
          <Broken />
        </WindowBoundary>
      </>,
    );
    expect(screen.getByRole('alert').textContent).toContain('This window hit a snag');
    expect(screen.getByText('The site keeps running')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(onClose).toHaveBeenCalled();
  });
});
