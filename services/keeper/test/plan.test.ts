import { describe, expect, it } from 'vitest';
import {
  dailyRoom,
  dailyWindowOpen,
  marketOpenDue,
  median,
  pokeDue,
  priceDeviationBps,
  ranToday,
  withSlippage,
} from '../src/plan.js';

const H = 3600n;
const D = 86_400n;
const T = 20_000n * D; // a UTC midnight

describe('keeper decisions', () => {
  it('pokes only when an hour boundary passed since the last update', () => {
    expect(pokeDue(T + 10n, T)).toBe(false);
    expect(pokeDue(T + H, T + H - 1n)).toBe(true);
    expect(pokeDue(T + 5n * H + 7n, T + 2n * H)).toBe(true);
    expect(pokeDue(T, T + H)).toBe(false); // before genesis: lastUpdate is in the future
  });

  it('opens the market once its time has come', () => {
    expect(marketOpenDue(T, T + 1n, false)).toBe(false);
    expect(marketOpenDue(T + 1n, T + 1n, false)).toBe(true);
    expect(marketOpenDue(T + 9n, T + 1n, true)).toBe(false);
  });

  it('mirrors the contracts daily caps', () => {
    const base = { poolEth: 10n ** 20n, bps: 200n, now: T + 5n * H };
    // 2 % of 100 ETH = 2 ETH; spent yesterday does not count
    expect(dailyRoom({ ...base, day: T / D - 1n, usedInDay: 10n ** 18n })).toBe(2n * 10n ** 18n);
    expect(dailyRoom({ ...base, day: T / D, usedInDay: 5n * 10n ** 17n })).toBe(15n * 10n ** 17n);
    expect(dailyRoom({ ...base, day: T / D, usedInDay: 3n * 10n ** 18n })).toBe(0n);
  });

  it('runs daily jobs once per UTC day, after the configured hour', () => {
    expect(ranToday(T / D, 1n, T + H)).toBe(true);
    expect(ranToday(T / D, 0n, T + H)).toBe(false);
    expect(ranToday(T / D - 1n, 5n, T + H)).toBe(false);
    expect(dailyWindowOpen(T + 11n * H, 12)).toBe(false);
    expect(dailyWindowOpen(T + 12n * H, 12)).toBe(true);
  });

  it('applies slippage and measures price deviation on prices, not square roots', () => {
    expect(withSlippage(10_000n, 100n)).toBe(9_900n);
    const q = 100n * 2n ** 90n; // divisible by 100, so the ratios below are exact
    expect(priceDeviationBps(q, q)).toBe(0n);
    // sqrt price +5 % => price +10.25 %
    expect(priceDeviationBps((q * 105n) / 100n, q)).toBe(1025n);
    expect(priceDeviationBps((q * 95n) / 100n, q)).toBe(975n);
  });

  it('takes the lower median', () => {
    expect(median([])).toBeNull();
    expect(median([3n, 1n, 2n])).toBe(2n);
    expect(median([4n, 1n, 3n, 2n])).toBe(2n);
  });
});
