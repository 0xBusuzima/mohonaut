/**
 * Reserve-based hourly emission (docs/02 §3.1, §3.3).
 * Integer math identical to the contract and to sim/vectors/emission_hourly.json:
 * every division rounds down and the split remainder goes to the treasury.
 */

export const WAD = 10n ** 18n;

/** Hard cap: 100,000,000 MOHN with 18 decimals. */
export const CAP = 100_000_000n * WAD;

/** floor(1e18 · (1 − (1 − 0.0005)^(1/24))), i.e. the hourly share of the reserve. */
export const DELTA_H_WAD = 20_838_326_282_491n;

const BPS = 10_000n;
const MINERS_BPS = 9_000n;
const DEV_BPS = 500n;

export interface EmissionSplit {
  miners: bigint;
  dev: bigint;
  treasury: bigint;
}

/** Emission of the hour that starts with `reserve` in the reserve. */
export function hourlyEmission(reserve: bigint): bigint {
  if (reserve < 0n) throw new RangeError('reserve must be non-negative');
  return (reserve * DELTA_H_WAD) / WAD;
}

/** 90% miners / 5% dev / remainder treasury, so nothing is lost to rounding. */
export function splitEmission(emission: bigint): EmissionSplit {
  if (emission < 0n) throw new RangeError('emission must be non-negative');
  const miners = (emission * MINERS_BPS) / BPS;
  const dev = (emission * DEV_BPS) / BPS;
  return { miners, dev, treasury: emission - miners - dev };
}
