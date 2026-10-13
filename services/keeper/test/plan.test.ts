import { describe, expect, it } from 'vitest';
import {
  fitToBand,
  slotSpend,
  marketOpenDue,
  median,
  nearAnchor,
  pokeDue,
  priceDeviationBps,
  today,
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

  it('mirrors the contracts daily budgets: 1/7 of the bucket, fixed at the first spend', () => {
    const E = 10n ** 18n;
    const base = { bucket: 70n * E, bps: 1429n, now: T + 5n * H };
    // A new day: the budget comes from the bucket now; yesterday's spend does not count.
    expect(today({ ...base, day: T / D - 1n, budget: 3n * E, used: E })).toEqual({
      budget: (70n * E * 1429n) / 10_000n,
      used: 0n,
    });
    // The same day: the stored budget and spend, whatever the bucket did since.
    expect(today({ ...base, day: T / D, budget: 3n * E, used: E })).toEqual({
      budget: 3n * E,
      used: E,
    });
  });

  it('paces the budget over 8 three-hour slots in chunks that move the price about 2 %', () => {
    const E = 10n ** 18n;
    const base = { budget: 8n * E, used: 0n, bucket: 100n * E, poolEth: 1000n * E, chunks: 1n };
    expect(slotSpend({ ...base, now: T })).toBe(E); // slot 0: 1/8 of the budget
    expect(slotSpend({ ...base, used: E, now: T + 2n * H })).toBe(0n); // done this slot
    expect(slotSpend({ ...base, used: E, now: T + 9n * H })).toBe(3n * E); // slot 3 catches up
    // A small pool: one chunk is 0.99 % of its ETH (two for an addition).
    const small = { ...base, poolEth: 50n * E, now: T + 9n * H };
    expect(slotSpend(small)).toBe((50n * E * 99n) / 10_000n);
    expect(slotSpend({ ...small, chunks: 2n })).toBe((50n * E * 99n * 2n) / 10_000n);
    expect(slotSpend({ ...base, bucket: 5n, now: T + 23n * H })).toBe(5n); // at most the bucket
    expect(slotSpend({ ...base, used: 8n * E, now: T + 23n * H })).toBe(0n);
  });

  it('keeps keeper swaps inside the contracts price anchor band', () => {
    // A full chunk (~198 ticks) needs 198 + 10 ticks above anchor - 296; less room, less ETH.
    expect(fitToBand(1000n, 0, 0)).toBe(1000n);
    expect(fitToBand(1000n, -88, 0)).toBe(1000n);
    expect(fitToBand(1000n, -187, 0)).toBe((1000n * 99n) / 198n); // half the room
    expect(fitToBand(1000n, -286, 0)).toBe(0n);
    expect(fitToBand(1000n, -400, 0)).toBe(0n);
    expect(fitToBand(1000n, 5000, 0)).toBe(1000n); // MOHN below the anchor: buying is fine
    expect(nearAnchor(296, 0)).toBe(true);
    expect(nearAnchor(-296, 0)).toBe(true);
    expect(nearAnchor(297, 0)).toBe(false);
    expect(nearAnchor(-297, 0)).toBe(false);
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
